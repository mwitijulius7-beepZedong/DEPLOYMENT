# Supabase setup and migration

The app keeps its existing auth (bcrypt/JWT, sessions, Google Sign-In, admin
keys) and API response shapes. Supabase replaces two things:

- **Database** — Postgres tables instead of MongoDB / Vercel KV / JSON files.
- **File storage** — a public Storage bucket instead of Cloudinary / Vercel Blob
  / local `uploads/`.

Supabase is used automatically when `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set. If either is missing, the app falls back to
the legacy backends, so you can deploy this change before the project is ready.

## 1. Create the project

1. Create a project at <https://supabase.com/dashboard>.
2. Open **SQL Editor → New query**, paste the contents of
   [`schema.sql`](./schema.sql), and run it. It creates the tables, indexes,
   RLS policies, and the public `uploads` bucket. It is safe to run again.
3. Open **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only secret)
   - `anon` key → `SUPABASE_ANON_KEY` (only if a browser needs it)

Add them to `.env` locally and to the Vercel project's Environment Variables.
Do not commit `.env`.

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_STORAGE_BUCKET=uploads
```

## 2. Migrate existing data

The migration is idempotent: each collection is upserted by `id` and rows that
no longer exist at the source are removed. Re-running it is safe.

```powershell
# Preview only
node scripts/migrate-to-supabase.js --dry-run

# Migrate everything
node scripts/migrate-to-supabase.js

# Only some collections
node scripts/migrate-to-supabase.js --only=users,posts,comments

# Use the repo JSON snapshots even if MongoDB is reachable
node scripts/migrate-to-supabase.js --source=json
```

Source selection:

- `--source=auto` (default): MongoDB when it connects, otherwise
  `users.json`, `posts.json`, etc. in the repo root.
- `--source=mongo`: fail if MongoDB cannot be reached.
- `--source=json`: always use the JSON snapshots.

The script prints a per-collection report at the end. Compare those counts with
the source before switching traffic over.

### Existing local uploads

Files in `uploads/` are still referenced as `/uploads/<name>` in older posts and
settings. Copy them into Storage and rewrite those references with:

```powershell
node scripts/migrate-uploads-to-supabase.js --dry-run
node scripts/migrate-uploads-to-supabase.js
```

This uploads each file to `<bucket>/uploads/<name>` (upsert, so re-running is
safe), then rewrites matching references in the JSON snapshots and in the
Supabase rows. References whose file is missing locally are reported and left
alone. Flags: `--folder=<name>` changes the Storage folder, `--skip-json` or
`--skip-db` limits where references are rewritten.

## 3. Verify

Start the app and log in to the admin area. Useful checks:

```powershell
node --check server.js
npm test
```

- `GET /api/admin/data-backend` (admin only) returns the active backend and row
  counts when Supabase is enabled.
- Create/edit a post, add a comment, change a setting, and upload an image.
  Confirm new rows in the Supabase table editor and new objects in Storage.

## Rollback

Set `DATA_BACKEND=mongo` (Mongo → KV → JSON) or `DATA_BACKEND=file`
(KV → JSON) and restart. No data is deleted from the legacy stores, so this is
immediately reversible. Drop the Supabase tables only when you no longer need
them.

## How the schema maps to the app

Every table stores the original application object in a `data jsonb` column and
mirrors the fields used for sorting/filtering into real columns (`date`,
`post_id`, `email`, etc.). Reads merge the mirrored `id` back into the object, so
the frontend keeps seeing the same JSON it saw from MongoDB.

| Legacy collection / key | Supabase table |
| --- | --- |
| `users` | `users` |
| `posts` | `posts` |
| `comments` | `comments` |
| `categories` | `categories` |
| `subscriptions` | `subscriptions` |
| `themes` | `themes` |
| `template_buyers` | `template_buyers` |
| `template_applications` | `template_applications` |
| `mpesa_transactions` | `mpesa_transactions` |
| `settings` (all typed docs) | `settings` (`type = 'app'`) |
| `about` | `app_state` (`key = 'about'`) |
| `security` / `security_logs` | `app_state` (`key = 'security_logs'`) |
| `reset_tokens` | `app_state` (`key = 'reset_tokens'`) |
| `analytics` | `analytics_events` |
| uploads | Storage bucket `uploads` |

RLS is enabled on every table with no policies, so only the `service_role` key
(used by the server) can read or write. The `uploads` bucket is public for reads
because the blog displays uploaded images directly.

## Notes and known limitations

- Sessions still use Vercel KV / MemoryStore. They are independent of this
  migration. Supabase Auth and a Postgres session store are a separate phase.
- Admin keys and the admin entry key are encrypted with `SESSION_SECRET`. Keep
  the same `SESSION_SECRET` after migrating, or those stored keys can no longer
  be decrypted.
- `readSettings`/`writeSettings` are now async and read from Supabase first with
  a 5-second in-process cache.
- Uploads go to Supabase Storage when configured. If an upload fails, the
  request fails; it does not silently fall back to Cloudinary.
- The upload endpoint allows files up to 100 MB, but the Supabase free plan caps
  objects at 50 MB. Raise the project's storage limit or lower `MAX_BYTES` in
  `server.js` if you expect large videos.
