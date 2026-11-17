const { AsyncLocalStorage } = require('node:async_hooks');
const { PLATFORM_TENANT_ID } = require('./config');

const storage = new AsyncLocalStorage();

function currentContext() {
  return storage.getStore() || null;
}

function currentTenant() {
  return currentContext()?.tenant || null;
}

function currentTenantId() {
  return currentTenant()?.id || PLATFORM_TENANT_ID;
}

function isPlatformContext() {
  return currentTenantId() === PLATFORM_TENANT_ID;
}

function runWithTenant(context, fn) {
  return storage.run(context, fn);
}

module.exports = {
  currentContext,
  currentTenant,
  currentTenantId,
  isPlatformContext,
  runWithTenant
};
