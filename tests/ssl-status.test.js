import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ssl.js talks to Cloudflare through node-fetch; stub it in the require cache
// before loading the module so no real network calls happen.
const fetchPath = require.resolve('node-fetch');
let responses = [];
let calls = [];
const fakeFetch = async (url, options = {}) => {
  calls.push({ url, options });
  const next = responses.shift();
  if (next instanceof Error) throw next;
  return {
    ok: next.ok !== false,
    status: next.status || 200,
    json: async () => next.body
  };
};
require.cache[fetchPath] = {
  id: fetchPath,
  filename: fetchPath,
  loaded: true,
  exports: fakeFetch
};

process.env.CLOUDFLARE_API_TOKEN = 'test-token';
process.env.CLOUDFLARE_ZONE_ID = 'test-zone';

const { getCustomHostnameStatus, isCloudflareEnabled } = require('../lib/tenancy/ssl');

function clearEnv() {
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ZONE_ID;
}

beforeEach(() => {
  responses = [];
  calls = [];
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  process.env.CLOUDFLARE_ZONE_ID = 'test-zone';
});

afterEach(() => {
  clearEnv();
});

describe('Cloudflare custom hostname status', () => {
  it('reports when Cloudflare is not configured', async () => {
    clearEnv();
    expect(isCloudflareEnabled()).toBe(false);
    expect(await getCustomHostnameStatus('host-1')).toEqual({ ok: false, skipped: true });
    expect(calls.length).toBe(0);
  });

  it('maps hostname and certificate status from the API', async () => {
    responses.push({
      body: {
        result: {
          status: 'active',
          ssl: {
            status: 'pending_validation',
            validation_errors: [{ message: 'TXT record not found' }, 'Retry later']
          }
        }
      }
    });

    const result = await getCustomHostnameStatus('host-1');

    expect(calls[0].url).toContain('/zones/test-zone/custom_hostnames/host-1');
    expect(calls[0].options.headers.Authorization).toBe('Bearer test-token');
    expect(result).toEqual({
      ok: true,
      provider: 'cloudflare',
      hostnameStatus: 'active',
      sslStatus: 'pending_validation',
      sslValidationErrors: ['TXT record not found', 'Retry later']
    });
  });

  it('returns an error instead of throwing when Cloudflare rejects the call', async () => {
    responses.push({ ok: false, status: 404, body: { errors: [{ message: 'not found' }] } });
    const rejected = await getCustomHostnameStatus('missing-host');
    expect(rejected).toEqual({ ok: false, error: 'not found' });

    responses.push(new Error('socket hang up'));
    const network = await getCustomHostnameStatus('host-1');
    expect(network.ok).toBe(false);
    expect(network.error).toMatch(/socket hang up/);
  });
});
