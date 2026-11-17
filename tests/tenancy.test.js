import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenancy-test-'));

// Configure tenancy before loading the modules (config is read at import time).
process.env.DATA_DIR = dataDir;
process.env.PLATFORM_DOMAIN = 'example.test';
process.env.CUSTOM_DOMAIN_TARGET = 'custom.example.test';
process.env.SERVER_IP = '203.0.113.10';
process.env.SUBDOMAIN_RESERVATION_TTL_MS = '60000';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.MONGODB_URI = '';
process.env.DATA_BACKEND = 'file';

const validation = require('../lib/tenancy/validation');
const store = require('../lib/tenancy/store');
const { provisionTenantFromPayment } = require('../lib/tenancy/provision');
const { verifyDomainDns } = require('../lib/tenancy/dns');
const { filterForTenant, mergeForTenant } = require('../lib/tenancy/scope');
const { runWithTenant } = require('../lib/tenancy/context');

function tenantScope(id, fn) {
  return runWithTenant({ tenant: { id }, platform: id === 'platform' }, fn);
}

describe('subdomain validation', () => {
  it('accepts a valid slug and derives the hostname', () => {
    expect(validation.validateSubdomain('my-blog')).toEqual({
      valid: true,
      slug: 'my-blog',
      hostname: 'my-blog.example.test'
    });
  });

  it('rejects invalid slugs', () => {
    for (const slug of ['ab', 'a'.repeat(31), '-leading', 'trailing-', 'has_underscore', 'has space']) {
      expect(validation.validateSubdomain(slug).valid, slug).toBe(false);
    }
  });

  it('normalises uppercase input', () => {
    expect(validation.validateSubdomain('MyBlog').slug).toBe('myblog');
  });

  it('rejects reserved slugs', () => {
    for (const slug of ['www', 'admin', 'api', 'app', 'mail', 'dashboard', 'support', 'ftp', 'ns1', 'ns2']) {
      expect(validation.validateSubdomain(slug).valid, slug).toBe(false);
    }
  });

  it('rejects platform and reserved hostnames as custom domains', () => {
    expect(validation.validateHostname('example.test').valid).toBe(false);
    expect(validation.validateHostname('blog.example.test').valid).toBe(false);
    expect(validation.validateHostname('*.example.com').valid).toBe(false);
    expect(validation.validateHostname('1.2.3.4').valid).toBe(false);
    expect(validation.validateHostname('localhost').valid).toBe(false);
    expect(validation.validateHostname('myblog.example.org').valid).toBe(true);
  });
});

describe('tenant isolation', () => {
  const items = [
    { id: 'a1', tenantId: 'tenant-a' },
    { id: 'a2', tenantId: 'tenant-a' },
    { id: 'b1', tenantId: 'tenant-b' },
    { id: 'legacy' }
  ];

  it('only reads the current tenant records', () => {
    expect(tenantScope('tenant-a', () => filterForTenant(items).map(i => i.id)))
      .toEqual(['a1', 'a2']);
    expect(tenantScope('tenant-b', () => filterForTenant(items).map(i => i.id)))
      .toEqual(['b1']);
    expect(tenantScope('platform', () => filterForTenant(items).map(i => i.id)))
      .toEqual(['legacy']);
  });

  it('never drops another tenant records when writing', () => {
    const scoped = [{ id: 'a1', tenantId: 'tenant-a' }];
    const merged = tenantScope('tenant-a', () => mergeForTenant(items, scoped));
    expect(merged.map(i => i.id).sort()).toEqual(['a1', 'b1', 'legacy']);
    expect(merged.find(i => i.id === 'a1').tenantId).toBe('tenant-a');
  });
});

describe('payment provisioning', () => {
  beforeAll(async () => {
    await store.saveTenants([]);
    await store.saveDomains([]);
  });

  const buyer = { id: 'buyer-1', name: 'Alice', email: 'alice@example.com' };

  it('creates a tenant, an active platform domain and is idempotent', async () => {
    const first = await provisionTenantFromPayment({
      paymentKey: 'mpesa:RCPT-1',
      buyer,
      subdomain: 'alice-blog'
    });
    expect(first.created).toBe(true);
    expect(first.blogUrl).toBe('https://alice-blog.example.test');
    expect(first.domain.status).toBe('active');

    // A duplicate callback with the same receipt must not create anything twice.
    const second = await provisionTenantFromPayment({
      paymentKey: 'mpesa:RCPT-1',
      buyer,
      subdomain: 'alice-blog'
    });
    expect(second.created).toBe(false);
    expect(second.tenant.id).toBe(first.tenant.id);

    expect((await store.loadTenants())).toHaveLength(1);
    const domains = await store.listDomainsForTenant(first.tenant.id);
    expect(domains).toHaveLength(1);
    expect(domains[0].hostname).toBe('alice-blog.example.test');
  });

  it('refuses a subdomain that another tenant already owns', async () => {
    await expect(provisionTenantFromPayment({
      paymentKey: 'mpesa:RCPT-2',
      buyer: { id: 'buyer-2', name: 'Bob', email: 'bob@example.com' },
      subdomain: 'alice-blog'
    })).rejects.toThrow(/already taken|reserved/i);

    const tenants = await store.loadTenants();
    expect(tenants).toHaveLength(1);
    expect(tenants[0].paymentKey).toBe('mpesa:RCPT-1');
  });

  it('honours a reservation held by another checkout', async () => {
    await store.reserveSubdomain({ subdomain: 'held.example.test', email: 'someone@else.com', ttlMs: 60000 });
    await expect(provisionTenantFromPayment({
      paymentKey: 'mpesa:RCPT-3',
      buyer: { id: 'buyer-3', name: 'Cara', email: 'cara@example.com' },
      subdomain: 'held'
    })).rejects.toThrow(/reserved/i);
  });
});

describe('custom domain DNS verification', () => {
  const resolver = (overrides = {}) => ({
    resolveTxt: async () => [['verify-token-123']],
    resolveCname: async () => ['custom.example.test'],
    resolve4: async () => [],
    ...overrides
  });

  it('verifies when the TXT token and CNAME match', async () => {
    const result = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'verify-token-123',
      resolver: resolver()
    });
    expect(result.verified).toBe(true);
    expect(result.txtOk).toBe(true);
    expect(result.cnameOk).toBe(true);
  });

  it('verifies apex domains through the A record', async () => {
    const result = await verifyDomainDns({
      hostname: 'customer.com',
      token: 'verify-token-123',
      resolver: resolver({ resolveCname: async () => [], resolve4: async () => ['203.0.113.10'] })
    });
    expect(result.verified).toBe(true);
    expect(result.aOk).toBe(true);
  });

  it('fails when the token is missing or the routing record is wrong', async () => {
    const missingToken = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'wrong-token',
      resolver: resolver()
    });
    expect(missingToken.verified).toBe(false);

    const wrongRoute = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'verify-token-123',
      resolver: resolver({ resolveCname: async () => ['elsewhere.example.net'], resolve4: async () => [] })
    });
    expect(wrongRoute.verified).toBe(false);
  });
});

describe('custom domain DNS diagnostics', () => {
  const baseResolver = (overrides = {}) => ({
    resolveTxt: async () => [['verify-token-123']],
    resolveCname: async () => ['custom.example.test'],
    resolve4: async () => [],
    resolve6: async () => [],
    resolveCaa: async () => [],
    ...overrides
  });

  it('reports warnings for stray AAAA records without failing verification', async () => {
    const result = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'verify-token-123',
      resolver: baseResolver({ resolve6: async () => ['2001:db8::1'] })
    });
    expect(result.verified).toBe(true);
    expect(result.status).toBe('verified');
    const aaaa = result.checks.find(check => check.id === 'aaaa');
    expect(aaaa.status).toBe('warning');
    expect(result.diagnostics.join(' ')).toMatch(/AAAA/);
  });

  it('warns when CAA records exclude known certificate authorities', async () => {
    const result = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'verify-token-123',
      resolver: baseResolver({ resolveCaa: async () => [{ issue: 'some-other-ca.example' }] })
    });
    expect(result.verified).toBe(true);
    expect(result.caaOk).toBe(false);
    const caa = result.checks.find(check => check.id === 'caa');
    expect(caa.status).toBe('warning');
    expect(result.diagnostics.join(' ')).toMatch(/CAA/);
  });

  it('accepts CAA records that allow a known authority', async () => {
    const result = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'verify-token-123',
      resolver: baseResolver({ resolveCaa: async () => [{ issue: 'letsencrypt.org; validationmethods=dns-01' }] })
    });
    expect(result.caaOk).toBe(true);
    expect(result.checks.find(check => check.id === 'caa').status).toBe('ok');
  });

  it('distinguishes pending from mismatched DNS', async () => {
    const pending = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'verify-token-123',
      resolver: baseResolver({ resolveTxt: async () => [], resolveCname: async () => [] })
    });
    expect(pending.verified).toBe(false);
    expect(pending.status).toBe('pending');
    expect(pending.checks.find(check => check.id === 'txt').status).toBe('missing');
    expect(pending.diagnostics.length).toBeGreaterThanOrEqual(2);

    const mismatch = await verifyDomainDns({
      hostname: 'blog.customer.com',
      token: 'verify-token-123',
      resolver: baseResolver({
        resolveTxt: async () => [['stale-token']],
        resolveCname: async () => ['elsewhere.example.net']
      })
    });
    expect(mismatch.verified).toBe(false);
    expect(mismatch.status).toBe('mismatch');
    expect(mismatch.checks.find(check => check.id === 'routing').status).toBe('mismatch');
  });
});
