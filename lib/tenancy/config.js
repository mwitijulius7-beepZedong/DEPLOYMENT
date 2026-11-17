const PLATFORM_TENANT_ID = 'platform';

function stripHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

const PLATFORM_DOMAIN = stripHost(process.env.PLATFORM_DOMAIN);
const CUSTOM_DOMAIN_TARGET = stripHost(
  process.env.CUSTOM_DOMAIN_TARGET || (PLATFORM_DOMAIN ? `custom.${PLATFORM_DOMAIN}` : '')
);
const SERVER_IP = String(process.env.SERVER_IP || '').trim();

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  PLATFORM_TENANT_ID,
  PLATFORM_DOMAIN,
  CUSTOM_DOMAIN_TARGET,
  SERVER_IP,
  RESERVATION_TTL_MS: numberEnv('SUBDOMAIN_RESERVATION_TTL_MS', 15 * 60 * 1000),
  PENDING_DOMAIN_TTL_MS: numberEnv('CUSTOM_DOMAIN_PENDING_TTL_MS', 7 * 24 * 60 * 60 * 1000),
  RESOLUTION_CACHE_TTL_MS: numberEnv('TENANT_CACHE_TTL_MS', 30 * 1000),
  stripHost
};
