import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Hermetic setup: no Mongo/KV network calls, and every JSON read/write is
// redirected to a temp directory so the tracked data files stay untouched.
// These assignments must run before the server module is required.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-api-test-'));
process.env.NODE_ENV = 'test';
process.env.DISABLE_LISTEN = 'true';
process.env.DATA_DIR = dataDir;
process.env.MONGODB_URI = '';
process.env.PERSONALBLOG_MONGODB_URI = '';
process.env.KV_REST_API_URL = '';
process.env.KV_REST_API_TOKEN = '';
process.env.DEV_ADMIN_PASSWORD = '';
process.env.DEV_ADMIN_SEED = '';

const seedPosts = [
  {
    id: '1',
    title: 'Newer post about Node',
    subtitle: 'A subtitle',
    content: '<p>Plenty of words so the excerpt and reading time have something to trim from. '.repeat(4) + '</p>',
    date: '2026-01-15T00:00:00.000Z',
    tags: ['node', 'javascript'],
    categoryId: 'cat-a',
    isDraft: false,
    isDeleted: false,
    likes: 0,
    dislikes: 0
  },
  {
    id: '2',
    title: 'Older post about CSS',
    content: '<p>Short body</p>',
    date: '2026-01-01T00:00:00.000Z',
    tags: ['css'],
    categoryId: 'cat-a',
    isDraft: false,
    isDeleted: false,
    likes: 0,
    dislikes: 0
  },
  {
    id: '3',
    title: 'Hidden draft',
    content: '<p>Should never be listed publicly</p>',
    date: '2026-02-01T00:00:00.000Z',
    tags: ['node'],
    isDraft: true,
    isDeleted: false,
    likes: 0,
    dislikes: 0
  }
];

fs.writeFileSync(path.join(dataDir, 'posts.json'), JSON.stringify(seedPosts, null, 2));
fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify({}));

const app = require('../server');

let server;
let base;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const get = async (pathName) => {
  const r = await fetch(`${base}${pathName}`);
  const text = await r.text();
  return {
    status: r.status,
    type: r.headers.get('content-type') || '',
    text,
    json: () => JSON.parse(text)
  };
};

describe('SEO endpoints', () => {
  it('serves an SSR homepage with JSON-LD and a no-JS archive', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('application/ld+json');
    expect(res.text).toContain('<noscript>');
    expect(res.text).toContain('Newer post about Node');
    expect(res.text).not.toContain('Hidden draft');
  });

  it('serves a sitemap with published posts only', async () => {
    const res = await get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.type).toContain('xml');
    expect(res.text).toContain('<urlset');
    expect(res.text).toContain('post.html?id=1');
    expect(res.text).toContain('post.html?id=2');
    expect(res.text).not.toContain('post.html?id=3');
  });

  it('serves an RSS feed', async () => {
    const res = await get('/feed.xml');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<rss');
    expect(res.text).toContain('<item>');
    expect(res.text).toContain('<title>Newer post about Node</title>');
  });

  it('advertises the sitemap from robots.txt', async () => {
    const res = await get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sitemap:');
    expect(res.text).toContain('/sitemap.xml');
  });

  it('injects OG tags and BlogPosting JSON-LD into post pages', async () => {
    const res = await get('/post.html?id=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('og:title');
    expect(res.text).toContain('application/ld+json');
    expect(res.text).toContain('BlogPosting');
  });
});

describe('posts API', () => {
  it('returns full posts by default (backwards compatible)', async () => {
    const res = await get('/api/posts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.posts)).toBe(true);
    expect(body.posts).toHaveLength(2);
    expect(body.posts[0].content).toBeDefined();
    expect(body.posts.find(p => p.id === '3')).toBeUndefined();
  });

  it('returns summaries without body content when summary=1', async () => {
    const res = await get('/api/posts?summary=1');
    const body = await res.json();
    expect(body.summary).toBe(true);
    expect(body.total).toBe(2);
    expect(body.posts[0].content).toBeUndefined();
    expect(body.posts[0].excerpt).toBeTruthy();
    expect(body.posts[0].readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it('paginates with page/limit', async () => {
    const first = await (await get('/api/posts?page=1&limit=1')).json();
    const second = await (await get('/api/posts?page=2&limit=1')).json();
    expect(first.posts).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.total).toBe(2);
    expect(second.posts).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(first.posts[0].id).not.toBe(second.posts[0].id);
  });

  it('filters by tag', async () => {
    const body = await (await get('/api/posts?tag=css')).json();
    expect(body.tag).toBe('css');
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe('2');
  });

  it('exposes prev/next and related posts on the detail endpoint', async () => {
    const body = await (await get('/api/posts/1')).json();
    expect(body.post).toBeDefined();
    expect(body.prev.id).toBe('2');
    expect(body.next).toBeNull();
    expect(Array.isArray(body.related)).toBe(true);
    expect(body.related.map(p => p.id)).toContain('2');
    expect(body.related[0].content).toBeUndefined();
  });
});

describe('license endpoint', () => {
  it('never exposes a license key to unauthenticated callers', async () => {
    const body = await (await get('/api/payments/license/nobody@example.com')).json();
    expect(body.success).toBe(true);
    expect(body.hasLicense).toBe(false);
    expect(body.licenseKey).toBeUndefined();
  });
});

describe('auth', () => {
  it('rejects invalid credentials with 401', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nobody', password: 'wrong-password' })
    });
    expect(res.status).toBe(401);
  });
});
