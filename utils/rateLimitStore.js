'use strict';

/**
 * Shared rate-limit store for express-rate-limit.
 *
 * Uses the Upstash Redis REST protocol (the same endpoint Vercel KV exposes),
 * so counters are shared across serverless instances. No extra dependency is
 * required — the REST API is called with fetch.
 *
 * When no Redis is configured, createRateLimitStore returns undefined and
 * express-rate-limit keeps its per-process MemoryStore. If Redis is configured
 * but unreachable, each instance falls back to a local MemoryStore so abuse
 * protection degrades instead of disappearing.
 */

const { MemoryStore } = require('express-rate-limit');

const REQUEST_TIMEOUT_MS = 2000;
const WARN_INTERVAL_MS = 60 * 1000;

function config() {
  return {
    url: String(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, ''),
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || ''
  };
}

function isSharedStoreEnabled() {
  const { url, token } = config();
  return Boolean(url && token);
}

async function runCommands(commands) {
  const { url, token } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`upstash_http_${response.status}`);
    const body = await response.json();
    const results = Array.isArray(body) ? body : [];
    const failure = results.find(item => item && item.error);
    if (failure) throw new Error(String(failure.error));
    return results.map(item => item && item.result);
  } finally {
    clearTimeout(timer);
  }
}

class SharedRateLimitStore {
  constructor(prefix = 'rl') {
    this.prefix = `rl:${String(prefix || 'rl')}:`;
    this.localKeys = false;
    this.windowMs = 60 * 1000;
    this.lastWarnAt = 0;
    this.fallback = new MemoryStore();
  }

  init(options = {}) {
    this.windowMs = Number(options.windowMs) || this.windowMs;
    if (typeof this.fallback.init === 'function') this.fallback.init(options);
  }

  warn(message) {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_INTERVAL_MS) return;
    this.lastWarnAt = now;
    console.warn('[rate-limit] shared store unavailable, using local counters:', message);
  }

  async increment(identifier) {
    const key = `${this.prefix}${identifier}`;
    try {
      const [totalHits, pttl] = await runCommands([['INCR', key], ['PTTL', key]]);
      let ttl = Number(pttl);
      if (!Number.isFinite(ttl) || ttl < 0) {
        await runCommands([['PEXPIRE', key, this.windowMs]]);
        ttl = this.windowMs;
      }
      return {
        totalHits: Number(totalHits) || 0,
        resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs))
      };
    } catch (e) {
      this.warn(e.message);
      return this.fallback.increment(identifier);
    }
  }

  async decrement(identifier) {
    try {
      await runCommands([['DECR', `${this.prefix}${identifier}`]]);
    } catch (e) {
      this.warn(e.message);
      if (typeof this.fallback.decrement === 'function') this.fallback.decrement(identifier);
    }
  }

  async resetKey(identifier) {
    try {
      await runCommands([['DEL', `${this.prefix}${identifier}`]]);
    } catch (e) {
      this.warn(e.message);
      if (typeof this.fallback.resetKey === 'function') this.fallback.resetKey(identifier);
    }
  }
}

function createRateLimitStore(name) {
  return isSharedStoreEnabled() ? new SharedRateLimitStore(name) : undefined;
}

module.exports = {
  SharedRateLimitStore,
  createRateLimitStore,
  isSharedStoreEnabled
};
