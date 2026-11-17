const { currentTenantId, isPlatformContext } = require('./context');
const { PLATFORM_TENANT_ID } = require('./config');

function tenantIdOf(record) {
  return record && record.tenantId ? String(record.tenantId) : PLATFORM_TENANT_ID;
}

function filterForTenant(items, tenantId = currentTenantId()) {
  if (!Array.isArray(items)) return [];
  const expected = String(tenantId || PLATFORM_TENANT_ID);
  return items.filter(item => tenantIdOf(item) === expected);
}

function tagForTenant(items, tenantId = currentTenantId()) {
  const expected = String(tenantId || PLATFORM_TENANT_ID);
  return (Array.isArray(items) ? items : []).map(item => ({ ...item, tenantId: expected }));
}

function mergeForTenant(allItems, scopedItems, tenantId = currentTenantId()) {
  const expected = String(tenantId || PLATFORM_TENANT_ID);
  const others = (Array.isArray(allItems) ? allItems : []).filter(item => tenantIdOf(item) !== expected);
  const scoped = (Array.isArray(scopedItems) ? scopedItems : []).map(item => ({ ...item, tenantId: expected }));
  return [...others, ...scoped];
}

module.exports = {
  tenantIdOf,
  filterForTenant,
  tagForTenant,
  mergeForTenant,
  currentTenantId,
  isPlatformContext
};
