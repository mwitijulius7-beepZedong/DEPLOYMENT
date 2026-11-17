const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { runWithTenant } = require('./context');
const {
  getHostFromRequest,
  platformContext,
  resolveTenantForHost,
  resolveTenantById
} = require('./resolve');

function wantsHtml(req) {
  if (req.path && req.path.startsWith('/api/')) return false;
  return String(req.get('accept') || '').includes('text/html');
}

function notFound(req, res) {
  if (!wantsHtml(req)) {
    return res.status(404).json({ error: 'unknown_host', message: 'No site is configured for this hostname.' });
  }
  res.status(404);
  const page = path.join(__dirname, '..', '..', 'public', '404.html');
  if (fs.existsSync(page)) return res.sendFile(page);
  return res.type('html').send(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Site not found</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#faf9f7;color:#171715}main{text-align:center;padding:24px}h1{font-size:28px;margin:0 0 8px}p{color:#6b6b63}</style>' +
    '<main><h1>Site not found</h1><p>No blog is configured for this address.</p></main>'
  );
}

function decodeBearer(req, jwtSecret) {
  const header = req.get('authorization') || '';
  if (!jwtSecret || !header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.substring(7), jwtSecret);
  } catch {
    return null;
  }
}

async function hostGate(req, res, next) {
  try {
    const host = getHostFromRequest(req);
    const context = await resolveTenantForHost(host);

    // Unknown hostnames never fall through to another tenant's blog.
    if (!context) return notFound(req, res);

    req.hostTenant = context;
    next();
  } catch (e) {
    console.error('[tenancy] host resolution failed:', e.message);
    next();
  }
}

function createContextMiddleware({ jwtSecret } = {}) {
  return async function tenantContext(req, res, next) {
    try {
      const hostContext = req.hostTenant || platformContext(getHostFromRequest(req));
      let effective = hostContext;

      const sessionUser = req.session?.user;
      const bearerUser = sessionUser ? null : decodeBearer(req, jwtSecret);
      const user = sessionUser || bearerUser;
      const tenantScoped = user && user.tenantId;

      if (tenantScoped && (effective.platform || !effective)) {
        const byId = await resolveTenantById(user.tenantId);
        if (byId) effective = byId;
      }

      req.hostTenant = hostContext;
      req.tenantContext = effective;
      req.tenant = effective.tenant;
      req.tenantId = effective.tenant.id;
      req.isPlatformTenant = Boolean(effective.platform);

      // Customer dashboards are opened on the main platform domain. The
      // session cookie stays host-only (no Domain attribute) so tenants can
      // never read each other's sessions on subdomains.
      if (effective.domain && !effective.platform && effective.tenant?.primaryHostname) {
        const isPrimaryHost = effective.domain.hostname === effective.tenant.primaryHostname;
        const isRead = req.method === 'GET' || req.method === 'HEAD';
        const isApi = req.path.startsWith('/api/');
        if (!isPrimaryHost && isRead && !isApi && effective.domain.status === 'active') {
          const scheme = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
          return res.redirect(301, `${scheme}://${effective.tenant.primaryHostname}${req.originalUrl}`);
        }
      }

      return runWithTenant(
        { tenant: effective.tenant, domain: effective.domain, platform: effective.platform },
        () => next()
      );
    } catch (e) {
      console.error('[tenancy] context failed:', e.message);
      return next();
    }
  };
}

module.exports = { hostGate, createContextMiddleware, notFound };
