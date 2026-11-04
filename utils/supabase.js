const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let client = null;

/**
 * Supabase is enabled when a project URL and a server-side key are present.
 * `DATA_BACKEND=mongo` or `DATA_BACKEND=file` forces the legacy paths, which
 * keeps the migration reversible without deleting any code.
 */
function isSupabaseEnabled() {
  const backend = String(process.env.DATA_BACKEND || '').toLowerCase();
  if (backend === 'mongo' || backend === 'file') return false;
  return Boolean(
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)
  );
}

function getSupabase() {
  if (!isSupabaseEnabled()) return null;
  if (!client) {
    const url = String(process.env.SUPABASE_URL).replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-application-name': 'birthday-blog' } }
    });
  }
  return client;
}

function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
}

function unwrap({ data, error }) {
  if (error) {
    const err = new Error(error.message || 'Supabase request failed');
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return data;
}

function sanitizeFilename(name) {
  return path.basename(String(name || 'file'))
    .replace(/[^a-z0-9.\-_]/gi, '_')
    .slice(0, 180);
}

/**
 * Upload a buffer to the public Supabase Storage bucket and return the public
 * URL plus the stored object path.
 */
async function uploadToSupabaseStorage(buffer, filename, contentType, folder = 'blog') {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const bucket = getStorageBucket();
  const safe = sanitizeFilename(filename);
  const objectPath = folder ? `${folder.replace(/^\/+|\/+$/g, '')}/${safe}` : safe;

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: contentType || 'application/octet-stream',
    cacheControl: '31536000',
    upsert: false
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return { url: data.publicUrl, filename: objectPath };
}

/**
 * Recursively list objects in the public bucket. Folder entries are walked,
 * file entries are returned with their public URL.
 */
async function listSupabaseStorage(prefix = '') {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const bucket = getStorageBucket();
  const files = [];

  async function walk(dir) {
    const { data, error } = await supabase.storage.from(bucket).list(dir, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw new Error(`Supabase Storage list failed: ${error.message}`);
    for (const entry of data || []) {
      const fullPath = dir ? `${dir}/${entry.name}` : entry.name;
      if (!entry.metadata) {
        await walk(fullPath);
        continue;
      }
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fullPath);
      files.push({
        name: entry.name,
        path: fullPath,
        url: publicData.publicUrl,
        size: entry.metadata.size,
        contentType: entry.metadata.mimetype
      });
    }
  }

  await walk(prefix);
  return files;
}

/**
 * Delete an object by its public URL, or by its bucket-relative path.
 */
async function deleteFromSupabaseStorage(urlOrPath) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const bucket = getStorageBucket();

  let objectPath = String(urlOrPath || '').trim();
  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const markerIndex = objectPath.indexOf(publicMarker);
  if (markerIndex >= 0) {
    objectPath = objectPath.slice(markerIndex + publicMarker.length);
  } else if (/^https?:\/\//i.test(objectPath)) {
    const parsed = new URL(objectPath);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const bucketIndex = parts.indexOf(bucket);
    if (bucketIndex >= 0) objectPath = parts.slice(bucketIndex + 1).join('/');
  }
  objectPath = decodeURIComponent(objectPath.replace(/^\/+/, ''));
  if (!objectPath) throw new Error('Invalid Supabase Storage path');

  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
  return objectPath;
}

module.exports = {
  isSupabaseEnabled,
  getSupabase,
  getStorageBucket,
  unwrap,
  uploadToSupabaseStorage,
  listSupabaseStorage,
  deleteFromSupabaseStorage
};
