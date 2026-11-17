const { validateHostname, dnsInstructions } = require('./validation');
const { PENDING_DOMAIN_TTL_MS } = require('./config');
const store = require('./store');
const { verifyDomainDns } = require('./dns');
const ssl = require('./ssl');
const { invalidateHostCache } = require('./resolve');

function fail(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function getOwnedDomain(tenantId, domainId) {
  const domains = await store.loadDomains();
  const domain = domains.find(item => String(item.id) === String(domainId));
  if (!domain) throw fail('Domain not found.', 'NOT_FOUND');
  if (String(domain.tenantId) !== String(tenantId)) throw fail('Domain not found.', 'NOT_FOUND');
  if (domain.type !== 'custom') throw fail('Platform domains cannot be changed here.', 'PLATFORM_DOMAIN');
  return domain;
}

async function addCustomDomain({ tenant, hostname, makePrimary = false } = {}) {
  if (!tenant || !tenant.id) throw fail('Tenant is required.', 'MISSING_TENANT');
  const checked = validateHostname(hostname);
  if (!checked.valid) throw fail(checked.error, 'INVALID_HOSTNAME');

  const existing = await store.findDomainByHostname(checked.hostname);
  if (existing) throw fail('That domain is already connected.', 'DOMAIN_TAKEN');

  const domain = {
    id: store.newId(),
    tenantId: String(tenant.id),
    hostname: checked.hostname,
    type: 'custom',
    status: 'pending',
    verificationToken: store.newToken(),
    verifiedAt: null,
    isPrimary: false,
    createdAt: new Date().toISOString()
  };

  const inserted = await store.insertDomainIfAbsent(domain);
  if (!inserted.created) throw fail('That domain is already connected.', 'DOMAIN_TAKEN');

  if (makePrimary) {
    await setPrimaryDomain({ tenantId: tenant.id, domainId: domain.id, requireActive: false });
  }

  invalidateHostCache(domain.hostname);
  return {
    domain: inserted.domain,
    instructions: dnsInstructions(inserted.domain.hostname, inserted.domain.verificationToken)
  };
}

async function verifyCustomDomain({ tenantId, domainId, resolver } = {}) {
  const domain = await getOwnedDomain(tenantId, domainId);
  if (domain.status === 'active') {
    return { domain, instructions: dnsInstructions(domain.hostname, domain.verificationToken), alreadyActive: true };
  }

  const check = await verifyDomainDns({
    hostname: domain.hostname,
    token: domain.verificationToken,
    resolver
  });

  if (!check.verified) {
    return {
      domain,
      verified: false,
      check,
      instructions: dnsInstructions(domain.hostname, domain.verificationToken)
    };
  }

  const updated = {
    ...domain,
    status: 'active',
    verifiedAt: new Date().toISOString()
  };

  const cert = await ssl.createCustomHostname(domain.hostname);
  if (cert.ok && cert.externalId) {
    updated.cfCustomHostnameId = cert.externalId;
    updated.sslStatus = cert.sslStatus || 'pending';
  } else if (!cert.ok) {
    updated.sslStatus = 'pending';
    updated.sslError = cert.error || 'certificate_request_failed';
  }

  await store.upsertDomain(updated);
  invalidateHostCache(domain.hostname);

  return {
    domain: updated,
    verified: true,
    check,
    certificate: cert,
    instructions: dnsInstructions(updated.hostname, updated.verificationToken)
  };
}

async function removeCustomDomain({ tenantId, domainId } = {}) {
  const domain = await getOwnedDomain(tenantId, domainId);
  if (domain.cfCustomHostnameId) {
    await ssl.deleteCustomHostname(domain.cfCustomHostnameId);
  }
  await store.deleteDomain(domain.id);
  invalidateHostCache(domain.hostname);

  if (domain.isPrimary) {
    const tenants = await store.loadTenants();
    const tenant = tenants.find(item => String(item.id) === String(tenantId));
    if (tenant && (tenant.primaryDomainId === domain.id || tenant.primaryHostname === domain.hostname)) {
      const { primaryDomainId, primaryHostname, ...rest } = tenant;
      await store.upsertTenant(rest);
    }
  }

  return { removed: true, domain };
}

async function setPrimaryDomain({ tenantId, domainId, requireActive = true } = {}) {
  const domain = await getOwnedDomain(tenantId, domainId);
  if (requireActive && domain.status !== 'active') {
    throw fail('Verify the domain before making it primary.', 'DOMAIN_NOT_ACTIVE');
  }
  const domains = await store.listDomainsForTenant(tenantId);
  const updated = domains.map(item => ({
    ...item,
    isPrimary: String(item.id) === String(domain.id)? true : false
  }));
  await store.saveDomains([
    ...(await store.loadDomains()).filter(item => String(item.tenantId) !== String(tenantId)),
    ...updated
  ].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index));

  const tenants = await store.loadTenants();
  const tenant = tenants.find(item => String(item.id) === String(tenantId));
  if (tenant) {
    await store.upsertTenant({ ...tenant, primaryDomainId: domain.id, primaryHostname: domain.hostname });
  }
  invalidateHostCache(domain.hostname);
  return { domain: { ...domain, isPrimary: true }, domains: updated };
}

async function listTenantDomains(tenantId) {
  const domains = await store.listDomainsForTenant(tenantId);
  return domains.map(domain => ({
    ...domain,
    instructions: domain.type === 'custom'
      ? dnsInstructions(domain.hostname, domain.verificationToken)
      : null
  }));
}

async function expireStalePendingDomains(now = Date.now()) {
  const domains = await store.loadDomains();
  const expired = domains.filter(domain =>
    domain.type === 'custom' &&
    domain.status === 'pending' &&
    domain.createdAt &&
    now - new Date(domain.createdAt).getTime() > PENDING_DOMAIN_TTL_MS
  );
  if (!expired.length) return { expired: [] };
  const expiredIds = new Set(expired.map(domain => String(domain.id)));
  const updated = domains.map(domain =>
    expiredIds.has(String(domain.id)) ? { ...domain, status: 'failed' } : domain
  );
  await store.saveDomains(updated);
  expired.forEach(domain => invalidateHostCache(domain.hostname));
  return { expired };
}

/**
 * Refreshes Cloudflare certificate state for active custom domains (or
 * registers hostnames that were activated while Cloudflare was unavailable).
 * Called from the hourly job and the verify-pending cron endpoint.
 */
async function refreshDomainCertificates() {
  if (!ssl.isCloudflareEnabled()) return { checked: 0, updated: [] };

  const domains = await store.loadDomains();
  const candidates = domains.filter(domain => domain.type === 'custom' && domain.status === 'active');
  const updated = [];

  for (const domain of candidates) {
    let cert;
    if (!domain.cfCustomHostnameId) {
      cert = await ssl.createCustomHostname(domain.hostname);
      if (cert.ok && cert.externalId) {
        const next = {
          ...domain,
          cfCustomHostnameId: cert.externalId,
          sslStatus: cert.sslStatus || 'pending',
          cfHostnameStatus: cert.hostnameStatus || null,
          sslCheckedAt: new Date().toISOString()
        };
        delete next.sslError;
        await store.upsertDomain(next);
        updated.push({ hostname: domain.hostname, sslStatus: next.sslStatus, registered: true });
        continue;
      }
    } else {
      cert = await ssl.getCustomHostnameStatus(domain.cfCustomHostnameId);
    }

    if (!cert || !cert.ok) {
      if (cert && cert.error) {
        await store.upsertDomain({
          ...domain,
          sslError: cert.error,
          sslCheckedAt: new Date().toISOString()
        });
        updated.push({ hostname: domain.hostname, sslStatus: domain.sslStatus || null, error: cert.error });
      }
      continue;
    }

    const nextSslStatus = cert.sslStatus || domain.sslStatus || 'pending';
    const validationErrors = cert.sslValidationErrors || [];
    const changed = nextSslStatus !== domain.sslStatus
      || (cert.hostnameStatus || null) !== (domain.cfHostnameStatus || null)
      || validationErrors.length > 0
      || Boolean(domain.sslError);

    if (!changed) continue;

    const next = {
      ...domain,
      sslStatus: nextSslStatus,
      cfHostnameStatus: cert.hostnameStatus || null,
      sslCheckedAt: new Date().toISOString()
    };
    if (validationErrors.length) next.sslValidationErrors = validationErrors;
    else delete next.sslValidationErrors;
    delete next.sslError;

    await store.upsertDomain(next);
    updated.push({ hostname: domain.hostname, sslStatus: nextSslStatus, status: cert.hostnameStatus || null });
  }

  return { checked: candidates.length, updated };
}

module.exports = {
  addCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  setPrimaryDomain,
  listTenantDomains,
  expireStalePendingDomains,
  refreshDomainCertificates
};
