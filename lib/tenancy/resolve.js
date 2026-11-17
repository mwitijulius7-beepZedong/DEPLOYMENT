const {
  PLATFORM_DOMAIN,
  PLATFORM_TENANT_ID,
  RESOLUTION_CACHE_TTL_MS,
  stripHost
} = require('./config');
const { loadDomains, findTenantById } = require('./store');

const cache = new Map();

function platformTenant() {
  return {
    id: PLATFORM_TENANT_ID,
    name: 'Platform',
    status: 'active',
    platform: true,
    createdAt: null
  };
}

function getHostFromRequest(req) {
  const raw = req.get('x-forwarded-host') || req.get('host') || '';
  return stripHost(raw.split(',')[0]);
}

function isIpHost(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith('[') || host.includes(':');
}

function isPlatformRequestHost(host) {
  const value = stripHost(host);
  if (!value) return false;
  if (PLATFORM_DOMAIN && (value === PLATFORM_DOMAIN || value === `www.${PLATFORM_DOMAIN}`)) return true;
  if (value === 'localhost' || value === '127.0.0.1' || value === '[::1]') return true;
  if (value.endsWith('.vercel.app')) return true;
  if (isIpHost(value)) return true;
  return false;
}

function platformContext(hostname) {
  return {
    platform: true,
    hostname,
    tenant: platformTenant(),
    domain: null
  };
}

async function buildTenantContext(tenant, domain, hostname) {
  return {
    platform: false,
    hostname: hostname || domain?.hostname,
    tenant,
    domain: domain || null
  };
}

async function resolveTenantForHost(rawHost) {
  const host = stripHost(rawHost);
  if (!host) return null;

  if (isPlatformRequestHost(host)) return platformContext(host);

  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const domains = await loadDomains();
  const domain = domains.find(item =>
    String(item.hostname).toLowerCase() === host && item.status === 'active'
  );
  if (!domain) {
    cache.set(host, { value: null, expiresAt: Date.now() + Math.min(RESOLUTION_CACHE_TTL_MS, 5000) });
    return null;
  }

  const tenant = await findTenantById(domain.tenantId);
  if (!tenant || String(tenant.status || '').toLowerCase() !== 'active') {
    cache.set(host, { value: null, expiresAt: Date.now() + Math.min(RESOLUTION_CACHE_TTL_MS, 5000) });
    return null;
  }

  const value = await buildTenantContext(tenant, domain, host);
  cache.set(host, { value, expiresAt: Date.now() + RESOLUTION_CACHE_TTL_MS });
  return value;
}

async function resolveTenantById(tenantId) {
  const tenant = await findTenantById(tenantId);
  if (!tenant || String(tenant.status || '').toLowerCase() !== 'active') return null;
  const domains = await loadDomains();
  const primary = domains.find(domain =>
    String(domain.tenantId) === String(tenant.id) &&
    domain.status === 'active' &&
    domain.type === 'custom' &&
    domain.isPrimary
  );
  return {
    platform: false,
    hostname: primary?.hostname || null,
    tenant,
    domain: primary || null
  };
}

function invalidateHostCache(hostname) {
  if (hostname) cache.delete(stripHost(hostname));
  else cache.clear();
}

module.exports = {
  platformTenant,
  getHostFromRequest,
  isPlatformRequestHost,
  platformContext,
  resolveTenantForHost,
  resolveTenantById,
  buildTenantContext,
  invalidateHostCache
};
