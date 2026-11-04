#!/usr/bin/env node
/**
 * One-off: copy files from the local `uploads/` folder into Supabase Storage and
 * rewrite `/uploads/<name>` references (JSON snapshots and database rows) to the
 * public Storage URLs.
 *
 * Usage:
 *   node scripts/migrate-uploads-to-supabase.js --dry-run
 *   node scripts/migrate-uploads-to-supabase.js
 *   node scripts/migrate-uploads-to-supabase.js --folder=uploads
 *   node scripts/migrate-uploads-to-supabase.js --skip-json
 *   node scripts/migrate-uploads-to-supabase.js --skip-db
 *
 * Re-running is safe: objects are upserted and only strings that still point at
 * `/uploads/...` are rewritten. References whose file is missing locally are
 * reported but left untouched.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const store = require('../utils/supabaseStore');

const ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipJson = args.includes('--skip-json');
const skipDb = args.includes('--skip-db');
const folder = ((args.find(a => a.startsWith('--folder=')) || '').split('=')[1] || 'uploads')
  .replace(/^\/+|\/+$/g, '');

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime'
};

// Matches `/uploads/<file>` with an optional absolute origin in front.
const UPLOAD_REF_RE = /(?:https?:\/\/[^\s"'<>()]+?)?\/uploads\/([^\s"'<>()]+)/g;

const JSON_FILES = [
  'users.json',
  'posts.json',
  'comments.json',
  'categories.json',
  'themes.json',
  'about.json',
  'settings.json',
  'template_buyers.json',
  'template_applications.json'
];

const COLLECTIONS = [
  ['posts', 'loadPosts', 'savePosts'],
  ['comments', 'loadComments', 'saveComments'],
  ['categories', 'loadCategories', 'saveCategories'],
  ['themes', 'loadThemes', 'saveThemes'],
  ['users', 'loadUsers', 'saveUsers'],
  ['about', 'loadAbout', 'saveAbout'],
  ['settings', 'loadSettingsObject', 'saveSettingsObject'],
  ['templateBuyers', 'loadTemplateBuyers', 'saveTemplateBuyers'],
  ['templateApplications', 'loadTemplateApplications', 'saveTemplateApplications']
];

function storageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
}

function encodePath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

function publicUrlFor(objectPath) {
  if (!process.env.SUPABASE_URL) return null;
  const base = String(process.env.SUPABASE_URL).replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${encodeURIComponent(storageBucket())}/${encodePath(objectPath)}`;
}

function collectLocalFiles() {
  if (!fs.existsSync(UPLOADS_DIR)) return [];
  return fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
    .map(entry => ({
      name: entry.name,
      fullPath: path.join(UPLOADS_DIR, entry.name),
      size: fs.statSync(path.join(UPLOADS_DIR, entry.name)).size
    }));
}

/**
 * Walk any JSON value, rewrite matching upload references, and count changes.
 * `urlByBasename` maps a local filename to its Supabase public URL.
 */
function rewriteValue(value, urlByBasename, stats) {
  if (typeof value === 'string') {
    return value.replace(UPLOAD_REF_RE, (match) => {
      if (match.includes('/storage/v1/object/public/')) return match;

      const tail = match.match(/\/uploads\/([^]*)$/);
      if (!tail) return match;

      let reference = tail[1];
      let suffix = '';
      const suffixAt = reference.search(/[?#]/);
      if (suffixAt >= 0) {
        suffix = reference.slice(suffixAt);
        reference = reference.slice(0, suffixAt);
      }

      let basename;
      try {
        basename = decodeURIComponent(reference.split('/').pop());
      } catch {
        basename = reference.split('/').pop();
      }

      const url = urlByBasename.get(basename);
      if (!url) {
        stats.unmatched.add(basename);
        return match;
      }
      stats.rewrites += 1;
      return url + suffix;
    });
  }

  if (Array.isArray(value)) {
    return value.map(item => rewriteValue(item, urlByBasename, stats));
  }

  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = rewriteValue(item, urlByBasename, stats);
    }
    return out;
  }

  return value;
}

function readJsonFile(name) {
  const full = path.join(ROOT, name);
  if (!fs.existsSync(full)) return null;
  try {
    return { full, data: JSON.parse(fs.readFileSync(full, 'utf8')) };
  } catch (e) {
    console.warn(`  ! could not parse ${name}: ${e.message}`);
    return null;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL must be set in .env');
  }
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  if (!dryRun && !hasKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) must be set in .env');
  }

  // The storage/data helpers respect DATA_BACKEND, but this script always talks
  // to Supabase, so ignore a legacy override for this process only.
  if (['mongo', 'file'].includes(String(process.env.DATA_BACKEND || '').toLowerCase())) {
    console.warn(`Ignoring DATA_BACKEND=${process.env.DATA_BACKEND} for this migration run.`);
    process.env.DATA_BACKEND = '';
  }

  const bucket = storageBucket();
  const files = collectLocalFiles();
  console.log(`Local uploads: ${files.length} file(s) in ${UPLOADS_DIR}`);
  console.log(`Storage target: bucket "${bucket}", folder "${folder}"`);
  console.log(dryRun ? 'Mode: DRY RUN (nothing will be written)\n' : 'Mode: write\n');

  const urlByBasename = new Map();
  const failures = [];

  for (const file of files) {
    const objectPath = folder ? `${folder}/${file.name}` : file.name;
    const url = publicUrlFor(objectPath);
    urlByBasename.set(file.name, url);

    if (dryRun) {
      console.log(`  would upload ${file.name} (${file.size} bytes) -> ${objectPath}`);
      continue;
    }

    const supabase = require('../utils/supabase').getSupabase();
    if (!supabase) throw new Error('Could not create the Supabase client');

    const contentType = CONTENT_TYPES[path.extname(file.name).toLowerCase()] || 'application/octet-stream';
    const { error } = await supabase.storage.from(bucket).upload(objectPath, fs.readFileSync(file.fullPath), {
      contentType,
      cacheControl: '31536000',
      upsert: true
    });

    if (error) {
      failures.push({ file: file.name, error: error.message });
      urlByBasename.delete(file.name);
      console.error(`  ! ${file.name}: ${error.message}`);
    } else {
      console.log(`  uploaded ${file.name} -> ${objectPath}`);
    }
  }

  // ── Rewrite references in the repo JSON snapshots ──────────────────────────
  if (!skipJson) {
    console.log('\nRewriting JSON snapshots:');
    for (const name of JSON_FILES) {
      const loaded = readJsonFile(name);
      if (!loaded) continue;

      const stats = { rewrites: 0, unmatched: new Set() };
      const rewritten = rewriteValue(loaded.data, urlByBasename, stats);
      if (stats.rewrites === 0) {
        console.log(`  ${name}: unchanged`);
      } else if (dryRun) {
        console.log(`  ${name}: would replace ${stats.rewrites} reference(s)`);
      } else {
        fs.writeFileSync(loaded.full, JSON.stringify(rewritten, null, 2));
        console.log(`  ${name}: replaced ${stats.rewrites} reference(s)`);
      }
      if (stats.unmatched.size) {
        console.log(`    unmatched: ${Array.from(stats.unmatched).join(', ')}`);
      }
    }
  }

  // ── Rewrite references in the Supabase database ────────────────────────────
  if (!skipDb && hasKey) {
    console.log('\nRewriting database rows:');
    for (const [label, loadName, saveName] of COLLECTIONS) {
      let before;
      try {
        before = await store[loadName]();
      } catch (e) {
        console.warn(`  ! ${label}: could not load (${e.message})`);
        continue;
      }
      if (before === null || before === undefined) {
        console.log(`  ${label}: empty`);
        continue;
      }

      const stats = { rewrites: 0, unmatched: new Set() };
      const after = rewriteValue(before, urlByBasename, stats);
      const changed = JSON.stringify(before) !== JSON.stringify(after);

      if (!changed) {
        console.log(`  ${label}: unchanged`);
      } else if (dryRun) {
        console.log(`  ${label}: would replace ${stats.rewrites} reference(s)`);
      } else {
        await store[saveName](after);
        console.log(`  ${label}: replaced ${stats.rewrites} reference(s)`);
      }
      if (stats.unmatched.size) {
        console.log(`    unmatched: ${Array.from(stats.unmatched).join(', ')}`);
      }
    }
  } else if (!skipDb) {
    console.log('\nSkipping database rewrite: no Supabase key available (dry run).');
  }

  if (failures.length) {
    console.error(`\n${failures.length} upload(s) failed. References to those files were not rewritten.`);
    process.exitCode = 1;
  } else if (dryRun) {
    console.log('\nDry run complete. Nothing was written. Re-run without --dry-run to apply.');
  } else {
    console.log('\nDone. Verify the objects in Supabase Storage and the rewritten URLs on the site.');
  }
}

main().catch((error) => {
  console.error(`\nUploads migration failed: ${error.message}`);
  process.exitCode = 1;
});
