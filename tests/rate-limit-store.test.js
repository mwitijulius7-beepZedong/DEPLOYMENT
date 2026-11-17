import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  SharedRateLimitStore,
  createRateLimitStore,
  isSharedStoreEnabled
} = require('../utils/rateLimitStore');

const REDIS_URL = 'https://redis.example.test';

function pipelineResponse(...results) {
  return {
    ok: true,
    status: 200,
    json: async () => results.map(result => ({ result }))
  };
}

function clearEnv() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

beforeEach(() => {
  clearEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearEnv();
});

describe('shared rate limit store configuration', () => {
  it('is disabled when no Redis credentials are configured', () => {
    expect(isSharedStoreEnabled()).toBe(false);
    expect(createRateLimitStore('auth')).toBeUndefined();
  });

  it('accepts Upstash or Vercel KV credentials', () => {
    process.env.KV_REST_API_URL = REDIS_URL;
    process.env.KV_REST_API_TOKEN = 'kv-token';
    expect(isSharedStoreEnabled()).toBe(true);
    expect(createRateLimitStore('auth')).toBeInstanceOf(SharedRateLimitStore);
  });
});

describe('SharedRateLimitStore', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = REDIS_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token';
  });

  it('increments via the pipeline endpoint with a prefixed key', async () => {
    const fetchMock = vi.fn(async () => pipelineResponse(3, 45_000));
    vi.stubGlobal('fetch', fetchMock);

    const store = new SharedRateLimitStore('auth');
    store.init({ windowMs: 60_000 });
    const result = await store.increment('203.0.113.7');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${REDIS_URL}/pipeline`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(options.body)).toEqual([
      ['INCR', 'rl:auth:203.0.113.7'],
      ['PTTL', 'rl:auth:203.0.113.7']
    ]);
    expect(result.totalHits).toBe(3);
    expect(result.resetTime.getTime()).toBeGreaterThan(Date.now() + 40_000);
  });

  it('sets the expiry when the key has no TTL yet', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(pipelineResponse(1, -1))
      .mockResolvedValueOnce(pipelineResponse(1));
    vi.stubGlobal('fetch', fetchMock);

    const store = new SharedRateLimitStore('api');
    store.init({ windowMs: 30_000 });
    const result = await store.increment('198.51.100.4');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual([
      ['PEXPIRE', 'rl:api:198.51.100.4', 30_000]
    ]);
    expect(result.totalHits).toBe(1);
    expect(result.resetTime.getTime()).toBeGreaterThan(Date.now() + 25_000);
  });

  it('sends DECR and DEL for decrement and resetKey', async () => {
    const fetchMock = vi.fn(async () => pipelineResponse(0));
    vi.stubGlobal('fetch', fetchMock);

    const store = new SharedRateLimitStore('subdomain');
    await store.decrement('key-1');
    await store.resetKey('key-1');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([['DECR', 'rl:subdomain:key-1']]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual([['DEL', 'rl:subdomain:key-1']]);
  });

  it('falls back to local counters when Redis is unreachable', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = new SharedRateLimitStore('verify');
    store.init({ windowMs: 60_000 });
    const first = await store.increment('tenant-a');
    const firstHits = first.totalHits;
    const second = await store.increment('tenant-a');

    expect(firstHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back when the pipeline returns an error result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ error: 'ERR wrong type' }]
    })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = new SharedRateLimitStore('auth');
    store.init({ windowMs: 60_000 });
    const result = await store.increment('redis-error');
    expect(result.totalHits).toBe(1);
  });
});
