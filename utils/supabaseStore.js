const crypto = require('crypto');
const { getSupabase, isSupabaseEnabled } = require('./supabase');

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;

function db() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function asString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  return str.length ? str : null;
}

function idOf(item) {
  return item ? (item.id !== undefined && item.id !== null ? item.id : item._id) : undefined;
}

function makeId(item) {
  const raw = idOf(item);
  if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw);
  return crypto.randomUUID();
}

function cloneData(item, id) {
  const data = { ...(item || {}) };
  delete data._id;
  if (data.id === undefined || data.id === null) data.id = id;
  return data;
}

async function selectAll(table, order) {
  const rows = [];
  let from = 0;
  for (;;) {
    let query = db().from(table).select('id,data').range(from, from + PAGE_SIZE - 1);
    if (order) query = query.order(order.column, { ascending: Boolean(order.ascending), nullsFirst: false });
    const { data, error } = await query;
    if (error) throw new Error(`Supabase ${table} select failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows.map(row => ({ ...(row.data || {}), id: row.id }));
}

async function selectRaw(table, order) {
  const rows = [];
  let from = 0;
  for (;;) {
    let query = db().from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (order) query = query.order(order.column, { ascending: Boolean(order.ascending), nullsFirst: false });
    const { data, error } = await query;
    if (error) throw new Error(`Supabase ${table} select failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function replaceRows(table, rows) {
  const deduped = new Map();
  for (const row of rows) {
    if (row && row.id !== undefined && row.id !== null) deduped.set(String(row.id), row);
  }
  const unique = [...deduped.values()];

  if (unique.length === 0) {
    const { error } = await db().from(table).delete().neq('id', '__never__');
    if (error) throw new Error(`Supabase ${table} clear failed: ${error.message}`);
    return;
  }

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const { error } = await db().from(table).upsert(unique.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
    if (error) throw new Error(`Supabase ${table} upsert failed: ${error.message}`);
  }

  const { data: existing, error: existingError } = await db().from(table).select('id');
  if (existingError) throw new Error(`Supabase ${table} id scan failed: ${existingError.message}`);

  const keep = new Set(unique.map(row => String(row.id)));
  const stale = (existing || []).map(row => row.id).filter(id => !keep.has(String(id)));
  for (let i = 0; i < stale.length; i += CHUNK_SIZE) {
    const { error } = await db().from(table).delete().in('id', stale.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(`Supabase ${table} stale delete failed: ${error.message}`);
  }
}

// ── Users ───────────────────────────────────────────────────────────────────

async function loadUsers() {
  const users = await selectAll('users', { column: 'username', ascending: true });
  const result = {};
  for (const user of users) {
    const key = user.username || user.id;
    if (!key) continue;
    if (!user.role) user.role = 'ADMIN';
    result[key] = user;
  }
  return result;
}

async function saveUsers(users) {
  const rows = Object.entries(users || {}).map(([username, user]) => {
    const data = { ...(user || {}), username: (user && user.username) || username };
    const id = String(data.username);
    data.id = data.id === undefined || data.id === null ? id : data.id;
    return {
      id,
      username: data.username,
      email: asString(data.email),
      role: data.role || 'ADMIN',
      active: asBool(data.active, true),
      data,
      updated_at: new Date().toISOString()
    };
  });
  await replaceRows('users', rows);
}

// ── Posts ───────────────────────────────────────────────────────────────────

function postRow(post) {
  const id = makeId(post);
  const data = cloneData(post, id);
  return {
    id,
    date: toIso(data.date),
    is_draft: asBool(data.isDraft),
    is_deleted: asBool(data.isDeleted),
    author_username: asString(data.authorUsername || data.author),
    tags: Array.isArray(data.tags) ? data.tags.filter(tag => typeof tag === 'string') : [],
    data,
    updated_at: new Date().toISOString()
  };
}

async function loadPosts() {
  return (await selectAll('posts', { column: 'date', ascending: false })).map(post => {
    if (!post.id) post.id = String(post._id || '');
    return post;
  });
}

async function savePosts(posts) {
  await replaceRows('posts', (posts || []).map(postRow));
}

async function adjustPostCounter(id, field, delta) {
  const { data, error } = await db().rpc('adjust_post_counter', {
    p_id: String(id),
    p_field: field,
    p_delta: delta
  });
  if (error) throw new Error(`Supabase post counter update failed: ${error.message}`);
  return data === null || data === undefined ? null : Number(data);
}

// ── Comments ────────────────────────────────────────────────────────────────

function commentRow(comment) {
  const id = makeId(comment);
  const data = cloneData(comment, id);
  return {
    id,
    post_id: asString(data.postId),
    date: toIso(data.date || data.timestamp),
    approved: data.approved !== false,
    data,
    updated_at: new Date().toISOString()
  };
}

async function loadComments() {
  return selectAll('comments', { column: 'date', ascending: false });
}

async function saveComments(comments) {
  await replaceRows('comments', (comments || []).map(commentRow));
}

async function insertComment(comment) {
  const row = commentRow(comment);
  const { error } = await db().from('comments').insert(row);
  if (error) throw new Error(`Supabase comment insert failed: ${error.message}`);
  return row.data;
}

// ── Categories ──────────────────────────────────────────────────────────────

async function loadCategories() {
  return selectAll('categories', { column: 'id', ascending: true });
}

async function saveCategories(categories) {
  await replaceRows('categories', (categories || []).map(category => {
    const id = makeId(category);
    return { id, data: cloneData(category, id), updated_at: new Date().toISOString() };
  }));
}

// ── Subscriptions ───────────────────────────────────────────────────────────

async function loadSubscriptions() {
  return selectAll('subscriptions', { column: 'id', ascending: true });
}

function subscriptionRow(subscription) {
  const id = makeId(subscription);
  const data = cloneData(subscription, id);
  return {
    id,
    email: asString(data.email),
    post_id: asString(data.postId),
    data,
    updated_at: new Date().toISOString()
  };
}

async function saveSubscriptions(subscriptions) {
  await replaceRows('subscriptions', (subscriptions || []).map(subscriptionRow));
}

async function insertSubscription(subscription) {
  const row = subscriptionRow(subscription);
  const { error } = await db().from('subscriptions').insert(row);
  if (error) throw new Error(`Supabase subscription insert failed: ${error.message}`);
  return row.data;
}

// ── Themes ──────────────────────────────────────────────────────────────────

async function loadThemes() {
  return selectAll('themes', { column: 'year', ascending: false });
}

async function saveThemes(themes) {
  await replaceRows('themes', (themes || []).map(theme => {
    const id = makeId(theme);
    const data = cloneData(theme, id);
    const year = Number(data.year);
    return {
      id,
      month: asString(data.month),
      year: Number.isFinite(year) ? year : null,
      data,
      updated_at: new Date().toISOString()
    };
  }));
}

// ── Template buyers / applications ─────────────────────────────────────────

async function loadTemplateBuyers() {
  return selectAll('template_buyers', { column: 'id', ascending: true });
}

async function saveTemplateBuyers(buyers) {
  await replaceRows('template_buyers', (buyers || []).map(buyer => {
    const id = makeId(buyer);
    const data = cloneData(buyer, id);
    return {
      id,
      email: asString(data.email),
      license_key: asString(data.licenseKey),
      data,
      updated_at: new Date().toISOString()
    };
  }));
}

async function loadTemplateApplications() {
  return selectAll('template_applications', { column: 'id', ascending: true });
}

async function saveTemplateApplications(applications) {
  await replaceRows('template_applications', (applications || []).map(application => {
    const id = makeId(application);
    const data = cloneData(application, id);
    return {
      id,
      email: asString(data.email),
      data,
      updated_at: new Date().toISOString()
    };
  }));
}

// ── MPesa transactions ──────────────────────────────────────────────────────

async function loadMpesaTransactions() {
  return selectAll('mpesa_transactions', { column: 'id', ascending: true });
}

async function saveMpesaTransactions(transactions) {
  await replaceRows('mpesa_transactions', (transactions || []).map(transaction => {
    const id = makeId(transaction);
    const data = cloneData(transaction, id);
    return {
      id,
      checkout_request_id: asString(data.checkoutRequestId || data.CheckoutRequestID),
      status: asString(data.status),
      data,
      updated_at: new Date().toISOString()
    };
  }));
}

// ── Settings ────────────────────────────────────────────────────────────────

async function loadSettingsObject() {
  const { data, error } = await db().from('settings').select('data').eq('type', 'app').maybeSingle();
  if (error) throw new Error(`Supabase settings load failed: ${error.message}`);
  return data ? data.data : null;
}

async function saveSettingsObject(settings) {
  const { error } = await db().from('settings').upsert(
    { type: 'app', data: settings, updated_at: new Date().toISOString() },
    { onConflict: 'type' }
  );
  if (error) throw new Error(`Supabase settings save failed: ${error.message}`);
}

async function loadSetting(type) {
  const settings = (await loadSettingsObject()) || {};
  if (type === 'background') {
    return {
      backgroundUrl: settings.backgroundUrl || '',
      backgrounds: Array.isArray(settings.backgrounds) ? settings.backgrounds : []
    };
  }
  return { [type]: settings[type] };
}

async function saveSetting(type, fields) {
  const settings = (await loadSettingsObject()) || {};
  if (type === 'background') {
    if (fields.backgroundUrl !== undefined) settings.backgroundUrl = fields.backgroundUrl;
    if (fields.backgrounds !== undefined) settings.backgrounds = fields.backgrounds;
  } else if (fields && Object.prototype.hasOwnProperty.call(fields, type)) {
    settings[type] = fields[type];
  } else {
    settings[type] = fields;
  }
  await saveSettingsObject(settings);
  return true;
}

// ── Single-document app state ───────────────────────────────────────────────

async function loadAppState(key) {
  const { data, error } = await db().from('app_state').select('data').eq('key', key).maybeSingle();
  if (error) throw new Error(`Supabase app_state load failed (${key}): ${error.message}`);
  return data ? data.data : null;
}

async function saveAppState(key, value) {
  const { error } = await db().from('app_state').upsert(
    { key, data: value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(`Supabase app_state save failed (${key}): ${error.message}`);
}

async function loadAbout() {
  return loadAppState('about');
}

async function saveAbout(about) {
  await saveAppState('about', about);
}

async function loadSecurityLogs() {
  const state = await loadAppState('security_logs');
  if (Array.isArray(state)) return state;
  return state && Array.isArray(state.logs) ? state.logs : [];
}

async function saveSecurityLogs(logs) {
  await saveAppState('security_logs', Array.isArray(logs) ? logs : []);
}

async function loadResetTokens() {
  const state = await loadAppState('reset_tokens');
  return state && state.tokens && typeof state.tokens === 'object' ? state.tokens : {};
}

async function saveResetTokens(tokens) {
  await saveAppState('reset_tokens', { tokens: tokens || {} });
}

// ── Analytics events ────────────────────────────────────────────────────────

async function loadAnalytics() {
  const events = await selectRaw('analytics_events', { column: 'created_at', ascending: true });
  const analytics = { pageViews: [], postViews: [], interactions: [] };
  for (const event of events) {
    if (event.kind === 'page_view') {
      analytics.pageViews.push({
        page: event.page,
        ip: event.ip,
        userAgent: event.user_agent,
        timestamp: event.created_at
      });
    } else if (event.kind === 'post_view') {
      analytics.postViews.push({
        postId: event.post_id,
        ip: event.ip,
        userAgent: event.user_agent,
        timestamp: event.created_at
      });
    } else if (event.kind === 'interaction') {
      analytics.interactions.push({
        id: event.id,
        type: event.interaction_type,
        target: event.target,
        value: event.value,
        ip: event.ip,
        userAgent: event.user_agent,
        timestamp: event.created_at
      });
    }
  }
  return analytics;
}

async function recordInteraction(type, target, value = '', req = null) {
  const { error } = await db().from('analytics_events').insert({
    kind: 'interaction',
    interaction_type: String(type || ''),
    target: String(target || ''),
    value: String(value || ''),
    ip: req ? (req.ip || req.socket?.remoteAddress || 'system') : 'system',
    user_agent: req ? (req.get('User-Agent') || '') : 'system'
  });
  if (error) throw new Error(`Supabase interaction insert failed: ${error.message}`);
}

async function recordPageView(page, req) {
  const { error } = await db().from('analytics_events').insert({
    kind: 'page_view',
    page: String(page || '/'),
    ip: req ? (req.ip || req.socket?.remoteAddress || 'unknown') : 'unknown',
    user_agent: req ? (req.get('User-Agent') || '') : 'unknown'
  });
  if (error) throw new Error(`Supabase page view insert failed: ${error.message}`);
}

async function saveAnalytics(analytics) {
  const { error: clearError } = await db().from('analytics_events').delete().neq('id', -1);
  if (clearError) throw new Error(`Supabase analytics clear failed: ${clearError.message}`);

  const records = [];
  for (const view of analytics.pageViews || []) {
    const created_at = toIso(view.timestamp);
    records.push({
      kind: 'page_view',
      page: asString(view.page),
      ip: asString(view.ip),
      user_agent: asString(view.userAgent),
      ...(created_at ? { created_at } : {})
    });
  }
  for (const view of analytics.postViews || []) {
    const created_at = toIso(view.timestamp);
    records.push({
      kind: 'post_view',
      post_id: asString(view.postId),
      ip: asString(view.ip),
      user_agent: asString(view.userAgent),
      ...(created_at ? { created_at } : {})
    });
  }
  for (const interaction of analytics.interactions || []) {
    const created_at = toIso(interaction.timestamp);
    records.push({
      kind: 'interaction',
      interaction_type: asString(interaction.type),
      target: asString(interaction.target),
      value: interaction.value === undefined || interaction.value === null ? null : String(interaction.value),
      ip: asString(interaction.ip),
      user_agent: asString(interaction.userAgent),
      ...(created_at ? { created_at } : {})
    });
  }

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const { error } = await db().from('analytics_events').insert(records.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(`Supabase analytics insert failed: ${error.message}`);
  }
}

module.exports = {
  isSupabaseEnabled,
  loadUsers,
  saveUsers,
  loadPosts,
  savePosts,
  adjustPostCounter,
  loadComments,
  saveComments,
  insertComment,
  loadCategories,
  saveCategories,
  loadSubscriptions,
  saveSubscriptions,
  insertSubscription,
  loadThemes,
  saveThemes,
  loadTemplateBuyers,
  saveTemplateBuyers,
  loadTemplateApplications,
  saveTemplateApplications,
  loadMpesaTransactions,
  saveMpesaTransactions,
  loadSettingsObject,
  saveSettingsObject,
  loadSetting,
  saveSetting,
  loadAppState,
  saveAppState,
  loadAbout,
  saveAbout,
  loadSecurityLogs,
  saveSecurityLogs,
  loadResetTokens,
  saveResetTokens,
  loadAnalytics,
  saveAnalytics,
  recordInteraction,
  recordPageView
};
