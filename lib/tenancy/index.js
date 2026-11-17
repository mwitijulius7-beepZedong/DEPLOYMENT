const config = require('./config');
const context = require('./context');
const scope = require('./scope');
const validation = require('./validation');
const store = require('./store');
const resolve = require('./resolve');
const middleware = require('./middleware');
const provisioning = require('./provision');
const domains = require('./domains');
const dns = require('./dns');
const ssl = require('./ssl');

module.exports = {
  ...config,
  ...context,
  ...validation,
  ...resolve,
  ...middleware,
  ...provisioning,
  ...domains,
  ...dns,
  ...ssl,
  store,
  scope
};
