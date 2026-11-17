const { validateSubdomain } = require('./validation');
const { PLATFORM_DOMAIN } = require('./config');
const store = require('./store');
const { invalidateHostCache } = require('./resolve');

function blogUrlFor(hostname) {
  const host = String(hostname || '');
  const local = !host || host.endsWith('.localhost') || host.endsWith('.lvh.me') || host === 'localhost';
  return `${local ? 'http' : 'https'}://${host}`;
}

function fail(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function ensurePlatformDomain(tenant, hostname, email) {
  const domains = await store.listDomainsForTenant(tenant.id);
  const existing = domains.find(domain => domain.type === 'platform' && domain.hostname === hostname);
  if (existing) return existing;
  const domain = {
    id: store.newId(),
    tenantId: String(tenant.id),
    hostname,
    type: 'platform',
    status: 'active',
    verificationToken: null,
    verifiedAt: new Date().toISOString(),
    isPrimary: false,
    createdAt: new Date().toISOString(),
    email: email || null
  };
  const result = await store.insertDomainIfAbsent(domain);
  if (!result.created && String(result.domain.tenantId) !== String(tenant.id)) {
    throw fail('That subdomain is already taken.', 'DOMAIN_TAKEN');
  }
  invalidateHostCache(hostname);
  return result.domain;
}

/**
 * Idempotent: a repeated M-Pesa callback (same paymentKey = receipt or
 * checkout request id) returns the already-provisioned tenant instead of
 * creating a second one.
 */
async function provisionTenantFromPayment({
  paymentKey,
  buyer,
  subdomain,
  name,
  templateRef = 'default',
  ownerUserId = null
} = {}) {
  if (!paymentKey) throw fail('paymentKey is required', 'MISSING_PAYMENT_KEY');
  const slug = validateSubdomain(subdomain);
  if (!slug.valid) throw fail(slug.error, 'INVALID_SUBDOMAIN');

  const hostname = slug.hostname;
  const email = buyer?.email || '';

  const existing = await store.findTenantByPaymentKey(paymentKey);
  if (existing) {
    const domain = await ensurePlatformDomain(existing, hostname, email);
    return {
      created: false,
      tenant: existing,
      domain,
      blogUrl: blogUrlFor(domain.hostname)
    };
  }

  const reservation = await store.getReservation(hostname);
  if (reservation) {
    const sameEmail = email && reservation.email &&
      String(reservation.email).toLowerCase() === String(email).toLowerCase();
    if (!sameEmail) throw fail('That subdomain is reserved by another purchase.', 'SUBDOMAIN_RESERVED');
  }

  const tenant = {
    id: store.newId(),
    ownerUserId: ownerUserId || buyer?.id || null,
    name: name || buyer?.name || `${slug.slug}'s blog`,
    templateRef,
    status: 'active',
    paymentKey,
    ownerEmail: email || null,
    createdAt: new Date().toISOString()
  };

  const inserted = await store.insertTenantIfAbsent(tenant);
  if (!inserted.created) {
    const domain = await ensurePlatformDomain(inserted.tenant, hostname, email);
    return {
      created: false,
      tenant: inserted.tenant,
      domain,
      blogUrl: blogUrlFor(domain.hostname)
    };
  }

  let domain;
  try {
    domain = await ensurePlatformDomain(inserted.tenant, hostname, email);
  } catch (e) {
    // The hostname was claimed between the reservation check and the insert.
    const tenants = await store.loadTenants();
    await store.saveTenants(tenants.filter(item => String(item.id) !== String(inserted.tenant.id)));
    throw e;
  }

  await store.consumeReservation(hostname, { email, checkoutRequestId: paymentKey });
  invalidateHostCache(hostname);

  return {
    created: true,
    tenant: inserted.tenant,
    domain,
    blogUrl: blogUrlFor(domain.hostname)
  };
}

module.exports = {
  provisionTenantFromPayment,
  ensurePlatformDomain,
  blogUrlFor,
  platformHostnameFor: slug => (PLATFORM_DOMAIN ? `${slug}.${PLATFORM_DOMAIN}` : slug)
};
