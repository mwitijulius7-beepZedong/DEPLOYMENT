#!/usr/bin/env node
/**
 * Backup: dump every Supabase table to local JSON snapshots.
 *
 * Usage:
 *   node scripts/backup-from-supabase.js            # -> backups/<timestamp>/
 *   node scripts/backup-from-supabase.js --out=backups/latest
 *
 * Tables are dumped via the REST API using SUPABASE_SERVICE_ROLE_KEY.
 * Output is one UTF-8 JSON file per table, raw rows included as stored.
 *
 * Paging uses limit/offset on the table's unique column so every row is
 * visited exactly once even beyond Supabase's 1000-row response cap.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const outArg = (args.find(a => a.startsWith('--out=')) || '').split('=')[1] || '';

const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const TABLES = [
  'users',
  'posts',
  'comments',
  'categories',
  'subscriptions',
  'themes',
  'template_buyers',
  'template_applications',
  'mpesa_transactions',
  'settings',
  'app_state',
  'analytics_events'
];

// Unique column per table: paging needs a stable, deterministic order.
// Data tables use `id`; settings is keyed by `type`; app_state by `key`.
const ORDER_COLUMN = new Map(
  TABLES.map(table => [table, table === 'app_state' ? 'key' : table === 'settings' ? 'type' : 'id'])
);

// Supabase caps a single response at 1000 rows.
const PAGE_SIZE = 1000;

function slug(name) {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
}

async function dumpTable(table) {
  const order = ORDER_COLUMN.get(table);
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const qs = `?select=*&order=${order}.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(`${url}/rest/v1/${table}${qs}`, {
      headers: { apikey: key }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} for ${table}: ${body.slice(0, 200)}`);
    }
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  // --out takes a plain directory name under backups/ (no nesting, no slug surprises).
  const rawOut = outArg.replace(/^backups[/\\]+/, '').replace(/[^a-z0-9_-]+/gi, '-');
  const stamp = rawOut || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(__dirname, '..', 'backups', slug(stamp) || stamp);
  fs.mkdirSync(dir, { recursive: true });

  console.log(`Backup target: ${dir}`);
  const manifest = { created: new Date().toISOString(), tables: {} };

  // Dump all tables concurrently; each writes its own file.
  const results = await Promise.allSettled(TABLES.map(async (table) => {
    const rows = await dumpTable(table);
    const file = path.join(dir, `${table}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
    return { table, rows: rows.length, file: path.basename(file) };
  }));

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { table, rows, file } = result.value;
      manifest.tables[table] = rows;
      console.log(`  ${table}: ${rows} row(s) -> ${file}`);
    } else {
      const message = result.reason.message;
      manifest.errors = (manifest.errors || []).concat(message);
      console.error(`  ! ${message}`);
      process.exitCode = 1;
    }
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const failed = Boolean(manifest.errors);
  console.log(failed ? '\nBackup finished WITH ERRORS (see above).' : '\nBackup complete.');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
