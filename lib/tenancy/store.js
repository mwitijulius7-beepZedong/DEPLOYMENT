const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isSupabaseEnabled, getSupabase } = require('../../utils/supabase');
const { getMongoDB } = require('../../utils/storage');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..');
const FILE_NAMES = {
  tenants: 'tenants.json',
  domains: 'domains.json',
  reservations: 'domain_reservations.json',
  tenant_settings: 'tenant_settings.json'
};
const CACHE_TTL_MS = 5000;

let cache = { at: 0, tenants: null, domains: null };
const settingsCache = new Map();
const locks = new Map();

let kvClient;
function getKV() {
  if (kvClient !== undefined) return kvClient;
  kvClient = null;
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      kvClient = require('@vercel/kv').kv;
    }
  } catch {
    kvClient = null;
  }
  return kvClient;
}

function filePath(name) {
  return path.join(DATA_DIR, FILE_NAMES[name]);
}

function readFileArray(name) {
  try {
    if (!fs.existsSync(filePath(name))) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`[tenancy] could not read ${name} file:`, e.message);
    return [];
  }
}

function writeFileArray(name, rows) {
  try {
    fs.writeFileSync(filePath(name), JSON.stringify(rows || [], null, 2));
  } catch (e) {
    console.error(`[tenancy] could not write ${name} file:`, e.message);
    throw e;
  }
}

async function readKVArray(key) {
  const kv = getKV();
  if (!kv) return null;
  const raw = await kv.get(`tenancy:${key}`);
  if (!raw) return [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function writeKVArray(key, rows) {
  const kv = getKV();
  if (!kv) return false;
  await kv.set(`tenancy:${key}`, JSON.stringify(rows || []));
  return true;
}

function tenantFromRow(row) {
  const data = row && typeof row.data === 'object' && row.data ? row.data : {};
  return {
    ...data,
    id: String(row.id),
    ownerUserId: row.owner_user_id ?? data.ownerUserId ?? null,
    name: row.name ?? data.name ?? 'Untitled blog',
    templateRef: row.template_ref ?? data.templateRef ?? null,
    status: row.status ?? data.status ?? 'active',
    paymentKey: row.payment_key ?? data.paymentKey ?? null,
    createdAt: row.created_at || data.createdAt || null
  };
}

function tenantToRow(tenant) {
  return {
    id: String(tenant.id),
    owner_user_id: tenant.ownerUserId || null,
    name: tenant.name || 'Untitled blog',
    template_ref: tenant.templateRef || null,
    status: tenant.status || 'active',
    payment_key: tenant.paymentKey || null,
    data: tenant,
    updated_at: new Date().toISOString()
  };
}

function domainFromRow(row) {
  const data = row && typeof row.data === 'object' && row.data ? row.data : {};
  return {
    ...data,
    id: String(row.id),
    tenantId: String(row.tenant_id || data.tenantId || ''),
    hostname: String(row.hostname || data.hostname || '').toLowerCase(),
    type: row.type || data.type || 'custom',
    status: row.status || data.status || 'pending',
    verificationToken: row.verification_token ?? data.verificationToken ?? null,
    verifiedAt: row.verified_at ?? data.verifiedAt ?? null,
    isPrimary: Boolean(row.is_primary ?? data.isPrimary),
    cfCustomHostnameId: row.cf_custom_hostname_id ?? data.cfCustomHostnameId ?? null,
    createdAt: row.created_at || data.createdAt || null
  };
}

function domainToRow(domain) {
  return {
    id: String(domain.id),
    tenant_id: String(domain.tenantId),
    hostname: String(domain.hostname).toLowerCase(),
    type: domain.type,
    status: domain.status,
    verification_token: domain.verificationToken || null,
    verified_at: domain.verifiedAt || null,
    is_primary: Boolean(domain.isPrimary),
    cf_custom_hostname_id: domain.cfCustomHostnameId || null,
    data: domain,
    updated_at: new Date().toISOString()
  };
}

async function sbSelectAll(table) {
  const supabase = getSupabase();
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function sbReplaceAll(table, rows, mapToRow) {
  const supabase = getSupabase();
  const mapped = (rows || []).map(mapToRow);
  if (mapped.length) {
    const { error } = await supabase.from(table).upsert(mapped, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
  const { data: existing, error: existingError } = await supabase.from(table).select('id');
  if (existingError) throw new Error(existingError.message);
  const keep = new Set(mapped.map(row => String(row.id)));
  const stale = (existing || []).map(row => row.id).filter(id => !keep.has(String(id)));
  if (stale.length) {
    const { error } = await supabase.from(table).delete().in('id', stale);
    if (error) throw new Error(error.message);
  }
}

async function readCollection(name) {
  if (isSupabaseEnabled()) {
    try {
      const rows = await sbSelectAll(name);
      if (name === 'tenants') return rows.map(tenantFromRow);
      if (name === 'domains') return rows.map(domainFromRow);
      return rows;
    } catch (e) {
      console.warn(`[tenancy] Supabase ${name} read failed, using fallback:`, e.message);
    }
  }
  const mongoDb = await getMongoDB();
  if (mongoDb) {
    try {
      const docs = await mongoDb.collection(name).find({}).toArray();
      return docs.map(doc => {
        const { _id, ...rest } = doc;
        return { ...rest, id: rest.id !== undefined ? rest.id : String(_id) };
      });
    } catch (e) {
      console.warn(`[tenancy] MongoDB ${name} read failed:`, e.message);
    }
  }
  const kvRows = await readKVArray(name).catch(() => null);
  if (kvRows) return kvRows;
  return readFileArray(name);
}

async function writeCollection(name, rows) {
  if (isSupabaseEnabled()) {
    try {
      await sbReplaceAll(name, rows, name === 'tenants' ? tenantToRow : domainToRow);
      return;
    } catch (e) {
      console.warn(`[tenancy] Supabase ${name} write failed, using fallback:`, e.message);
    }
  }
  const mongoDb = await getMongoDB();
  if (mongoDb) {
    try {
      const col = mongoDb.collection(name);
      const ids = [];
      const ops = (rows || []).map(item => {
        const id = String(item.id);
        ids.push(id);
        const { id: _ignored, ...rest } = item;
        return { updateOne: { filter: { _id: id }, update: { $set: { ...rest, id } }, upsert: true } };
      });
      if (ops.length) await col.bulkWrite(ops, { ordered: false });
      await col.deleteMany({ _id: { $nin: ids } });
      return;
    } catch (e) {
      console.warn(`[tenancy] MongoDB ${name} write failed:`, e.message);
    }
  }
  const wroteKV = await writeKVArray(name, rows).catch(() => false);
  if (wroteKV) return;
  writeFileArray(name, rows);
}

function invalidateCache() {
  cache = { at: 0, tenants: null, domains: null };
  settingsCache.clear();
}

async function loadTenants() {
  const now = Date.now();
  if (cache.tenants && now - cache.at < CACHE_TTL_MS) return cache.tenants;
  const tenants = await readCollection('tenants');
  cache.tenants = tenants;
  cache.at = now;
  return tenants;
}

async function loadDomains() {
  const now = Date.now();
  if (cache.domains && now - cache.at < CACHE_TTL_MS) return cache.domains;
  const domains = await readCollection('domains');
  cache.domains = domains;
  cache.at = now;
  return domains;
}

async function saveTenants(tenants) {
  invalidateCache();
  await writeCollection('tenants', tenants);
  cache.tenants = tenants;
  cache.at = Date.now();
}

async function saveDomains(domains) {
  invalidateCache();
  await writeCollection('domains', domains);
  cache.domains = domains;
  cache.at = Date.now();
}

async function findTenantById(id) {
  if (!id) return null;
  const tenants = await loadTenants();
  return tenants.find(tenant => String(tenant.id) === String(id)) || null;
}

async function findTenantByPaymentKey(paymentKey) {
  if (!paymentKey) return null;
  const tenants = await loadTenants();
  return tenants.find(tenant => tenant.paymentKey === paymentKey) || null;
}

async function findDomainByHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  const domains = await loadDomains();
  return domains.find(domain => String(domain.hostname).toLowerCase() === host) || null;
}

async function listDomainsForTenant(tenantId) {
  const domains = await loadDomains();
  return domains.filter(domain => String(domain.tenantId) === String(tenantId));
}

async function upsertTenant(tenant) {
  const tenants = await loadTenants();
  const index = tenants.findIndex(item => String(item.id) === String(tenant.id));
  if (index === -1) tenants.push(tenant);
  else tenants[index] = tenant;
  await saveTenants(tenants);
  return tenant;
}

async function upsertDomain(domain) {
  const domains = await loadDomains();
  const index = domains.findIndex(item => String(item.id) === String(domain.id));
  if (index === -1) domains.push(domain);
  else domains[index] = domain;
  await saveDomains(domains);
  return domain;
}

async function deleteDomain(id) {
  const domains = await loadDomains();
  const next = domains.filter(domain => String(domain.id) !== String(id));
  await saveDomains(next);
}

async function loadTenantSettings(tenantId) {
  const id = String(tenantId || '');
  const cached = settingsCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  let value = null;
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await getSupabase()
        .from('tenant_settings')
        .select('data')
        .eq('tenant_id', id)
        .maybeSingle();
      if (!error && data) value = data.data || null;
    } catch (e) {
      console.warn('[tenancy] Supabase tenant settings read failed:', e.message);
    }
  }
  if (!value) {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      try {
        const doc = await mongoDb.collection('tenant_settings').findOne({ _id: id });
        if (doc) value = doc.data || null;
      } catch (e) {
        console.warn('[tenancy] MongoDB tenant settings read failed:', e.message);
      }
    }
  }
  if (!value) {
    const rows = readFileArray('tenant_settings');
    value = rows.find(row => String(row.id) === id)?.data || null;
  }
  settingsCache.set(id, { at: Date.now(), value });
  return value;
}

async function saveTenantSettings(tenantId, settings) {
  const id = String(tenantId || '');
  if (!id) throw new Error('tenantId is required');
  settingsCache.delete(id);
  if (isSupabaseEnabled()) {
    try {
      const { error } = await getSupabase()
        .from('tenant_settings')
        .upsert({ tenant_id: id, data: settings, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
      if (!error) return;
      console.warn('[tenancy] Supabase tenant settings write failed:', error.message);
    } catch (e) {
      console.warn('[tenancy] Supabase tenant settings write failed:', e.message);
    }
  }
  const mongoDb = await getMongoDB();
  if (mongoDb) {
    try {
      await mongoDb.collection('tenant_settings').updateOne(
        { _id: id },
        { $set: { data: settings, updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    } catch (e) {
      console.warn('[tenancy] MongoDB tenant settings write failed:', e.message);
    }
  }
  const rows = readFileArray('tenant_settings').filter(row => String(row.id) !== id);
  rows.push({ id, data: settings });
  writeFileArray('tenant_settings', rows);
}

// ── Reservations ────────────────────────────────────────────────────────────

async function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  locks.set(key, gate);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === gate) locks.delete(key);
  }
}

async function loadReservationsRaw() {
  if (isSupabaseEnabled()) {
    try {
      return await sbSelectAll('domain_reservations');
    } catch (e) {
      console.warn('[tenancy] Supabase reservations read failed:', e.message);
    }
  }
  const mongoDb = await getMongoDB();
  if (mongoDb) {
    try {
      const docs = await mongoDb.collection('domain_reservations').find({}).toArray();
      return docs.map(doc => ({ ...doc, hostname: doc.hostname || String(doc._id) }));
    } catch (e) {
      console.warn('[tenancy] MongoDB reservations read failed:', e.message);
    }
  }
  const kvRows = await readKVArray('reservations').catch(() => null);
  if (kvRows) return kvRows;
  return readFileArray('reservations');
}

async function writeReservationsRaw(rows) {
  if (isSupabaseEnabled()) {
    try {
      const supabase = getSupabase();
      const keep = new Set((rows || []).map(row => row.hostname));
      const existing = await sbSelectAll('domain_reservations');
      const stale = existing.map(row => row.hostname).filter(host => !keep.has(host));
      if (rows.length) {
        const { error } = await supabase.from('domain_reservations').upsert(rows, { onConflict: 'hostname' });
        if (error) throw new Error(error.message);
      }
      if (stale.length) {
        const { error } = await supabase.from('domain_reservations').delete().in('hostname', stale);
        if (error) throw new Error(error.message);
      }
      return;
    } catch (e) {
      console.warn('[tenancy] Supabase reservations write failed:', e.message);
    }
  }
  const mongoDb = await getMongoDB();
  if (mongoDb) {
    try {
      const col = mongoDb.collection('domain_reservations');
      const hosts = (rows || []).map(row => row.hostname);
      const ops = (rows || []).map(row => ({
        updateOne: { filter: { _id: row.hostname }, update: { $set: row }, upsert: true }
      }));
      if (ops.length) await col.bulkWrite(ops, { ordered: false });
      await col.deleteMany({ _id: { $nin: hosts } });
      return;
    } catch (e) {
      console.warn('[tenancy] MongoDB reservations write failed:', e.message);
    }
  }
  const wroteKV = await writeKVArray('reservations', rows).catch(() => false);
  if (wroteKV) return;
  writeFileArray('reservations', rows);
}

async function pruneReservations() {
  const now = Date.now();
  const rows = await loadReservationsRaw();
  const live = rows.filter(row => new Date(row.expires_at || row.expiresAt).getTime() > now);
  if (live.length !== rows.length) await writeReservationsRaw(live);
  return live;
}

async function getReservation(hostname) {
  const host = String(hostname || '').toLowerCase();
  const rows = await pruneReservations();
  return rows.find(row => String(row.hostname).toLowerCase() === host) || null;
}

async function isSubdomainAvailable(slug) {
  const host = String(slug || '').toLowerCase();
  const reservation = await getReservation(host);
  if (reservation) return { available: false, reason: 'reserved' };
  const domain = await findDomainByHostname(host);
  if (domain && domain.status !== 'failed') return { available: false, reason: 'taken' };
  return { available: true };
}

function reservationMatches(reservation, { email, checkoutRequestId }) {
  if (!reservation) return false;
  const sameEmail = email && reservation.email &&
    String(reservation.email).toLowerCase() === String(email).toLowerCase();
  const sameCheckout = checkoutRequestId && reservation.checkout_request_id &&
    String(reservation.checkout_request_id) === String(checkoutRequestId);
  return Boolean(sameEmail || sameCheckout);
}

async function reserveSubdomain({ subdomain, email, checkoutRequestId, ttlMs }) {
  const host = String(subdomain || '').toLowerCase();
  const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : 15 * 60 * 1000;
  return withLock(`reserve:${host}`, async () => {
    const reservation = await getReservation(host);
    if (reservation) {
      if (reservationMatches(reservation, { email, checkoutRequestId })) {
        return { ok: true, reservation };
      }
      return { ok: false, error: 'That subdomain is already reserved. Please choose another.', code: 'reserved' };
    }
    const domain = await findDomainByHostname(host);
    if (domain && domain.status !== 'failed') {
      return { ok: false, error: 'That subdomain is already taken.', code: 'taken' };
    }
    const record = {
      hostname: host,
      email: String(email || '').toLowerCase(),
      checkout_request_id: checkoutRequestId || null,
      expires_at: new Date(Date.now() + ttl).toISOString(),
      created_at: new Date().toISOString()
    };
    const rows = await pruneReservations();
    rows.push(record);
    try {
      await writeReservationsRaw(rows);
    } catch (e) {
      if (String(e.message || '').toLowerCase().includes('duplicate')) {
        return { ok: false, error: 'That subdomain is already reserved. Please choose another.', code: 'reserved' };
      }
      throw e;
    }
    return { ok: true, reservation: record };
  });
}

async function consumeReservation(hostname, { email, checkoutRequestId } = {}) {
  const host = String(hostname || '').toLowerCase();
  return withLock(`reserve:${host}`, async () => {
    const rows = await pruneReservations();
    const reservation = rows.find(row => String(row.hostname).toLowerCase() === host);
    if (!reservation) return { ok: true, consumed: false };
    if (!reservationMatches(reservation, { email, checkoutRequestId })) {
      return { ok: false, error: 'Subdomain reservation belongs to another purchase.', code: 'reserved' };
    }
    await writeReservationsRaw(rows.filter(row => String(row.hostname).toLowerCase() !== host));
    return { ok: true, consumed: true, reservation };
  });
}

async function releaseReservation(hostname, { email } = {}) {
  const host = String(hostname || '').toLowerCase();
  return withLock(`reserve:${host}`, async () => {
    const rows = await pruneReservations();
    const reservation = rows.find(row => String(row.hostname).toLowerCase() === host);
    if (!reservation) return { ok: true };
    if (email && reservation.email && String(reservation.email).toLowerCase() !== String(email).toLowerCase()) {
      return { ok: false, error: 'not_owner' };
    }
    await writeReservationsRaw(rows.filter(row => String(row.hostname).toLowerCase() !== host));
    return { ok: true };
  });
}

async function insertTenantIfAbsent(tenant) {
  return withLock(`tenant:${tenant.paymentKey || tenant.id}`, async () => {
    const existing = tenant.paymentKey ? await findTenantByPaymentKey(tenant.paymentKey) : null;
    if (existing) return { created: false, tenant: existing };
    if (isSupabaseEnabled()) {
      try {
        const { error } = await getSupabase().from('tenants').insert(tenantToRow(tenant));
        if (!error) {
          invalidateCache();
          return { created: true, tenant };
        }
        if (String(error.code) === '23505' || /duplicate|unique/i.test(error.message || '')) {
          invalidateCache();
          const winner = await findTenantByPaymentKey(tenant.paymentKey);
          if (winner) return { created: false, tenant: winner };
        }
        console.warn('[tenancy] Supabase tenant insert failed, using fallback:', error.message);
      } catch (e) {
        console.warn('[tenancy] Supabase tenant insert failed, using fallback:', e.message);
      }
    }
    const tenants = await loadTenants();
    const conflict = tenant.paymentKey
      ? tenants.find(item => item.paymentKey === tenant.paymentKey)
      : tenants.find(item => String(item.id) === String(tenant.id));
    if (conflict) return { created: false, tenant: conflict };
    tenants.push(tenant);
    await saveTenants(tenants);
    return { created: true, tenant };
  });
}

async function insertDomainIfAbsent(domain) {
  return withLock(`domain:${domain.hostname}`, async () => {
    const existing = await findDomainByHostname(domain.hostname);
    if (existing) return { created: false, domain: existing };
    if (isSupabaseEnabled()) {
      try {
        const { error } = await getSupabase().from('domains').insert(domainToRow(domain));
        if (!error) {
          invalidateCache();
          return { created: true, domain };
        }
        if (String(error.code) === '23505' || /duplicate|unique/i.test(error.message || '')) {
          invalidateCache();
          const winner = await findDomainByHostname(domain.hostname);
          if (winner) return { created: false, domain: winner };
        }
        console.warn('[tenancy] Supabase domain insert failed, using fallback:', error.message);
      } catch (e) {
        console.warn('[tenancy] Supabase domain insert failed, using fallback:', e.message);
      }
    }
    const domains = await loadDomains();
    const conflict = domains.find(item => String(item.hostname).toLowerCase() === String(domain.hostname).toLowerCase());
    if (conflict) return { created: false, domain: conflict };
    domains.push(domain);
    await saveDomains(domains);
    return { created: true, domain };
  });
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  invalidateCache,
  loadTenants,
  loadDomains,
  saveTenants,
  saveDomains,
  findTenantById,
  findTenantByPaymentKey,
  findDomainByHostname,
  listDomainsForTenant,
  upsertTenant,
  upsertDomain,
  insertTenantIfAbsent,
  insertDomainIfAbsent,
  deleteDomain,
  loadTenantSettings,
  saveTenantSettings,
  reserveSubdomain,
  consumeReservation,
  releaseReservation,
  getReservation,
  isSubdomainAvailable,
  newId,
  newToken,
  withLock
};
