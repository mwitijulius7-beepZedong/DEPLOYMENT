#!/usr/bin/env node
/**
 * One-way migration: MongoDB (preferred) or the repo JSON snapshots -> Supabase.
 *
 * Usage:
 *   node scripts/migrate-to-supabase.js --dry-run
 *   node scripts/migrate-to-supabase.js
 *   node scripts/migrate-to-supabase.js --source=json
 *   node scripts/migrate-to-supabase.js --source=mongo
 *   node scripts/migrate-to-supabase.js --only=users,posts,comments
 *
 * The script is idempotent: every collection is upserted by id and stale rows
 * are removed, so it is safe to re-run after fixing data.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const store = require('../utils/supabaseStore');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceArg = (args.find(a => a.startsWith('--source=')) || '').split('=')[1] || 'auto';
const only = new Set(
  ((args.find(a => a.startsWith('--only=')) || '').split('=')[1] || '')
    .split(',').map(s => s.trim()).filter(Boolean)
);

function want(name) {
  return only.size === 0 || only.has(name);
}

function readJson(file, fallback) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    console.warn(`  ! could not parse ${file}: ${e.message}`);
    return fallback;
  }
}

async function tryMongo() {
  if (sourceArg === 'json') return null;
  const uri = process.env.PERSONALBLOG_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    if (sourceArg === 'mongo') throw new Error('No Mongo URI configured');
    return null;
  }
  try {
    const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000 });
    const db = client.db('blog');
    console.log('Source: MongoDB (connected)');
    return { client, db };
  } catch (e) {
    if (sourceArg === 'mongo') throw e;
    console.warn(`MongoDB unavailable (${e.message}); falling back to JSON snapshots.`);
    return null;
  }
}

async function mongoAll(db, collection) {
  return db.collection(collection).find({}).toArray();
}

function normalizePost(p) {
  const data = { ...p };
  if (!data.id && data._id) data.id = String(data._id);
  delete data._id;
  return data;
}

async function main() {
  const hasCreds = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY));
  if (!hasCreds && !dryRun) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }
  if (!hasCreds) console.log('No Supabase credentials found; dry run only.');

  const mongo = await tryMongo();
  if (!mongo) console.log('Source: repo JSON snapshots');
  console.log(dryRun ? 'Mode: DRY RUN (nothing will be written)\n' : 'Mode: write\n');

  const report = {};

  async function migrate(name, load, save) {
    if (!want(name)) return;
    try {
      const items = await load();
      const count = Array.isArray(items) ? items.length : Object.keys(items || {}).length;
      report[name] = { count, ok: true };
      console.log(`  ${name}: ${count}`);
      if (!dryRun) await save(items);
      if (!dryRun) {
        const saved = await store[`load${name[0].toUpperCase()}${name.slice(1)}`]?.();
        if (Array.isArray(saved)) report[name].verified = saved.length;
      }
    } catch (e) {
      report[name] = { ok: false, error: e.message };
      console.error(`  ! ${name}: ${e.message}`);
    }
  }

  // Users (stored as an object keyed by username)
  await migrate(
    'users',
    async () => {
      if (mongo) {
        const rows = await mongoAll(mongo.db, 'users');
        return Object.fromEntries(rows.map(u => [u.username, normalizePost(u)]));
      }
      const raw = readJson('users.json', {});
      const rows = Array.isArray(raw) ? raw : Object.values(raw);
      return Object.fromEntries(rows.filter(Boolean).map(u => [u.username || u.id, normalizePost(u)]));
    },
    users => store.saveUsers(users)
  ).catch(e => { report.users = { ok: false, error: e.message }; });

  // Posts
  await migrate(
    'posts',
    async () => (mongo ? (await mongoAll(mongo.db, 'posts')).map(normalizePost) : readJson('posts.json', []).map(normalizePost)),
    posts => store.savePosts(posts)
  );

  // Comments
  await migrate(
    'comments',
    async () => (mongo ? (await mongoAll(mongo.db, 'comments')).map(normalizePost) : readJson('comments.json', []).map(normalizePost)),
    comments => store.saveComments(comments)
  );

  // Categories
  await migrate(
    'categories',
    async () => (mongo ? (await mongoAll(mongo.db, 'categories')).map(normalizePost) : readJson('categories.json', []).map(normalizePost)),
    categories => store.saveCategories(categories)
  );

  // Newsletter subscriptions
  await migrate(
    'subscriptions',
    async () => (mongo ? (await mongoAll(mongo.db, 'subscriptions')).map(normalizePost) : readJson('subscriptions.json', []).map(normalizePost)),
    subscriptions => store.saveSubscriptions(subscriptions)
  );

  // Monthly themes
  await migrate(
    'themes',
    async () => (mongo ? (await mongoAll(mongo.db, 'themes')).map(normalizePost) : readJson('themes.json', []).map(normalizePost)),
    themes => store.saveThemes(themes)
  );

  // Template buyers
  await migrate(
    'templateBuyers',
    async () => (mongo ? (await mongoAll(mongo.db, 'template_buyers')).map(normalizePost) : readJson('template_buyers.json', []).map(normalizePost)),
    buyers => store.saveTemplateBuyers(buyers)
  );

  // Template applications
  await migrate(
    'templateApplications',
    async () => (mongo ? (await mongoAll(mongo.db, 'template_applications')).map(normalizePost) : readJson('template_applications.json', []).map(normalizePost)),
    apps => store.saveTemplateApplications(apps)
  );

  // MPesa transactions
  await migrate(
    'mpesaTransactions',
    async () => (mongo ? (await mongoAll(mongo.db, 'mpesa_transactions')).map(normalizePost) : readJson('mpesa_transactions.json', []).map(normalizePost)),
    transactions => store.saveMpesaTransactions(transactions)
  );

  // Settings (single object). The legacy app stored settings partly in
  // settings.json and partly as typed documents in the `settings` collection,
  // so build one merged object and let the newest source win.
  if (want('settings')) {
    try {
      let settings = readJson('settings.json', null) || {};
      if (mongo) {
        const doc = await mongo.db.collection('settings').findOne({ type: 'app' });
        if (doc && doc.data) settings = { ...settings, ...doc.data };

        const typed = ['background', 'theme', 'author', 'blog-info', 'blogInfo', 'security', 'socialCredentials', 'notifications', 'content', 'payment'];
        const docs = await mongo.db.collection('settings').find({ type: { $in: typed } }).toArray();
        for (const row of docs) {
          if (!row || !row.type) continue;
          if (row.type === 'background') {
            if (row.backgroundUrl !== undefined) settings.backgroundUrl = row.backgroundUrl;
            if (row.backgrounds !== undefined) settings.backgrounds = row.backgrounds;
          } else if (row.type === 'security') {
            const security = { ...(settings.security || {}) };
            if (row.adminEntryKeyHash !== undefined) security.adminEntryKeyHash = row.adminEntryKeyHash;
            if (row.adminEntryKeyEnc !== undefined) security.adminEntryKeyEnc = row.adminEntryKeyEnc;
            settings.security = security;
          } else if (row.type === 'blog-info' || row.type === 'blogInfo') {
            if (row.blogInfo !== undefined) settings.blogInfo = row.blogInfo;
          } else if (row[row.type] !== undefined) {
            settings[row.type] = row[row.type];
          }
        }
      }
      console.log(`  settings: ${Object.keys(settings).length} key(s)`);
      if (!dryRun && Object.keys(settings).length) await store.saveSettingsObject(settings);
      report.settings = { ok: true, count: Object.keys(settings).length };
    } catch (e) {
      report.settings = { ok: false, error: e.message };
      console.error(`  ! settings: ${e.message}`);
    }
  }

  // About
  if (want('about')) {
    try {
      let about = null;
      if (mongo) {
        const doc = await mongo.db.collection('about').findOne({ _id: 'about_data' });
        if (doc) {
          const rest = { ...doc };
          delete rest._id;
          about = rest;
        }
      }
      if (!about) about = readJson('about.json', null);
      console.log(`  about: ${about ? '1 object' : 'none'}`);
      if (!dryRun && about) await store.saveAbout(about);
      report.about = { ok: true, count: about ? 1 : 0 };
    } catch (e) {
      report.about = { ok: false, error: e.message };
      console.error(`  ! about: ${e.message}`);
    }
  }

  // Analytics
  if (want('analytics')) {
    try {
      let analytics = null;
      if (mongo) {
        const doc = await mongo.db.collection('analytics').findOne({ type: 'data' });
        if (doc && doc.data) analytics = doc.data;
      }
      if (!analytics) analytics = readJson('analytics.json', null);
      const counts = analytics
        ? {
          pageViews: (analytics.pageViews || []).length,
          postViews: (analytics.postViews || []).length,
          interactions: (analytics.interactions || []).length
        }
        : {};
      console.log(`  analytics: ${JSON.stringify(counts)}`);
      if (!dryRun && analytics) await store.saveAnalytics(analytics);
      report.analytics = { ok: true, count: counts };
    } catch (e) {
      report.analytics = { ok: false, error: e.message };
      console.error(`  ! analytics: ${e.message}`);
    }
  }

  // Security logs
  if (want('securityLogs')) {
    try {
      let logs = null;
      if (mongo) {
        const doc = await mongo.db.collection('security').findOne({ type: 'logs' });
        if (doc && Array.isArray(doc.logs)) logs = doc.logs;
      }
      if (!logs) logs = readJson('security_logs.json', null);
      console.log(`  securityLogs: ${logs ? logs.length : 0}`);
      if (!dryRun && logs) await store.saveSecurityLogs(logs);
      report.securityLogs = { ok: true, count: logs ? logs.length : 0 };
    } catch (e) {
      report.securityLogs = { ok: false, error: e.message };
      console.error(`  ! securityLogs: ${e.message}`);
    }
  }

  // Password reset tokens
  if (want('resetTokens')) {
    try {
      let tokens = null;
      if (mongo) {
        const doc = await mongo.db.collection('reset_tokens').findOne({ type: 'tokens' });
        if (doc && doc.tokens) tokens = doc.tokens;
      }
      if (!tokens) {
        const raw = readJson('reset_tokens.json', null);
        tokens = raw && raw.tokens ? raw.tokens : raw;
      }
      console.log(`  resetTokens: ${tokens ? Object.keys(tokens).length : 0}`);
      if (!dryRun && tokens) await store.saveResetTokens(tokens);
      report.resetTokens = { ok: true, count: tokens ? Object.keys(tokens).length : 0 };
    } catch (e) {
      report.resetTokens = { ok: false, error: e.message };
      console.error(`  ! resetTokens: ${e.message}`);
    }
  }

  if (mongo) await mongo.client.close();

  console.log('\nReport:');
  console.log(JSON.stringify(report, null, 2));

  const failed = Object.entries(report).filter(([, value]) => !value.ok);
  if (failed.length) {
    console.error(`\n${failed.length} collection(s) failed. Fix the errors above and re-run.`);
    process.exitCode = 1;
  } else if (dryRun) {
    console.log('\nDry run complete. Nothing was written. Re-run without --dry-run to migrate.');
  } else {
    console.log('\nMigration complete. Verify the row counts in Supabase, then set DATA_BACKEND=supabase (or leave unset).');
  }
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
