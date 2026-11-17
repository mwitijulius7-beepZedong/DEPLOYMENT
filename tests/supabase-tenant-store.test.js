import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Minimal in-memory stand-in for the supabase-js query builder, covering the
// chains used by utils/supabaseStore.js. Rows live in per-table arrays so the
// tests can assert which rows a query touched.
function createFakeSupabase(seed = {}, options = {}) {
  const tables = new Map(
    Object.entries(seed).map(([name, rows]) => [name, rows.map(row => ({ ...row }))])
  );
  const calls = [];
  const missingTenantColumns = Boolean(options.missingTenantColumns);

  const rowsFor = name => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };

  const missingColumnError = name => ({
    data: null,
    error: { code: '42703', message: `column ${name}.tenant_id does not exist` }
  });

  const matches = (row, filters) => filters.every(([column, op, value]) => {
    if (op === 'eq') return String(row[column]) === String(value);
    if (op === 'in') return value.map(String).includes(String(row[column]));
    if (op === 'neq') return String(row[column]) !== String(value);
    return true;
  });

  function from(name) {
    const state = {
      name,
      filters: [],
      projection: 'id,data',
      action: 'select',
      payload: null,
      order: null,
      range: null
    };

    function execute() {
      calls.push({ table: name, action: state.action, filters: state.filters.map(filter => [...filter]) });
      const rows = rowsFor(name);

      if (missingTenantColumns) {
        const touchesTenant = state.filters.some(([column]) => column === 'tenant_id')
          || (state.payload || []).some(row => row && Object.prototype.hasOwnProperty.call(row, 'tenant_id'));
        if (touchesTenant) return missingColumnError(name);
      }

      if (state.action === 'upsert') {
        for (const row of state.payload) {
          const index = rows.findIndex(item => String(item.id) === String(row.id));
          if (index === -1) rows.push({ ...row });
          else rows[index] = { ...rows[index], ...row };
        }
        return { data: null, error: null };
      }

      if (state.action === 'insert') {
        for (const row of state.payload) rows.push({ ...row });
        return { data: null, error: null };
      }

      if (state.action === 'delete') {
        const kept = rows.filter(row => !matches(row, state.filters));
        rows.splice(0, rows.length, ...kept);
        return { data: null, error: null };
      }

      let result = rows.filter(row => matches(row, state.filters));
      if (state.order) {
        const { column, ascending } = state.order;
        result = [...result].sort((a, b) => {
          if (a[column] === b[column]) return 0;
          return (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1);
        });
      }
      if (state.range) result = result.slice(state.range[0], state.range[1] + 1);

      return {
        data: result.map(row => (
          String(state.projection).includes('data') ? { id: row.id, data: row.data } : { id: row.id }
        )),
        error: null
      };
    }

    const builder = {
      select(projection) { state.projection = projection; return builder; },
      eq(column, value) { state.filters.push([column, 'eq', value]); return builder; },
      in(column, values) { state.filters.push([column, 'in', values]); return builder; },
      neq(column, value) { state.filters.push([column, 'neq', value]); return builder; },
      order(column, options = {}) { state.order = { column, ascending: options.ascending !== false }; return builder; },
      range(from, to) { state.range = [from, to]; return builder; },
      upsert(rows) {
        state.action = 'upsert';
        state.payload = Array.isArray(rows) ? rows : [rows];
        return Promise.resolve(execute());
      },
      insert(rows) {
        state.action = 'insert';
        state.payload = Array.isArray(rows) ? rows : [rows];
        return Promise.resolve(execute());
      },
      delete() { state.action = 'delete'; return builder; },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); }
    };

    return builder;
  }

  return { from, __tables: tables, __calls: calls };
}

function loadStoreWith(fake) {
  const supabasePath = require.resolve('../utils/supabase');
  const storePath = require.resolve('../utils/supabaseStore');
  const previous = require.cache[supabasePath];
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      isSupabaseEnabled: () => true,
      getSupabase: () => fake
    }
  };
  delete require.cache[storePath];
  const store = require('../utils/supabaseStore');

  return {
    store,
    restore() {
      if (previous) require.cache[supabasePath] = previous;
      else delete require.cache[supabasePath];
      delete require.cache[storePath];
    }
  };
}

describe('Supabase tenant-scoped store', () => {
  it('filters reads by tenant at the query level', async () => {
    const fake = createFakeSupabase({
      posts: [
        { id: 'a-post', tenant_id: 'tenant-a', data: { id: 'a-post', title: 'A', date: '2026-01-02' } },
        { id: 'b-post', tenant_id: 'tenant-b', data: { id: 'b-post', title: 'B', date: '2026-01-01' } }
      ]
    });
    const { store, restore } = loadStoreWith(fake);
    try {
      const posts = await store.loadPostsForTenant('tenant-a');
      expect(posts.map(post => post.id)).toEqual(['a-post']);
      const select = fake.__calls.find(call => call.action === 'select');
      expect(select.filters).toContainEqual(['tenant_id', 'eq', 'tenant-a']);
    } finally {
      restore();
    }
  });

  it('writes and prunes only the calling tenant rows', async () => {
    const fake = createFakeSupabase({
      posts: [
        { id: 'a-old', tenant_id: 'tenant-a', data: { id: 'a-old', date: '2026-01-01' } },
        { id: 'a-live', tenant_id: 'tenant-a', data: { id: 'a-live', date: '2026-01-02' } },
        { id: 'b-live', tenant_id: 'tenant-b', data: { id: 'b-live', date: '2026-01-03' } }
      ]
    });
    const { store, restore } = loadStoreWith(fake);
    try {
      await store.savePostsForTenant('tenant-a', [
        { id: 'a-live', title: 'updated' },
        { id: 'a-new', title: 'new' }
      ]);

      const rows = fake.__tables.get('posts');
      expect(rows.map(row => row.id).sort()).toEqual(['a-live', 'a-new', 'b-live']);
      expect(rows.find(row => row.id === 'a-new').tenant_id).toBe('tenant-a');
      expect(rows.find(row => row.id === 'b-live').tenant_id).toBe('tenant-b');
    } finally {
      restore();
    }
  });

  it('tags direct comment and subscription inserts with the ambient tenant', async () => {
    const fake = createFakeSupabase();
    const { store, restore } = loadStoreWith(fake);
    const { runWithTenant } = require('../lib/tenancy/context');
    try {
      await runWithTenant({ tenant: { id: 'tenant-a' } }, async () => {
        await store.insertComment({ id: 'c1', postId: 'p1', content: 'hi' });
        await store.insertSubscription({ id: 's1', email: 'x@example.com', postId: 'p1' });
      });

      expect(fake.__tables.get('comments')[0].tenant_id).toBe('tenant-a');
      expect(fake.__tables.get('subscriptions')[0].tenant_id).toBe('tenant-a');
    } finally {
      restore();
    }
  });
});

describe('Supabase before the tenancy migration is applied', () => {
  it('serves platform content unscoped instead of failing', async () => {
    const fake = createFakeSupabase({
      posts: [
        { id: 'p1', data: { id: 'p1', title: 'One' } },
        { id: 'p2', data: { id: 'p2', title: 'Two' } }
      ]
    }, { missingTenantColumns: true });
    const { store, restore } = loadStoreWith(fake);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const posts = await store.loadPostsForTenant('platform');
      expect(posts.map(post => post.id).sort()).toEqual(['p1', 'p2']);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      restore();
    }
  });

  it('still refuses cross-tenant reads without tenant columns', async () => {
    const fake = createFakeSupabase({ posts: [] }, { missingTenantColumns: true });
    const { store, restore } = loadStoreWith(fake);
    try {
      await expect(store.loadPostsForTenant('tenant-a')).rejects.toThrow(/tenant_id/);
    } finally {
      restore();
    }
  });

  it('saves platform rows without a tenant_id column', async () => {
    const fake = createFakeSupabase({ posts: [] }, { missingTenantColumns: true });
    const { store, restore } = loadStoreWith(fake);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await store.savePostsForTenant('platform', [{ id: 'p1', title: 'Legacy write' }]);
      const rows = fake.__tables.get('posts');
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('p1');
      expect(rows[0]).not.toHaveProperty('tenant_id');
    } finally {
      warn.mockRestore();
      restore();
    }
  });

  it('inserts platform comments without a tenant_id column', async () => {
    const fake = createFakeSupabase({}, { missingTenantColumns: true });
    const { store, restore } = loadStoreWith(fake);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runWithTenant } = require('../lib/tenancy/context');
    try {
      await runWithTenant({ tenant: { id: 'platform' }, platform: true }, async () => {
        await store.insertComment({ id: 'c1', postId: 'p1', content: 'hello' });
      });
      const rows = fake.__tables.get('comments');
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('tenant_id');
    } finally {
      warn.mockRestore();
      restore();
    }
  });
});
