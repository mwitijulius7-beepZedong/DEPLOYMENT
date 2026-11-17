const fetch = require('node-fetch');
const { loadDomains } = require('./store');

const API_BASE = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4';

function cloudflareConfig() {
  return {
    token: process.env.CLOUDFLARE_API_TOKEN || '',
    zoneId: process.env.CLOUDFLARE_ZONE_ID || ''
  };
}

function isCloudflareEnabled() {
  const { token, zoneId } = cloudflareConfig();
  return Boolean(token && zoneId);
}

async function cfRequest(pathname, options = {}) {
  const { token } = cloudflareConfig();
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { ok: response.ok, status: response.status, body };
}

async function findCustomHostname(hostname) {
  const { zoneId } = cloudflareConfig();
  const { ok, body } = await cfRequest(
    `/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`
  );
  if (!ok) return null;
  return body?.result?.[0] || null;
}

/**
 * Registers a custom hostname with Cloudflare for SaaS. Cloudflare issues and
 * renews the certificate once the customer's DNS points at the platform.
 * Never throws: provisioning keeps working and SSL can be retried later.
 */
async function createCustomHostname(hostname) {
  if (!isCloudflareEnabled()) {
    return { ok: false, provider: 'none', error: 'cloudflare_not_configured' };
  }
  const { zoneId } = cloudflareConfig();
  const payload = {
    hostname,
    ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } }
  };
  try {
    const { ok, status, body } = await cfRequest(`/zones/${zoneId}/custom_hostnames`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (ok && body?.result) {
      return {
        ok: true,
        provider: 'cloudflare',
        externalId: body.result.id,
        sslStatus: body.result.ssl?.status || null
      };
    }
    if (status === 409) {
      const existing = await findCustomHostname(hostname);
      if (existing) return { ok: true, provider: 'cloudflare', externalId: existing.id, sslStatus: existing.ssl?.status || null };
    }
    return {
      ok: false,
      provider: 'cloudflare',
      error: body?.errors?.[0]?.message || `cloudflare_http_${status}`
    };
  } catch (e) {
    return { ok: false, provider: 'cloudflare', error: e.message };
  }
}

async function deleteCustomHostname(externalId) {
  if (!externalId || !isCloudflareEnabled()) return { ok: true, skipped: true };
  const { zoneId } = cloudflareConfig();
  try {
    const { ok, status } = await cfRequest(`/zones/${zoneId}/custom_hostnames/${externalId}`, { method: 'DELETE' });
    return { ok: ok || status === 404 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Reads the current hostname + certificate state so activation failures are
 * visible in the dashboard instead of silently staying "pending".
 */
async function getCustomHostnameStatus(externalId) {
  if (!externalId || !isCloudflareEnabled()) return { ok: false, skipped: true };
  const { zoneId } = cloudflareConfig();
  try {
    const { ok, status, body } = await cfRequest(`/zones/${zoneId}/custom_hostnames/${externalId}`);
    if (!ok || !body?.result) {
      return { ok: false, error: body?.errors?.[0]?.message || `cloudflare_http_${status}` };
    }
    const result = body.result;
    return {
      ok: true,
      provider: 'cloudflare',
      hostnameStatus: result.status || null,
      sslStatus: result.ssl?.status || null,
      sslValidationErrors: Array.isArray(result.ssl?.validation_errors)
        ? result.ssl.validation_errors
          .map(error => (typeof error === 'string' ? error : error && error.message))
          .filter(Boolean)
        : []
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Used by the Caddy `ask` endpoint (self-hosted alternative): only hostnames
 * that exist as active/verified domains may receive a certificate.
 */
async function isCertificateEligible(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  const domains = await loadDomains();
  const domain = domains.find(item => String(item.hostname).toLowerCase() === host);
  if (!domain) return false;
  if (domain.type === 'platform') return domain.status === 'active';
  return domain.status === 'active' || Boolean(domain.verifiedAt);
}

module.exports = {
  isCloudflareEnabled,
  createCustomHostname,
  deleteCustomHostname,
  getCustomHostnameStatus,
  isCertificateEligible
};
