require('dotenv').config();
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createRateLimitStore } = require('./utils/rateLimitStore');
const fetch = require('node-fetch');
const session = require('express-session');
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { put } = require('@vercel/blob');
const cloudinary = require('cloudinary').v2;
const { encryptText, decryptText, isLocalhostRequest, isLocalhostAdminKeyBypassEnabled, recordFailedAttempt, isLockedOut, clearBruteRecord, getClientIP, findUserKey, findUserKeyByEmail } = require('./utils/adminKey');
const { getMongoDB, setKV, ObjectId, saveWithFallback, loadWithFallback, loadWithFallbackSingle } = require('./utils/storage');
const { isSupabaseEnabled, uploadToSupabaseStorage, listSupabaseStorage, deleteFromSupabaseStorage } = require('./utils/supabase');
const supabaseStore = require('./utils/supabaseStore');
const errorHandler = require('./middleware/errorHandler');
const healthAndErrors = require('./middleware/health_and_errors');
const tenancy = require('./lib/tenancy');

let kv = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const kvModule = require('@vercel/kv');
    kv = kvModule.kv;
    setKV(kv);
    console.log('Vercel KV initialized successfully');
  } else {
    console.warn('Vercel KV: Missing KV_REST_API_URL or KV_REST_API_TOKEN - using fallback storage');
  }
} catch (err) {
  console.warn('Vercel KV import failed:', err.message);
}

// Session store for Vercel KV with fallback
const { EventEmitter } = require('events');

class VercelKVStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.prefix = options.prefix || 'session:';
    this.kvAvailable = false;

    // Test KV availability
    try {
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN && kv && typeof kv.get === 'function') {
        this.kvAvailable = true;
      }
    } catch (e) {
      console.warn('Vercel KV not available:', e.message);
    }
  }

  async get(sid, callback) {
    if (!this.kvAvailable) {
      return callback(null, null);
    }

    try {
      const data = await kv.get(this.prefix + sid);
      if (data) {
        callback(null, JSON.parse(data));
      } else {
        callback(null, null);
      }
    } catch (err) {
      console.error('VercelKVStore get error:', err.message);
      // Fallback to null on error
      callback(null, null);
    }
  }

  async set(sid, session, callback) {
    if (!this.kvAvailable) {
      return callback(null);
    }

    try {
      await kv.set(this.prefix + sid, JSON.stringify(session), { ex: 86400 }); // 24 hours
      callback(null);
    } catch (err) {
      console.error('VercelKVStore set error:', err.message);
      // Don't fail the session save
      callback(null);
    }
  }

  async destroy(sid, callback) {
    if (!this.kvAvailable) {
      return callback(null);
    }

    try {
      await kv.del(this.prefix + sid);
      callback(null);
    } catch (err) {
      console.error('VercelKVStore destroy error:', err.message);
      callback(null);
    }
  }

  // Required methods for express-session compatibility
  touch(sid, session, callback) {
    this.set(sid, session, callback);
  }

  // Accepted no-ops: Vercel KV store doesn't enumerate all sessions. These are
  // only used by express-session for optional housekeeping and are safe to omit
  // enumeration semantics for (express-session handles this gracefully).
  all(callback) {
    callback(null, []);
  }

  length(callback) {
    callback(null, 0);
  }

  clear(callback) {
    callback(null);
  }
}

// Create session store with fallback
function createSessionStore() {
  if (process.env.VERCEL) {
    try {
      return new VercelKVStore();
    } catch (e) {
      console.warn('Failed to create VercelKVStore, falling back to memory store:', e.message);
    }
  }
  // Default to memory store for development
  return new session.MemoryStore();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Register health endpoint and global error handlers
healthAndErrors(app);

// MongoDB connection state — set by getMongoDB from utils/storage
// Route handlers use `if (db)` to check MongoDB availability
let db = null;
(async () => {
  try {
    db = await getMongoDB();
    if (db) console.log('MongoDB connected at startup');
  } catch (e) {
    console.warn('MongoDB startup connection failed:', e.message);
  }
})();

// Cloudinary configuration
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'cloudinary') {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Security and optimization middlewares
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://apis.google.com",
        "https://accounts.google.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://accounts.google.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "https://*.cloudinary.com"],
      mediaSrc: ["'self'", "https:"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["'self'", "https://accounts.google.com"],
    },
  },
  // 2026: additional hardening headers
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));

// 2026: Permissions-Policy – disable sensors/camera/mic
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=(), usb=()'
  );
  next();
});

// 2026: Tiered rate limiting
// Strict limiter for auth + subscriber key endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', retryAfter: '15 minutes' },
  keyGenerator: (req) => req.ip,
  store: createRateLimitStore('auth')
});
// Moderate limiter for all API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', retryAfter: '15 minutes' },
  store: createRateLimitStore('api')
});
app.use('/api', apiLimiter);
// Apply strict limiter to all auth and key-gate endpoints
app.use(['/auth/login', '/auth/google', '/api/settings/verify-entry-key'], authLimiter);

// Tenancy endpoints: cheap lookups are rate-limited to stop slug enumeration,
// domain verification is limited because it triggers DNS lookups.
const subdomainLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'too_many_requests', retryAfter: '1 minute' },
  keyGenerator: (req) => req.ip,
  store: createRateLimitStore('subdomain')
});
const domainVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'too_many_requests', retryAfter: '15 minutes' },
  keyGenerator: (req) => req.ip,
  store: createRateLimitStore('verify')
});
// Dev seed bootstrap: create a default admin in non-prod when requested
async function seedAdminIfNeeded() {
  try {
    if (process.env.NODE_ENV === 'production') return;
    if (process.env.DEV_ADMIN_SEED !== 'true') return;
    const users = await loadUsers();
    const exists = users && (Object.prototype.hasOwnProperty.call(users, 'admin') || Object.prototype.hasOwnProperty.call(users, 'Admin'));
    if (exists) {
      console.log('Dev seed: admin user already exists');
      return;
    }
    const seedPwd = process.env.DEV_ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(seedPwd, BCRYPT_ROUNDS);
    const updated = Object.assign({}, users || {}, { admin: { name: 'Admin', email: 'admin@example.com', passwordHash: hash, active: true, role: 'ADMIN' } });
    await saveUsers(updated);
    console.log('Dev seed: admin user created (admin/admin)');
  } catch (err) {
    console.error('Dev seed admin error:', err);
  }
}
seedAdminIfNeeded();

// Vercel serverless function export
module.exports = app;

const UPLOADS_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
// Where the JSON fallback data lives. Tests point this at a temp directory so
// they never mutate the tracked data files in the repo root.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const SECURITY_LOGS_FILE = path.join(DATA_DIR, 'security_logs.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const THEMES_FILE = path.join(DATA_DIR, 'themes.json');
const TEMPLATE_BUYERS_FILE = path.join(DATA_DIR, 'template_buyers.json');
const TEMPLATE_APPLICATIONS_FILE = path.join(DATA_DIR, 'template_applications.json');
const MPESA_TRANSACTIONS_FILE = path.join(DATA_DIR, 'mpesa_transactions.json');

// Google client ID (used to validate id_token audience in /auth/google)
// For local dev, we fall back to the same client_id used in login.html so Google Sign-In works
// even if .env is missing.
const DEFAULT_DEV_GOOGLE_CLIENT_ID = '338774598801-rmbjl0aprte0l23ja5u3t3fm222jkbq1.apps.googleusercontent.com';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ((process.env.NODE_ENV !== 'production') ? DEFAULT_DEV_GOOGLE_CLIENT_ID : '');
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || '';
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
// bcrypt cost factor (used consistently across all password hashing)
const BCRYPT_ROUNDS = 12;
// Shared dev-mode flag — verbose auth/session logs are only emitted in dev
const IS_DEV = !process.env.NODE_ENV || process.env.NODE_ENV !== 'production';

// Idle timeout configuration (in minutes)
const ADMIN_IDLE_TIMEOUT_MINUTES = parseInt(process.env.ADMIN_IDLE_TIMEOUT_MINUTES) || 10;
const ADMIN_IDLE_TIMEOUT_MS = ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000;

// Public (non-admin) config endpoint used by the frontend to align timers with the backend.
// NOTE: does not reveal any secrets.
app.get('/api/security/config', (req, res) => {
  return res.json({
    adminIdleTimeoutMs: ADMIN_IDLE_TIMEOUT_MS,
    adminIdleTimeoutMinutes: ADMIN_IDLE_TIMEOUT_MINUTES
  });
});

// Public: the Google OAuth client id the browser must use for Google Sign-In.
// Client ids are not secrets (they are visible in every GSI page load); serving
// it here means rotating the id only requires updating GOOGLE_CLIENT_ID.
app.get('/api/auth/google-client', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  return res.json({ clientId: CLIENT_ID || '' });
});

if (!process.env.GOOGLE_CLIENT_ID) {
  if (IS_DEV) {
    console.warn('WARNING: GOOGLE_CLIENT_ID is not set in .env - using dev fallback client id for local verification');
  } else {
    console.warn('[SECURITY] GOOGLE_CLIENT_ID is not set - Google Sign-In will be rejected in production');
  }
}

// Ensure uploads directory exists (catch EROFS on Vercel read-only fs)
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create uploads directory (read-only filesystem?):', e.message);
}

// CORS configuration (origins allowed via ALLOWED_ORIGINS env var, comma-separated)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .concat([
    'http://localhost:3000',
    'https://zedong254personal-blog-aq9djywsi.vercel.app',
    'https://peronal-blog-hh0dt912e-juliusmwiti-solutechcos-projects.vercel.app'
  ]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 2026: cap raw body size to prevent DoS via oversized payloads
app.use(express.json({ limit: '50kb' }));
// Resolve every request to a tenant before static files are served, so an
// unconfigured hostname gets a clean 404 instead of another tenant's page.
app.use(tenancy.hostGate);
// Cache public static assets aggressively.
// NOTE: '/' and '/post.html' are rendered dynamically (SSR'd list + OG/JSON-LD
// meta tags), so they must fall through to their dedicated routes below.
const rootStatic = express.static(__dirname, { maxAge: '1h', etag: true, lastModified: true });
// Login pages are session-sensitive AND change with design iterations.
// Aggressive static caching pinned a stale login.html for up to an hour
// after each deploy (browser + Vercel CDN). Serve those two pages with
// no-store so every load is fresh.
const loginNoCache = (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, req.path.endsWith('/admin.html') ? 'admin.html' : 'login.html'));
};
app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && (req.path === '/' || req.path === '/post.html')) return next();
  if ((req.method === 'GET' || req.method === 'HEAD') && (req.path === '/login.html' || req.path === '/admin.html')) return loginNoCache(req, res);
  return rootStatic(req, res, next);
});
app.use('/public/js', express.static(path.join(__dirname, 'public', 'js'), {
  // App scripts (home-app.js, admin-app-*.js) ship from the HTML that
  // references them; a 1y cache would pin returning visitors to stale JS for
  // up to a year after a deploy. Revalidate hourly like the root static.
  maxAge: '1h',
  etag: true,
  lastModified: true
}));
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));
// 2026: Trust proxy is required for 'secure: true' cookies to work behind Vercel edge
app.set('trust proxy', 1);

// ── ETag / conditional-request helper for JSON API GET endpoints ─────────
// Generates a weak ETag from the response body, honors If-None-Match with 304,
// and sets Cache-Control so browsers/CDNs can revalidate instead of re-fetching.
function sendJsonWithEtag(req, res, data, cacheControl = 'private, max-age=0, must-revalidate') {
  const body = JSON.stringify(data);
  const etag = `W/${crypto.createHash('md5').update(body).digest('hex')}`;
  const inm = req.headers['if-none-match'];
  if (inm && inm === etag) {
    res.status(304).set('Cache-Control', cacheControl).set('ETag', etag).end();
    return true;
  }
  res.set('ETag', etag);
  res.set('Cache-Control', cacheControl);
  res.json(data);
  return false;
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // 2026: HTTPS-only in production; HTTP allowed for local dev
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    // 2026: Strict prevents CSRF via cross-site requests entirely
    sameSite: 'lax', // keep 'lax' so Google OAuth redirect works
    // 2026: Browser-session cookie (no maxAge/expires). The admin session must
    // not survive closing the browser — login must never be cached across
    // sessions for security. Tab-close logout is enforced client-side via a
    // logout beacon + tab-scoped sessionStorage token.
  },
  // 2026: Obfuscate cookie name (don't reveal 'sessionId')
  name: '__s',
  store: createSessionStore()
}));

// Attach the effective tenant (hostname tenant, or the logged-in buyer's
// tenant when using the customer dashboard on the platform domain).
app.use(tenancy.createContextMiddleware({ jwtSecret: JWT_SECRET }));

app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for videos
  useTempFiles: false,
  createParentPath: true
}));

async function loadUsers() {
  if (isSupabaseEnabled()) {
    const users = await supabaseStore.loadUsers();
    if (Object.keys(users).length > 0) return users;

    // Bootstrap an empty users table from the repo snapshot so a deploy made
    // before the migration script runs cannot lock everyone out.
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const data = Array.isArray(raw) ? Object.fromEntries(raw.map(u => [u.username, u])) : raw;
        Object.values(data).forEach(u => { if (!u.role) u.role = 'ADMIN'; });
        if (Object.keys(data).length > 0) {
          console.log('Seeding Supabase users from local snapshot to prevent lockout...');
          await supabaseStore.saveUsers(data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Could not seed Supabase users from local snapshot:', e.message);
    }
    return users;
  }
  try {
    // Try MongoDB first if available
    const db = await getMongoDB();
    if (db) {
      try {
        const users = await db.collection('users').find({}).toArray();
        if (users && Array.isArray(users) && users.length > 0) {
          const result = {};
          users.forEach(u => {
            if (!u.role) u.role = 'ADMIN'; // 2026: backward compatibility for legacy owner
            result[u.username] = u;
          });
          console.log('Loaded users from MongoDB:', Object.keys(result).length, 'users');
          return result;
        }
        // If connected but empty, we MUST fallback for users to prevent initial lockout
        if (users && users.length === 0) {
          console.log('MongoDB users collection is empty, falling back to other sources to prevent lockout...');
        }
      } catch (mongoErr) {
        console.warn('MongoDB query error:', mongoErr.message);
      }
    }

    // Vercel KV loader
    if (process.env.VERCEL && kv) {
      try {
        const data = await kv.get('users');
        if (data) {
          const parsed = JSON.parse(data);
          Object.values(parsed).forEach(u => { if (!u.role) u.role = 'ADMIN'; });
          console.log('Loaded users from Vercel KV:', Object.keys(parsed).length, 'users');
          return parsed;
        }
      } catch (kvErr) {
        console.warn('Vercel KV error:', kvErr.message);
      }
    }

    // Local file loader
    try {
      const dataStr = fs.readFileSync(USERS_FILE, 'utf8');
      const raw = JSON.parse(dataStr);
      // Normalize array format (from MongoDB sync) to object format keyed by username
      const data = Array.isArray(raw)
        ? Object.fromEntries(raw.map(u => [u.username, u]))
        : raw;
      Object.values(data).forEach(u => { if (!u.role) u.role = 'ADMIN'; });
      console.log('Loaded users from local file:', Object.keys(data).length, 'users');
      return data;
    } catch (fileErr) {
      console.warn('Local users file error:', fileErr.message);
      return {};
    }
  } catch (e) {
    console.error('Fatal error in loadUsers:', e);
    return {};
  }
}

async function saveUsers(users) {
  if (isSupabaseEnabled()) return supabaseStore.saveUsers(users);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      console.log('Syncing users to MongoDB:', Object.keys(users).length);
      const col = mongoDb.collection('users');
      const userArray = Object.entries(users).map(([username, data]) => ({ username, ...data }));

      if (userArray.length === 0) {
        await col.deleteMany({});
      } else {
        const usernames = userArray.map(u => u.username);
        const ops = userArray.map(u => ({
          replaceOne: {
            filter: { username: u.username },
            replacement: u,
            upsert: true
          }
        }));
        await col.bulkWrite(ops, { ordered: false });
        // Clean up any users that were removed
        await col.deleteMany({ username: { $nin: usernames } });
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('users', JSON.stringify(users));
      return;
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Save users error:', e);
    throw e;
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

// Rewrite absolute URLs that point at the machine the content was authored on
// (e.g. http://localhost:3000/uploads/x.jpg) into host-relative paths so the
// image resolves against whatever domain the site is actually served from.
function normalizeAssetUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (LOOPBACK_HOSTS.has(parsed.hostname)) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (e) { /* leave malformed URLs untouched */ }
  }
  return url;
}

// In-place normalization of the image-bearing fields on a content object.
function normalizeImageFields(obj) {
  if (!obj) return obj;
  if (typeof obj.image === 'string') obj.image = normalizeAssetUrl(obj.image);
  if (Array.isArray(obj.images)) obj.images = obj.images.map(normalizeAssetUrl);
  if (typeof obj.content === 'string') {
    obj.content = obj.content
      .replace(/https?:\/\/localhost(?::\d+)?/gi, '')
      .replace(/https?:\/\/127\.0\.0\.1(?::\d+)?/gi, '')
      .replace(/https?:\/\/0\.0\.0\.0(?::\d+)?/gi, '')
      .replace(/https?:\/\/\[::1\](?::\d+)?/gi, '');
  }
  return obj;
}

function normalizePost(p) {
  const post = { ...p };
  normalizeImageFields(post);
  return {
    ...post,
    id: (post._id || post.id).toString(),
    tags: Array.isArray(post.tags) ? post.tags : []
  };
}

function normalizeComment(c) {
  const comment = { ...c };
  if (typeof comment.image === 'string') comment.image = normalizeAssetUrl(comment.image);
  return {
    ...comment,
    id: (comment._id || comment.id).toString()
  };
}

// ── Hot-path caches ─────────────────────────────────────────────────
// A single page visit reads the same tenant data several times (SSR homepage
// then /api/posts, post page then /api/posts/:id). A short TTL cache turns
// those into one backend round trip. Writes clear the current tenant's entry
// immediately; other instances converge within the TTL.
function createScopedCache(ttlMs, maxEntries = 100) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() - hit.at > ttlMs) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value) {
      store.set(key, { at: Date.now(), value });
      if (store.size > maxEntries) store.delete(store.keys().next().value);
    },
    clear(key) {
      if (key === undefined) store.clear();
      else store.delete(key);
    }
  };
}

// Serializes read-modify-write cycles for the JSON-file fallback so concurrent
// requests cannot overwrite each other's analytics or post counters.
function createSerialQueue() {
  let tail = Promise.resolve();
  return task => {
    const run = tail.then(task, task);
    tail = run.then(() => {}, () => {});
    return run;
  };
}

const postsScopeCache = createScopedCache(5000);
const categoriesScopeCache = createScopedCache(10000);
const postCommentsScopeCache = createScopedCache(5000);
const analyticsWriteQueue = createSerialQueue();
const postWriteQueue = createSerialQueue();

function indexPostsById(posts) {
  const byId = new Map();
  for (const post of posts) byId.set(String(post.id), post);
  return byId;
}

async function loadAllPosts() {
  if (isSupabaseEnabled()) return (await supabaseStore.loadPosts()).map(normalizePost);
  const now = Date.now();
  if (postsCache && now - postsCacheTime < CACHE_TTL) {
    return postsCache;
  }

  let result = [];
  try {
    // Try MongoDB first if available
    const db = await getMongoDB();
    if (db) {
      try {
        const posts = await db.collection('posts').find({}).sort({ date: -1 }).toArray();
        if (posts && Array.isArray(posts) && posts.length > 0) {
          result = posts.map(normalizePost);
          postsCache = result;
          postsCacheTime = now;
          postsByIdCache = indexPostsById(result);
          return result;
        }
        if (posts && posts.length === 0) {
          console.log('MongoDB posts collection is empty, falling back to other sources to prevent data loss...');
        }
      } catch (mongoErr) {
        console.warn('MongoDB posts query error:', mongoErr.message);
      }
    }

    // Try Vercel KV if available
    if (process.env.VERCEL && kv) {
      try {
        const data = await kv.get('posts');
        if (data) {
          const parsed = JSON.parse(data);
          console.log('Loaded posts from Vercel KV:', parsed.length, 'posts');
          result = parsed.map(normalizePost);
          if (db && result.length > 0) {
            try {
              console.log('Seeding MongoDB with posts from Vercel KV...');
              await saveAllPosts(result);
            } catch (seedErr) {
              console.warn('Failed to seed MongoDB from Vercel KV:', seedErr.message);
            }
          }
          postsCache = result;
          postsCacheTime = now;
          postsByIdCache = indexPostsById(result);
          return result;
        }
      } catch (kvErr) {
        console.warn('Vercel KV posts error:', kvErr.message);
      }
    }

    // Fall back to local file
    try {
      const data = JSON.parse(await fs.promises.readFile(POSTS_FILE, 'utf8')) || [];
      console.log('Loaded posts from local file:', data.length, 'posts');
      result = data.map(normalizePost);
      if (db && result.length > 0) {
        try {
          console.log('Seeding MongoDB with posts from local file...');
          await saveAllPosts(result);
        } catch (seedErr) {
          console.warn('Failed to seed MongoDB from local file:', seedErr.message);
        }
      }
      postsCache = result;
      postsCacheTime = now;
      postsByIdCache = indexPostsById(result);
      return result;
    } catch (fileErr) {
      console.warn('Local posts file error:', fileErr.message);
    }
  } catch (e) {
    console.error('Fatal error in loadPosts:', e);
  }
  return [];
}

async function saveAllPosts(posts) {
  if (isSupabaseEnabled()) {
    postsCache = null;
    postsCacheTime = 0;
    postsByIdCache = null;
    return supabaseStore.savePosts(posts);
  }
  postsCache = null;
  postsCacheTime = 0;
  postsByIdCache = null;
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      const col = mongoDb.collection('posts');
      if (posts.length === 0) {
        // Nothing left — clear the collection
        await col.deleteMany({});
      } else {
        // Prepare IDs and operations
        const ids = [];
        const ops = posts.map(p => {
          const { id, ...doc } = p;

          // Try to handle both string and ObjectId IDs for compatibility
          let filterSelector;
          if (typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
            const oid = new ObjectId(id);
            ids.push(oid, id); // Add both to the keep-list
            filterSelector = { _id: { $in: [oid, id] } };
          } else {
            ids.push(id);
            filterSelector = { _id: id };
          }

          return {
            updateOne: {
              filter: filterSelector,
              update: { $set: { ...doc, id } },
              upsert: true
            }
          };
        });

        await col.bulkWrite(ops, { ordered: false });
        // Remove stale documents using the collected list of (ObjectId | string) IDs
        await col.deleteMany({ _id: { $nin: ids } });
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('posts', JSON.stringify(posts));
      return;
    }
    // Guard: on Vercel the filesystem is read-only — never attempt fs.writeFileSync
    if (process.env.VERCEL) {
      const hasMongoUri = !!(process.env.MONGODB_URI || process.env.PERSONALBLOG_MONGODB_URI);
      const reason = hasMongoUri ? 'MongoDB connection failed' : 'MONGODB_URI / PERSONALBLOG_MONGODB_URI env var not set';
      console.error(`savePosts: cannot write on Vercel without storage. Reason: ${reason}`);
      throw new Error(`No writable storage available on Vercel (${reason}). Configure MONGODB_URI.`);
    }
    await fs.promises.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
  } catch (e) {
    console.error('Save posts error:', e);
    throw e; // propagate so callers know it failed
  }
}

// Tenant-scoped wrappers: the storage layer stays global, while every read and
// write is filtered/tagged for the tenant attached to the current request.
// Platform-owned content is the `platform` tenant.
// Returns the tenant's posts plus an id index. The index is only cached for
// Supabase; the file/Mongo path already caches the raw list in loadAllPosts.
async function loadPostsEntry() {
  if (isSupabaseEnabled()) {
    const tenantId = tenancy.scope.currentTenantId();
    let entry = postsScopeCache.get(tenantId);
    if (!entry) {
      const posts = (await supabaseStore.loadPostsForTenant(tenantId)).map(normalizePost);
      entry = { posts, byId: indexPostsById(posts) };
      postsScopeCache.set(tenantId, entry);
    }
    return { posts: entry.posts.slice(), byId: entry.byId };
  }
  const tenantId = tenancy.scope.currentTenantId();
  const key = `posts-byid:${tenantId}`;
  let entry = postsScopeCache.get(key);
  if (!entry) {
    const posts = tenancy.scope.filterForTenant(await loadAllPosts());
    entry = { posts, byId: indexPostsById(posts) };
    postsScopeCache.set(key, entry);
  }
  return { posts: entry.posts.slice(), byId: entry.byId };
}

async function loadPosts() {
  return (await loadPostsEntry()).posts;
}

async function savePosts(posts) {
  const tenantId = tenancy.scope.currentTenantId();
  if (isSupabaseEnabled()) {
    postsCache = null;
    postsCacheTime = 0;
    postsByIdCache = null;
    postsScopeCache.clear(tenantId);
    postsScopeCache.clear(`posts-byid:${tenantId}`);
    return supabaseStore.savePostsForTenant(tenantId, posts);
  }
  const all = await loadAllPosts();
  return saveAllPosts(tenancy.scope.mergeForTenant(all, posts, tenantId));
}

async function loadAllCategories() {
  if (isSupabaseEnabled()) return supabaseStore.loadCategories();
  try {
    return await loadWithFallback({
      collectionName: 'categories',
      kvKey: 'categories',
      filePath: CATEGORIES_FILE,
      transform: c => ({ ...c, id: String(c.id) }),
      defaultData: []
    });
  } catch (e) {
    console.error('Fatal error in loadCategories:', e);
    return [];
  }
}

async function saveAllCategories(categories) {
  if (isSupabaseEnabled()) {
    if (!Array.isArray(categories)) throw new Error('categories must be an array');
    return supabaseStore.saveCategories(categories);
  }
  try {
    if (!Array.isArray(categories)) {
      console.error('saveCategories: categories is not an array', typeof categories);
      throw new Error('categories must be an array');
    }
    await saveWithFallback('categories', 'categories', CATEGORIES_FILE, categories);
  } catch (e) {
    console.error('Save categories error:', e);
    throw e;
  }
}

async function loadCategories() {
  if (isSupabaseEnabled()) {
    const tenantId = tenancy.scope.currentTenantId();
    const cached = categoriesScopeCache.get(tenantId);
    if (cached) return cached.slice();
    try {
      const categories = await supabaseStore.loadCategoriesForTenant(tenantId);
      categoriesScopeCache.set(tenantId, categories);
      return categories.slice();
    } catch (e) {
      console.error('Supabase categories load failed:', e.message);
      return [];
    }
  }
  return tenancy.scope.filterForTenant(await loadAllCategories());
}

async function saveCategories(categories) {
  const tenantId = tenancy.scope.currentTenantId();
  if (isSupabaseEnabled()) {
    categoriesScopeCache.clear(tenantId);
    return supabaseStore.saveCategoriesForTenant(tenantId, categories);
  }
  const all = await loadAllCategories();
  return saveAllCategories(tenancy.scope.mergeForTenant(all, categories, tenantId));
}

async function loadAnalytics() {
  if (isSupabaseEnabled()) {
    try {
      return await supabaseStore.loadAnalytics();
    } catch (e) {
      console.error('Supabase analytics load failed:', e.message);
      return { pageViews: [], postViews: [], interactions: [] };
    }
  }
  try {
    const result = await loadWithFallbackSingle({
      collectionName: 'analytics',
      mongoFilter: { type: 'data' },
      kvKey: 'analytics',
      filePath: ANALYTICS_FILE,
      defaultData: { pageViews: [], postViews: [], interactions: [] }
    });
    return result?.data || result || { pageViews: [], postViews: [], interactions: [] };
  } catch (e) {
    return { pageViews: [], postViews: [], interactions: [] };
  }
}

async function saveAnalytics(analytics) {
  if (isSupabaseEnabled()) return supabaseStore.saveAnalytics(analytics);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      await mongoDb.collection('analytics').updateOne(
        { type: 'data' },
        { $set: { data: analytics, updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    }
    await fs.promises.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
  } catch (e) {
    console.error('Save analytics error:', e);
  }
}

/**
 * Filters analytics arrays down to the tenant of the current request.
 * Records created before tenancy are treated as platform data.
 */
function scopeAnalytics(analytics) {
  const tenantId = tenancy.scope.currentTenantId();
  const match = item => String(item.tenantId || tenancy.PLATFORM_TENANT_ID) === tenantId;
  return {
    pageViews: (analytics.pageViews || []).filter(match),
    postViews: (analytics.postViews || []).filter(match),
    interactions: (analytics.interactions || []).filter(match)
  };
}

/**
 * Centrally records a user interaction for the analytics dashboard
 */
async function recordInteraction(type, target, value = '', req = null) {
  if (isSupabaseEnabled()) {
    try {
      return await supabaseStore.recordInteraction(type, target, value, req);
    } catch (e) {
      console.error('Supabase interaction record failed:', e.message);
      return;
    }
  }
  try {
    const interaction = {
      id: Date.now(),
      type: type,
      target: String(target || ''),
      value: String(value || ''),
      tenantId: tenancy.scope.currentTenantId(),
      ip: req ? (req.ip || req.socket?.remoteAddress) : 'system',
      userAgent: req ? (req.get('User-Agent') || '') : 'system',
      timestamp: new Date().toISOString()
    };

    const mongoDb = await getMongoDB();
    if (mongoDb) {
      // Atomic append — avoids racing read-modify-write on the whole doc
      await mongoDb.collection('analytics').updateOne(
        { type: 'data' },
        { $push: { 'data.interactions': interaction }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    }

    await analyticsWriteQueue(async () => {
      const analytics = await loadAnalytics();
      if (!analytics.interactions) analytics.interactions = [];
      analytics.interactions.push(interaction);
      await saveAnalytics(analytics);
      console.log(`[Analytics] Recorded interaction: ${type} on ${target}`);
    });
  } catch (e) {
    console.error('Failed to record interaction:', e);
  }
}

/**
 * Records a page view for analytics
 */
async function recordPageView(page, req) {
  if (isSupabaseEnabled()) {
    try {
      return await supabaseStore.recordPageView(page, req);
    } catch (e) {
      console.error('Supabase page view record failed:', e.message);
      return;
    }
  }
  try {
    const view = {
      page: String(page || '/'),
      tenantId: tenancy.scope.currentTenantId(),
      ip: req ? (req.ip || req.socket?.remoteAddress) : 'unknown',
      userAgent: req ? (req.get('User-Agent') || '') : 'unknown',
      timestamp: new Date().toISOString()
    };

    const mongoDb = await getMongoDB();
    if (mongoDb) {
      // Atomic append — avoids racing read-modify-write on the whole doc
      await mongoDb.collection('analytics').updateOne(
        { type: 'data' },
        { $push: { 'data.pageViews': view }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    }

    await analyticsWriteQueue(async () => {
      const analytics = await loadAnalytics();
      if (!analytics.pageViews) analytics.pageViews = [];
      analytics.pageViews.push(view);
      await saveAnalytics(analytics);
    });
  } catch (e) {
    console.error('Failed to record page view:', e);
  }
}

/**
 * Helper to upload a file to the configured storage (Cloudinary, Vercel Blob, or Local)
 */
async function uploadFileToStorage(file, folder = 'blog', scopeId = 'platform') {
  const safeScope = String(scopeId || 'platform').replace(/[^a-z0-9-]/gi, '');
  const tenantPrefix = safeScope && safeScope !== 'platform' ? `tenant-${safeScope}__` : '';
  if (isSupabaseEnabled()) {
    const safe = path.basename(file.name).replace(/[^a-z0-9.\-\_]/gi, '_');
    const filename = Date.now() + '_' + safe;
    return uploadToSupabaseStorage(file.data, filename, file.mimetype, folder);
  }

  const isVideo = file.mimetype.startsWith('video/');
  
  // Use Cloudinary if configured
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'cloudinary') {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: folder,
          public_id: `${Date.now()}_${path.parse(file.name).name}`,
          transformation: isVideo ? [] : [{ quality: 'auto', fetch_format: 'auto' }]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(file.data);
    });
    return { url: result.secure_url, filename: result.public_id };
  }

  // Fallback to Vercel Blob
  if (process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN) {
    const safe = path.basename(file.name).replace(/[^a-z0-9.\-\_]/gi, '_');
    const filename = tenantPrefix + Date.now() + '_' + safe;
    const blob = await put(filename, file.data, {
      access: 'public',
      contentType: file.mimetype
    });
    return { url: blob.url, filename };
  }

  // Local development fallback
  const safe = path.basename(file.name).replace(/[^a-z0-9.\-\_]/gi, '_');
  const filename = tenantPrefix + Date.now() + '_' + safe;
  const dest = path.join(UPLOADS_DIR, filename);
  
  if (file.data && Buffer.isBuffer(file.data)) {
    fs.writeFileSync(dest, file.data);
  } else if (typeof file.mv === 'function') {
    await new Promise((resolve, reject) => file.mv(dest, err => err ? reject(err) : resolve()));
  }
  
  return { url: `/uploads/${filename}`, filename };
}

async function loadSecurityLogs() {
  if (isSupabaseEnabled()) {
    try {
      return await supabaseStore.loadSecurityLogs();
    } catch (e) {
      console.error('Supabase security logs load failed:', e.message);
      return [];
    }
  }
  try {
    const result = await loadWithFallbackSingle({
      collectionName: 'security',
      mongoFilter: { type: 'logs' },
      kvKey: 'security_logs',
      filePath: SECURITY_LOGS_FILE,
      defaultData: []
    });
    return result?.logs || [];
  } catch (e) {
    return [];
  }
}

let commentsCache = null;
let commentsCacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

// Short-lived in-process posts cache to avoid a MongoDB round-trip on
// every read-heavy request (mirrors commentsCache). Invalidated on save.
let postsCache = null;
let postsCacheTime = 0;

// In-memory index for O(1) single-post lookups. Populated from postsCache;
// keyed by post id string. Invalidated alongside postsCache on save.
let postsByIdCache = null;

// post.html template cached in memory so OG-meta generation doesn't
// re-read the file synchronously on every page load (mtime-checked so
// edits during development are picked up without a restart).
let postHtmlTemplate = null;
let postHtmlTemplateMtimeMs = 0;

// index.html template cached in memory for the SSR'd homepage inject.
let indexHtmlTemplate = null;
let indexHtmlTemplateMtimeMs = 0;

async function loadAllComments() {
  if (isSupabaseEnabled()) {
    try {
      const comments = await supabaseStore.loadComments();
      commentsCache = comments.map(normalizeComment);
      commentsCacheTime = Date.now();
      return commentsCache;
    } catch (e) {
      console.error('Supabase comments load failed:', e.message);
      return [];
    }
  }
  const now = Date.now();
  if (commentsCache && now - commentsCacheTime < CACHE_TTL) {
    return commentsCache;
  }
  try {
    const db = await getMongoDB();
    if (db) {
      const comments = await db.collection('comments').find({}).toArray();
      commentsCache = comments.map(normalizeComment);
      commentsCacheTime = now;
      return commentsCache;
    }
    commentsCache = (JSON.parse(await fs.promises.readFile(COMMENTS_FILE, 'utf8')) || []).map(normalizeComment);
    commentsCacheTime = now;
    return commentsCache || [];
  } catch (e) {
    return [];
  }
}

function invalidateCommentsCache() {
  commentsCache = null;
  commentsCacheTime = 0;
}

// Short-lived in-process subscriptions cache. Invalidated on save.
let subscriptionsCache = null;
let subscriptionsCacheTime = 0;

async function saveAllComments(comments) {
  invalidateCommentsCache();
  if (isSupabaseEnabled()) return supabaseStore.saveComments(comments);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      const col = mongoDb.collection('comments');
      if (comments.length === 0) {
        await col.deleteMany({});
      } else {
        // Upsert per document (atomic, never leaves the collection half-written)
        const ids = [];
        const ops = comments.map(c => {
          const id = c.id;
          ids.push(String(id));
          const doc = { ...c };
          delete doc.id;
          delete doc._id;
          return {
            updateOne: {
              filter: { _id: id },
              update: { $set: { ...doc, id } },
              upsert: true
            }
          };
        });
        await col.bulkWrite(ops, { ordered: false });
        await col.deleteMany({ _id: { $nin: ids } });
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('comments', JSON.stringify(comments));
      return;
    }
    await fs.promises.writeFile(COMMENTS_FILE, JSON.stringify(comments, null, 2));
  } catch (e) {
    console.error('Save comments error:', e);
  }
}

async function loadComments() {
  if (isSupabaseEnabled()) {
    try {
      return (await supabaseStore.loadCommentsForTenant(tenancy.scope.currentTenantId())).map(normalizeComment);
    } catch (e) {
      console.error('Supabase comments load failed:', e.message);
      return [];
    }
  }
  return tenancy.scope.filterForTenant(await loadAllComments());
}

async function loadCommentsForPost(postId) {
  if (isSupabaseEnabled()) {
    const tenantId = tenancy.scope.currentTenantId();
    const key = `${tenantId}:${postId}`;
    const cached = postCommentsScopeCache.get(key);
    if (cached) return cached.slice();
    try {
      const comments = (await supabaseStore.loadCommentsForPostForTenant(tenantId, postId)).map(normalizeComment);
      postCommentsScopeCache.set(key, comments);
      return comments.slice();
    } catch (e) {
      console.error('Supabase post comments load failed:', e.message);
      return [];
    }
  }
  return (await loadComments()).filter(c => String(c.postId) === String(postId));
}

function invalidatePostComments() {
  postCommentsScopeCache.clear();
}

async function saveComments(comments) {
  const tenantId = tenancy.scope.currentTenantId();
  invalidatePostComments();
  if (isSupabaseEnabled()) {
    invalidateCommentsCache();
    return supabaseStore.saveCommentsForTenant(tenantId, comments);
  }
  const all = await loadAllComments();
  return saveAllComments(tenancy.scope.mergeForTenant(all, comments, tenantId));
}

async function loadAllSubscriptions() {
  if (isSupabaseEnabled()) return supabaseStore.loadSubscriptions();
  const now = Date.now();
  if (subscriptionsCache && now - subscriptionsCacheTime < CACHE_TTL) {
    return subscriptionsCache;
  }
  try {
    const db = await getMongoDB();
    if (db) {
      const subscriptions = await db.collection('subscriptions').find({}).toArray();
      subscriptionsCache = subscriptions.map(s => ({ ...s, id: s._id || s.id }));
      subscriptionsCacheTime = now;
      return subscriptionsCache;
    }
    subscriptionsCache = JSON.parse(await fs.promises.readFile(SUBSCRIPTIONS_FILE, 'utf8')) || [];
    subscriptionsCacheTime = now;
    return subscriptionsCache;
  } catch (e) {
    return [];
  }
}

async function saveAllSubscriptions(subscriptions) {
  if (isSupabaseEnabled()) return supabaseStore.saveSubscriptions(subscriptions);
  subscriptionsCache = null;
  subscriptionsCacheTime = 0;
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      const col = mongoDb.collection('subscriptions');
      if (subscriptions.length === 0) {
        await col.deleteMany({});
      } else {
        const ids = [];
        const ops = subscriptions.map(s => {
          const id = s.id;
          ids.push(String(id));
          const doc = { ...s };
          delete doc.id;
          delete doc._id;
          return {
            updateOne: {
              filter: { _id: id },
              update: { $set: { ...doc, id } },
              upsert: true
            }
          };
        });
        await col.bulkWrite(ops, { ordered: false });
        await col.deleteMany({ _id: { $nin: ids } });
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('subscriptions', JSON.stringify(subscriptions));
      return;
    }
    await fs.promises.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
  } catch (e) {
    console.error('Save subscriptions error:', e);
  }
}

async function loadSubscriptions() {
  if (isSupabaseEnabled()) {
    return supabaseStore.loadSubscriptionsForTenant(tenancy.scope.currentTenantId());
  }
  return tenancy.scope.filterForTenant(await loadAllSubscriptions());
}

async function saveSubscriptions(subscriptions) {
  const tenantId = tenancy.scope.currentTenantId();
  if (isSupabaseEnabled()) {
    return supabaseStore.saveSubscriptionsForTenant(tenantId, subscriptions);
  }
  const all = await loadAllSubscriptions();
  return saveAllSubscriptions(tenancy.scope.mergeForTenant(all, subscriptions, tenantId));
}

async function loadTemplateBuyers() {
  if (isSupabaseEnabled()) return supabaseStore.loadTemplateBuyers();
  try {
    const db = await getMongoDB();
    if (db) {
      const buyers = await db.collection('template_buyers').find({}).toArray();
      return buyers.map(b => ({ ...b, id: (b._id || b.id).toString() }));
    }
    if (process.env.VERCEL && kv) {
      const data = await kv.get('template_buyers');
      return data ? JSON.parse(data) : [];
    }
    if (!fs.existsSync(TEMPLATE_BUYERS_FILE)) return [];
    return JSON.parse(await fs.promises.readFile(TEMPLATE_BUYERS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

async function saveTemplateBuyers(buyers) {
  if (isSupabaseEnabled()) return supabaseStore.saveTemplateBuyers(buyers);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      await mongoDb.collection('template_buyers').deleteMany({});
      if (buyers.length > 0) {
        const toSave = buyers.map(b => {
          const { id, ...rest } = b;
          return { ...rest, _id: id };
        });
        await mongoDb.collection('template_buyers').insertMany(toSave);
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('template_buyers', JSON.stringify(buyers));
      return;
    }
    fs.writeFileSync(TEMPLATE_BUYERS_FILE, JSON.stringify(buyers, null, 2));
  } catch (e) {
    console.error('Save template buyers error:', e);
  }
}

async function loadTemplateApplications() {
  if (isSupabaseEnabled()) return supabaseStore.loadTemplateApplications();
  try {
    const db = await getMongoDB();
    if (db) {
      const apps = await db.collection('template_applications').find({}).toArray();
      return apps.map(b => ({ ...b, id: (b._id || b.id).toString() }));
    }
    if (process.env.VERCEL && kv) {
      const data = await kv.get('template_applications');
      return data ? JSON.parse(data) : [];
    }
    if (!fs.existsSync(TEMPLATE_APPLICATIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TEMPLATE_APPLICATIONS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

async function saveTemplateApplications(apps) {
  if (isSupabaseEnabled()) return supabaseStore.saveTemplateApplications(apps);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      await mongoDb.collection('template_applications').deleteMany({});
      if (apps.length > 0) {
        const toSave = apps.map(b => {
          const { id, ...rest } = b;
          return { ...rest, _id: id };
        });
        await mongoDb.collection('template_applications').insertMany(toSave);
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('template_applications', JSON.stringify(apps));
      return;
    }
    fs.writeFileSync(TEMPLATE_APPLICATIONS_FILE, JSON.stringify(apps, null, 2));
  } catch (e) {
    console.error('Save template apps error:', e);
  }
}

// ── MPesa Transactions Storage ──
async function loadMpesaTransactions() {
  if (isSupabaseEnabled()) return supabaseStore.loadMpesaTransactions();
  try {
    const db = await getMongoDB();
    if (db) {
      const txns = await db.collection('mpesa_transactions').find({}).toArray();
      return txns.map(t => ({ ...t, id: (t._id || t.id).toString() }));
    }
    if (process.env.VERCEL && kv) {
      const data = await kv.get('mpesa_transactions');
      return data ? JSON.parse(data) : [];
    }
    if (!fs.existsSync(MPESA_TRANSACTIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(MPESA_TRANSACTIONS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

async function saveMpesaTransactions(txns) {
  if (isSupabaseEnabled()) return supabaseStore.saveMpesaTransactions(txns);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      await mongoDb.collection('mpesa_transactions').deleteMany({});
      if (txns.length > 0) {
        const toSave = txns.map(t => {
          const { id, ...rest } = t;
          return { ...rest, _id: id };
        });
        await mongoDb.collection('mpesa_transactions').insertMany(toSave);
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('mpesa_transactions', JSON.stringify(txns));
      return;
    }
    fs.writeFileSync(MPESA_TRANSACTIONS_FILE, JSON.stringify(txns, null, 2));
  } catch (e) {
    console.error('Save MPesa transactions error:', e);
  }
}

// ── MPesa API Helpers ──
const MPESA_BASE_URL = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke'
};

function getMpesaConfig() {
  const env = process.env.MPESA_ENVIRONMENT || 'sandbox';
  return {
    baseUrl: MPESA_BASE_URL[env] || MPESA_BASE_URL.sandbox,
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortcode: process.env.MPESA_SHORTCODE || '',
    passkey: process.env.MPESA_PASSKEY || '',
    callbackUrl: process.env.MPESA_CALLBACK_URL || ''
  };
}

async function getMpesaAccessToken() {
  const config = getMpesaConfig();
  if (!config.consumerKey || !config.consumerSecret) {
    throw new Error('MPesa credentials not configured');
  }
  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const resp = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { 'Authorization': `Basic ${auth}` }
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error('Failed to get MPesa access token');
  }
  return data.access_token;
}

function generateMpesaPassword(shortcode, passkey, timestamp) {
  const dataToEncode = `${shortcode}${passkey}${timestamp}`;
  return Buffer.from(dataToEncode).toString('base64');
}

function getMpesaTimestamp() {
  // YYYYMMDDHHMMSS using the server's local time (behaviour-preserving)
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function initiateMpesaSTKPush(phoneNumber, amount, accountReference) {
  const config = getMpesaConfig();
  const accessToken = await getMpesaAccessToken();
  const timestamp = getMpesaTimestamp();
  const password = generateMpesaPassword(config.shortcode, config.passkey, timestamp);

  // Normalize phone number to 2547XXXXXXXX format
  let normalizedPhone = phoneNumber.replace(/[^0-9]/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '254' + normalizedPhone.substring(1);
  } else if (normalizedPhone.startsWith('+254')) {
    normalizedPhone = normalizedPhone.substring(1);
  } else if (!normalizedPhone.startsWith('254')) {
    normalizedPhone = '254' + normalizedPhone;
  }

  const callbackUrl = config.callbackUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/api/payments/callback`;

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: normalizedPhone,
    PartyB: config.shortcode,
    PhoneNumber: normalizedPhone,
    CallBackURL: callbackUrl,
    AccountReference: accountReference || 'BlogTemplate',
    TransactionDesc: 'Blog Template Purchase'
  };

  const resp = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await resp.json();
  return result;
}

async function checkMpesaTransactionStatus(checkoutRequestId) {
  const config = getMpesaConfig();
  const accessToken = await getMpesaAccessToken();
  const timestamp = getMpesaTimestamp();
  const password = generateMpesaPassword(config.shortcode, config.passkey, timestamp);

  const resp = await fetch(`${config.baseUrl}/mpesa/transactionstatus/v1/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Initiator: config.shortcode,
      SecurityCredential: password,
      CommandID: 'TransactionStatusQuery',
      TransactionID: checkoutRequestId,
      PartyA: config.shortcode,
      IdentifierType: '4',
      ResultURL: `${config.callbackUrl || process.env.BASE_URL || 'http://localhost:3000'}/api/payments/result`,
      QueueTimeOutURL: `${config.callbackUrl || process.env.BASE_URL || 'http://localhost:3000'}/api/payments/timeout`
    })
  });

  return await resp.json();
}

async function loadAllThemes() {
  if (isSupabaseEnabled()) return supabaseStore.loadThemes();
  try {
    const db = await getMongoDB();
    if (db) {
      const themes = await db.collection('themes').find({}).sort({ year: -1, month: -1 }).toArray();
      return themes.map(t => ({ ...t, id: (t._id || t.id).toString() }));
    }
    if (process.env.VERCEL && kv) {
      const data = await kv.get('themes');
      return data ? JSON.parse(data) : [];
    }
    return JSON.parse(await fs.promises.readFile(THEMES_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

async function saveAllThemes(themes) {
  if (isSupabaseEnabled()) return supabaseStore.saveThemes(themes);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      const col = mongoDb.collection('themes');
      if (themes.length === 0) {
        await col.deleteMany({});
      } else {
        const ids = [];
        const ops = themes.map(t => {
          const id = t.id;
          ids.push(String(id));
          const doc = { ...t };
          delete doc.id;
          delete doc._id;
          return {
            updateOne: {
              filter: { _id: id },
              update: { $set: { ...doc, id } },
              upsert: true
            }
          };
        });
        await col.bulkWrite(ops, { ordered: false });
        await col.deleteMany({ _id: { $nin: ids } });
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('themes', JSON.stringify(themes));
      return;
    }
    await fs.promises.writeFile(THEMES_FILE, JSON.stringify(themes, null, 2));
  } catch (e) {
    console.error('Save themes error:', e);
  }
}

async function loadThemes() {
  if (isSupabaseEnabled()) {
    return supabaseStore.loadThemesForTenant(tenancy.scope.currentTenantId());
  }
  return tenancy.scope.filterForTenant(await loadAllThemes());
}

async function saveThemes(themes) {
  const tenantId = tenancy.scope.currentTenantId();
  if (isSupabaseEnabled()) {
    return supabaseStore.saveThemesForTenant(tenantId, themes);
  }
  const all = await loadAllThemes();
  return saveAllThemes(tenancy.scope.mergeForTenant(all, themes, tenantId));
}

async function sendNewPostNotification(post) {
  try {
    const subscriptions = await loadSubscriptions();
    if (subscriptions.length === 0) return;

    const themes = await loadThemes();
    const postDate = new Date(post.date);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = monthNames[postDate.getMonth()];
    const year = postDate.getFullYear();

    const theme = themes.find(t => t.month === month && parseInt(t.year) === year);
    const themeName = theme ? theme.title : "General";

    const mailOptions = {
      from: (process.env.SMTP_FROM && String(process.env.SMTP_FROM).trim()) ? String(process.env.SMTP_FROM).trim() : (process.env.ALLOWED_EMAIL || 'noreply@example.com'),
      bcc: subscriptions.map(s => s.email).join(','),
      subject: `New Blog Published: ${post.title}`,
      html: `
        <div style="font-family: 'Inter', sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333;">New Post Alert!</h2>
          <p>Hi there,</p>
          <p>A new blog post has just been published under this month's theme: <strong>${themeName}</strong>.</p>
          <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #FF5733;">
            <h3 style="margin: 0; color: #FF5733;">${post.title}</h3>
            <p style="margin: 10px 0; color: #666;">Check out the latest insights and updates on our blog.</p>
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/post.html?id=${post.id}" style="display: inline-block; padding: 10px 20px; background: #FF5733; color: white; text-decoration: none; border-radius: 5px;">Read Full Post</a>
          </div>
          <p style="font-size: 12px; color: #999;">You are receiving this because you subscribed to our newsletter. <a href="#">Unsubscribe here</a>.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Notification sent to ${subscriptions.length} subscribers for post: ${post.title}`);
  } catch (err) {
    console.error('Error sending post notification:', err);
  }
}

async function sendSubscriptionConfirmation(email, name) {
  try {
    const fromAddress = (process.env.SMTP_FROM && String(process.env.SMTP_FROM).trim())
      ? String(process.env.SMTP_FROM).trim()
      : (process.env.ALLOWED_EMAIL || 'noreply@example.com');
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const unsubscribeUrl = `${baseUrl}/#unsubscribe-${encodeURIComponent(email)}`;

    const displayName = name && name.trim() ? name.trim() : 'there';

    const mailOptions = {
      from: fromAddress,
      to: email,
      subject: 'Welcome to the zedong254ke newsletter',
      html: `
        <div style="font-family: 'Inter', sans-serif; padding: 24px; border: 1px solid #eee; border-radius: 10px; background: #ffffff;">
          <h2 style="color: #171715; margin: 0 0 16px;">Welcome, ${displayName}!</h2>
          <p style="color: #43423C; margin: 0 0 16px;">You have successfully subscribed to the zedong254ke blog newsletter.</p>
          <p style="color: #43423C; margin: 0 0 20px;">You will receive updates whenever a new post is published, along with occasional notes on technology, delivery, and the human side of work.</p>
          <p style="font-size: 12px; color: #78756B; margin: 0;">
            Not you? You can <a href="${unsubscribeUrl}" style="color: #D0271C;">unsubscribe here</a>.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Subscription confirmation sent to ${email}`);
  } catch (err) {
    console.error('Error sending subscription confirmation email:', err);
  }
}

async function sendLicenseEmail(buyer) {
  try {
    const fromAddress = (process.env.SMTP_FROM && String(process.env.SMTP_FROM).trim())
      ? String(process.env.SMTP_FROM).trim()
      : (process.env.ALLOWED_EMAIL || 'noreply@example.com');
    const mailOptions = {
      from: fromAddress,
      to: buyer.email,
      subject: 'Your Blog Template License Key',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #eee; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #333; margin: 0;">Blog Template License</h2>
          </div>
          <p style="color: #555; font-size: 16px;">Hello ${buyer.name || buyer.email},</p>
          <p style="color: #555; font-size: 16px;">Thank you for your purchase! Your blog template license key is ready.</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
            <p style="color: #888; font-size: 14px; margin: 0 0 8px 0;">Your License Key</p>
            <code style="font-size: 24px; font-weight: bold; color: #D0271C; letter-spacing: 2px; background: #fff; padding: 12px 24px; border-radius: 6px; border: 2px dashed #D0271C;">${buyer.licenseKey}</code>
          </div>
          <p style="color: #555; font-size: 14px;">Use this key to log in to your blog admin panel.</p>
          <p style="color: #888; font-size: 12px; margin-top: 30px;">If you have any questions, please contact support.</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log('License email sent to:', buyer.email);
  } catch (e) {
    console.error('Failed to send license email:', e.message);
  }
}

// ── Tenant provisioning hooks ────────────────────────────────────────────────
// These wrap the existing buyer/license creation. The payment flow itself is
// unchanged; it just calls finalizeTenantPurchase once a payment succeeds.

function sanitizeRichHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(['"]?)\s*javascript:/gi, '$1=$2#');
}

function tenantMongoFilter(tenantId) {
  return tenantId === tenancy.PLATFORM_TENANT_ID
    ? { $or: [{ tenantId: tenancy.PLATFORM_TENANT_ID }, { tenantId: { $exists: false } }] }
    : { tenantId };
}

async function tenantBlogUrl(tenant) {
  if (!tenant) return null;
  const domains = await tenancy.store.listDomainsForTenant(tenant.id);
  const primary = domains.find(d => d.status === 'active' && d.isPrimary)
    || domains.find(d => d.status === 'active' && d.type === 'platform')
    || domains.find(d => d.status === 'active')
    || domains[0];
  return primary ? tenancy.blogUrlFor(primary.hostname) : null;
}

async function linkUserToTenant(tenant, email) {
  if (!tenant || !email) return null;
  try {
    const users = await loadUsers();
    const key = findUserKeyByEmail(users, email);
    if (!key || !users[key]) return null;
    let changed = false;
    if (String(users[key].tenantId || '') !== String(tenant.id)) {
      users[key].tenantId = tenant.id;
      changed = true;
    }
    if (String(users[key].role || 'USER').toUpperCase() !== 'ADMIN') {
      users[key].role = users[key].role || 'TEMPLATE_BUYER';
    }
    if (changed) await saveUsers(users);
    return key;
  } catch (e) {
    console.error('linkUserToTenant failed:', e.message);
    return null;
  }
}

async function createTenantBlog(tenant, buyer) {
  if (!tenant) return;
  await tenancy.runWithTenant({ tenant, domain: null, platform: false }, async () => {
    // Idempotent: recovery runs may call this after the blog was already
    // seeded, and must not overwrite settings the owner has since edited.
    const posts = await loadPosts();
    if (posts.some(post => post.tags && post.tags.includes('welcome'))) return;

    const settings = await readSettings();
    const nextSettings = {
      ...settings,
      blogInfo: {
        ...(settings.blogInfo || {}),
        title: tenant.name,
        description: `Welcome to ${tenant.name}.`
      },
      author: {
        ...(settings.author || {}),
        name: (buyer && buyer.name) || tenant.name
      }
    };
    await writeSettings(nextSettings);

    posts.push({
      id: tenancy.store.newId(),
      title: `Welcome to ${tenant.name}`,
      subtitle: 'Your first post is ready. Edit or delete it from the dashboard.',
      content: sanitizeRichHtml(`<p>This is the first post on your new blog. Head to the <a href="/login.html">login page</a> to start writing, change your theme, and connect your own domain.</p>`),
      author: (buyer && buyer.name) || tenant.name,
      authorUsername: null,
      date: new Date().toISOString(),
      tags: ['welcome'],
      image: '',
      images: [],
      isDraft: false,
      isDeleted: false,
      likes: 0,
      dislikes: 0
    });
    await savePosts(posts);
  });
}

async function sendTenantWelcomeEmail({ tenant, buyer, blogUrl, licenseKey, loginUrl }) {
  if (!buyer || !buyer.email) return false;
  try {
    const fromAddress = (process.env.SMTP_FROM && String(process.env.SMTP_FROM).trim())
      ? String(process.env.SMTP_FROM).trim()
      : (process.env.ALLOWED_EMAIL || 'noreply@example.com');
    const dashboard = loginUrl || (tenancy.PLATFORM_DOMAIN
      ? `https://${tenancy.PLATFORM_DOMAIN}/login.html`
      : `${process.env.BASE_URL || 'http://localhost:3000'}/login.html`);
    await transporter.sendMail({
      from: fromAddress,
      to: buyer.email,
      subject: `Your blog is live: ${blogUrl}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; margin: 0 0 12px;">Your blog is ready</h2>
          <p style="color: #555; font-size: 16px;">Hello ${buyer.name || buyer.email},</p>
          <p style="color: #555; font-size: 16px;">Your payment was received and <strong>${tenant.name}</strong> is now live.</p>
          <p style="font-size: 18px; margin: 24px 0;"><a href="${blogUrl}" style="color: #D0271C; font-weight: 700;">${blogUrl}</a></p>
          ${licenseKey ? `<div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:20px 0;">
            <p style="margin:0 0 6px;color:#888;font-size:13px;">Login email</p>
            <strong>${buyer.email}</strong>
            <p style="margin:12px 0 6px;color:#888;font-size:13px;">License key (first password)</p>
            <code style="font-size:18px;font-weight:700;color:#D0271C;">${licenseKey}</code>
          </div>` : ''}
          <p style="color:#555;font-size:14px;">Sign in at <a href="${dashboard}" style="color:#D0271C;">${dashboard}</a> to write posts, change your theme and connect a custom domain.</p>
          <p style="color:#888;font-size:12px;margin-top:28px;">Keep this email. Your license key is also your initial password.</p>
        </div>
      `
    });
    console.log('Tenant welcome email sent to:', buyer.email);
    return true;
  } catch (e) {
    console.error('Failed to send tenant welcome email:', e.message);
    return false;
  }
}

/**
 * Called from the existing successful-payment paths. Idempotent via the
 * M-Pesa receipt number (or checkout request id) as the payment key.
 */
async function finalizeTenantPurchase(txn, buyerRecord) {
  if (!txn || !txn.subdomain) return null;
  const paymentKey = txn.paymentKey
    || (txn.mpesaReceiptNumber ? `mpesa:${txn.mpesaReceiptNumber}` : `mpesa:${txn.checkoutRequestId || txn.id}`);
  try {
    const buyer = buyerRecord || {
      id: txn.id,
      name: txn.customerName,
      email: txn.customerEmail
    };
    const result = await tenancy.provisionTenantFromPayment({
      paymentKey,
      buyer,
      subdomain: txn.subdomain,
      name: txn.customerName || buyer.name,
      templateRef: txn.templateRef || 'default'
    });
    txn.tenantId = result.tenant.id;
    txn.blogUrl = result.blogUrl;
    txn.provisioned = true;
    txn.provisionedAt = txn.provisionedAt || new Date().toISOString();

    // Both helpers are idempotent so a recovery run can finish a purchase
    // that was interrupted after the tenant/domain rows were created.
    await linkUserToTenant(result.tenant, buyer.email || txn.customerEmail);
    await createTenantBlog(result.tenant, buyer);

    // New transactions start with welcomeEmailSent=false so a failed send is
    // retried; older records leave it undefined and are not re-emailed once
    // their tenant exists.
    const needsWelcomeEmail = txn.welcomeEmailSent === false
      || (result.created && txn.welcomeEmailSent === undefined);
    if (needsWelcomeEmail) {
      const sent = await sendTenantWelcomeEmail({
        tenant: result.tenant,
        buyer,
        blogUrl: result.blogUrl,
        licenseKey: buyer.licenseKey || null
      });
      txn.welcomeEmailSent = sent;
    }
    delete txn.provisionError;
    return result;
  } catch (e) {
    console.error('Tenant provisioning failed for', paymentKey, ':', e.message);
    txn.provisionError = e.message;
    return null;
  }
}

const PROVISION_RETRY_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Finishes purchases whose payment succeeded but whose provisioning or
 * welcome email was interrupted (process crash, SMTP outage). Idempotent:
 * provisionTenantFromPayment and the seeding helpers are safe to re-run.
 */
async function recoverPendingProvisioning({ force = false, limit = 25 } = {}) {
  const txns = await loadMpesaTransactions();
  const now = Date.now();
  const candidates = txns.filter(txn => {
    if (txn.status !== 'completed' || !txn.subdomain) return false;
    if (txn.provisioned && txn.welcomeEmailSent !== false) return false;
    if (!force) {
      const last = new Date(txn.lastProvisionAttemptAt || 0).getTime();
      if (last && now - last < PROVISION_RETRY_COOLDOWN_MS) return false;
    }
    return true;
  });
  if (!candidates.length) return { checked: 0, provisioned: 0, failed: 0 };

  const buyers = await loadTemplateBuyers().catch(() => []);
  const touched = [];
  let provisioned = 0;
  let failed = 0;
  for (const txn of candidates.slice(0, limit)) {
    const buyer = buyers.find(b =>
      String(b.email || '').toLowerCase() === String(txn.customerEmail || '').toLowerCase()
    ) || null;
    txn.provisionAttempts = Number(txn.provisionAttempts || 0) + 1;
    txn.lastProvisionAttemptAt = new Date().toISOString();
    const result = await finalizeTenantPurchase(txn, buyer);
    if (result) provisioned++;
    else failed++;
    touched.push(txn);
  }

  // Re-read before persisting so transactions created while the sweep ran are
  // preserved; only the provisioning fields are merged back.
  const latest = await loadMpesaTransactions();
  const updates = new Map(touched.map(txn => [String(txn.id), txn]));
  const merged = latest.map(txn => {
    const update = updates.get(String(txn.id));
    if (!update) return txn;
    const next = {
      ...txn,
      tenantId: update.tenantId || txn.tenantId,
      blogUrl: update.blogUrl || txn.blogUrl,
      provisioned: Boolean(update.provisioned),
      provisionAttempts: update.provisionAttempts,
      lastProvisionAttemptAt: update.lastProvisionAttemptAt,
      welcomeEmailSent: update.welcomeEmailSent
    };
    if (update.provisionedAt) next.provisionedAt = update.provisionedAt;
    if (update.provisionError) next.provisionError = update.provisionError;
    else delete next.provisionError;
    return next;
  });
  await saveMpesaTransactions(merged);
  if (failed) {
    console.warn(`[tenancy] provisioning recovery: ${failed} transaction(s) still failing`);
  }
  return { checked: candidates.length, provisioned, failed };
}

async function getManagedTenant(req) {
  const user = req.session?.user || req.user;
  if (!user) return null;
  const role = String(user.role || 'USER').toUpperCase();
  if (role === 'ADMIN') {
    const requested = req.query?.tenantId || req.body?.tenantId;
    if (requested) return tenancy.store.findTenantById(requested);
    if (req.tenant && String(req.tenant.id) !== tenancy.PLATFORM_TENANT_ID) return req.tenant;
    return null;
  }
  if (user.tenantId) return tenancy.store.findTenantById(user.tenantId);
  return null;
}

/**
 * Suspending a buyer stops their blog from resolving: the tenant is marked
 * suspended and every active domain is parked. Unsuspending restores it.
 */
async function setTenantServing(tenantId, enabled, reason) {
  if (!tenantId) return;
  const tenant = await tenancy.store.findTenantById(tenantId);
  if (!tenant) return;
  const nextTenant = { ...tenant, status: enabled ? 'active' : 'suspended' };
  if (enabled) {
    delete nextTenant.suspensionReason;
    delete nextTenant.suspendedAt;
  } else {
    nextTenant.suspensionReason = reason || 'Suspended by administrator.';
    nextTenant.suspendedAt = new Date().toISOString();
  }
  await tenancy.store.upsertTenant(nextTenant);

  const domains = await tenancy.store.listDomainsForTenant(tenantId);
  for (const domain of domains) {
    let next;
    if (enabled) {
      if (domain.status !== 'suspended') continue;
      next = { ...domain, status: domain.previousStatus || (domain.type === 'platform' ? 'active' : 'pending') };
      delete next.previousStatus;
    } else {
      if (domain.status === 'suspended') continue;
      next = { ...domain, previousStatus: domain.status, status: 'suspended' };
    }
    await tenancy.store.upsertDomain(next);
    tenancy.invalidateHostCache(domain.hostname);
  }
}

function requireAuth(req, res, next) {
  if (IS_DEV) console.log('Auth check - Session:', !!req.session, 'User:', !!req.session?.user);

  // Check session first
  if (req.session && req.session.user) return next();

  // Check Authorization header as fallback (JWT)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        username: decoded.username,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        tenantId: decoded.tenantId || null
      };
      return next();
    } catch (e) {
      console.log('JWT verification failed in requireAuth:', e.message);
    }
  }

  return res.status(401).json({ error: 'not authenticated' });
}

function isUserAdmin(req) {
  // Check session first
  if (req.session && req.session.user && String(req.session.user.role || 'USER').toUpperCase() === 'ADMIN') {
    return true;
  }

  // Check Authorization header for JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (String(decoded.role || 'USER').toUpperCase() === 'ADMIN') {
        return true;
      }
    } catch (e) {
      // Ignore verification errors here
    }
  }

  return false;
}

function tenantBoundaryOk(user, req) {
  const role = String(user?.role || 'USER').toUpperCase();
  if (role === 'ADMIN') return true;
  if (role !== 'TEMPLATE_BUYER') return true;
  if (!user?.tenantId) return false;
  return String(req.tenant?.id || '') === String(user.tenantId);
}

function requireAdminRole(req, res, next) {
  const user = req.session?.user || req.user;
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  if (String(user.role || 'USER').toUpperCase() !== 'ADMIN') {
    return res.status(403).json({ error: 'admin_only' });
  }
  if (!tenantBoundaryOk(user, req)) return res.status(403).json({ error: 'tenant_forbidden' });
  return next();
}

// Allow both ADMIN and TEMPLATE_BUYER roles
function requireAdminOrBuyer(req, res, next) {
  const user = req.session?.user || req.user;
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  const role = String(user.role || 'USER').toUpperCase();
  if (role !== 'ADMIN' && role !== 'TEMPLATE_BUYER') {
    return res.status(403).json({ error: 'admin_only' });
  }
  if (!tenantBoundaryOk(user, req)) return res.status(403).json({ error: 'tenant_forbidden' });
  return next();
}

// Seller-only: blocks TEMPLATE_BUYER from sensitive operations
function requireSellerOnly(req, res, next) {
  const user = req.session?.user || req.user;
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  if (String(user.role || 'USER').toUpperCase() !== 'ADMIN') {
    return res.status(403).json({ error: 'seller_only' });
  }
  return next();
}

const requireAdmin = [requireAuth, requireAdminRole];
const requireAdminOrBuyerAuth = [requireAuth, requireAdminOrBuyer];
const requireSeller = [requireAuth, requireSellerOnly];

// Admin: Template Buyers API (seller-only)
app.get('/api/admin/buyers', requireSeller, async (req, res) => {
  try {
    const [buyers, tenants, domains] = await Promise.all([
      loadTemplateBuyers(),
      tenancy.store.loadTenants().catch(() => []),
      tenancy.store.loadDomains().catch(() => [])
    ]);

    // Attach the buyer's tenant and its platform/custom domains so the seller
    // sees the blog addresses generated at checkout or added later.
    const enriched = buyers.map(buyer => {
      const tenant = tenants.find(item =>
        (buyer.id && String(item.ownerUserId || '') === String(buyer.id)) ||
        (buyer.email && item.ownerEmail &&
          String(item.ownerEmail).toLowerCase() === String(buyer.email).toLowerCase())
      ) || null;
      const tenantDomains = tenant
        ? domains.filter(domain => String(domain.tenantId) === String(tenant.id))
        : [];
      const sorted = [...tenantDomains].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'platform' ? -1 : 1;
        if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) return a.isPrimary ? -1 : 1;
        return String(a.hostname).localeCompare(String(b.hostname));
      });
      return {
        ...buyer,
        tenantId: tenant ? tenant.id : (buyer.tenantId || null),
        tenantStatus: tenant ? tenant.status : null,
        domains: sorted.map(domain => ({
          id: domain.id,
          hostname: domain.hostname,
          type: domain.type,
          status: domain.status,
          isPrimary: Boolean(domain.isPrimary),
          sslStatus: domain.sslStatus || null,
          url: tenancy.blogUrlFor(domain.hostname)
        }))
      };
    });

    res.json({ success: true, buyers: enriched });
  } catch (err) {
    console.error('Error fetching template buyers:', err);
    res.status(500).json({ error: 'failed_fetch_buyers' });
  }
});

app.post('/api/admin/buyers', requireSeller, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Missing name or email' });
    }

    const buyers = await loadTemplateBuyers();
    
    // Check if email already exists
    if (buyers.find(b => b.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'Buyer with this email already exists' });
    }

    // Generate license key (e.g. BLG-ABCD-1234-EFGH)
    const generateSegment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const licenseKey = `BLG-${generateSegment()}-${generateSegment()}-${generateSegment()}`;

    // Need ObjectId for id, using crypto if not from mongo
    const id = (typeof ObjectId !== 'undefined') ? new ObjectId().toString() : Date.now().toString();

    const newBuyer = {
      id,
      name,
      email,
      licenseKey,
      purchaseDate: new Date().toISOString(),
      status: 'active'
    };

    buyers.push(newBuyer);
    await saveTemplateBuyers(buyers);

    res.json({ success: true, buyer: newBuyer });
  } catch (err) {
    console.error('Error adding template buyer:', err);
    res.status(500).json({ error: 'failed_add_buyer' });
  }
});

app.delete('/api/admin/buyers/:id', requireSeller, async (req, res) => {
  try {
    const { id } = req.params;
    let buyers = await loadTemplateBuyers();
    const initialLen = buyers.length;
    buyers = buyers.filter(b => b.id !== id);
    if (buyers.length === initialLen) {
      return res.status(404).json({ error: 'Buyer not found' });
    }
    await saveTemplateBuyers(buyers);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting template buyer:', err);
    res.status(500).json({ error: 'failed_delete_buyer' });
  }
});

// Admin: Users API (admin-or-buyer: buyers see only themselves, admins see all)
app.get('/api/users', requireAdminOrBuyerAuth, async (req, res) => {
  try {
    const users = await loadUsers();
    const currentUser = req.session?.user || req.user;
    const isAdmin = String(currentUser?.role || 'USER').toUpperCase() === 'ADMIN';
    let list = Object.entries(users || {}).map(([username, data]) => ({
      username,
      name: data?.name || '',
      email: data?.email || '',
      role: data?.role || 'USER',
      active: data?.active ?? true,
      rights: Array.isArray(data?.rights) ? data.rights : [],
      adminKeySet: !!(data?.adminKeyHash || data?.adminKeySet),
      adminKeyEncExists: !!data?.adminKeyEnc,
      buyerId: data?.buyerId || null
    }));
    // Template buyers can only see their own profile
    if (!isAdmin) {
      list = list.filter(u => u.username === currentUser.username);
    }
    res.json({ users: list });
  } catch (e) {
    console.error('Load users error:', e);
    res.status(500).json({ error: 'failed_to_load_users' });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, name, email, role, adminKey, rights } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_username_or_password' });
    const users = await loadUsers();
    // Prevent creating a user if a case-insensitive match already exists
    const existingKey = findUserKey(users, username);
    if (users && existingKey) return res.status(400).json({ error: 'user_exists' });
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // Store under the provided casing (preserve display), but ensure future lookups
    // will resolve case-insensitively via findUserKey.
    users[username] = { name: name || '', email: email || '', passwordHash: hash, active: true, role: role || 'USER', rights: Array.isArray(rights) ? rights : [] };
    // Optional admin key at creation time
    if (adminKey && String(adminKey).trim()) {
      const keyHash = await bcrypt.hash(String(adminKey).trim(), BCRYPT_ROUNDS);
      users[username].adminKeyHash = keyHash;
      users[username].adminKeyEnc = encryptText(String(adminKey).trim());
      users[username].adminKeySet = true;
    }
    await saveUsers(users);
    // Use the stored casing for the response
    const storedKey = findUserKey(users, username) || username;
    return res.json({ success: true, user: { username: storedKey, name: users[storedKey].name, email: users[storedKey].email, role: users[storedKey].role } });
  } catch (e) {
    console.error('Create user error:', e);
    return res.status(500).json({ error: 'failed_to_create_user' });
  }
});

// GET /api/users/:username - Get single user info (admin only)
app.get('/api/users/:username', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!users || !userKey || !users[userKey]) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    const u = users[userKey];
    return res.json({
      success: true,
      user: {
        username: userKey,
        name: u.name || '',
        email: u.email || '',
        role: u.role || 'USER',
        active: u.active ?? true,
        rights: Array.isArray(u.rights) ? u.rights : [],
        adminKeySet: !!(u.adminKeyHash || u.adminKeySet)
      }
    });
  } catch (e) {
    console.error('Get user error:', e);
    return res.status(500).json({ error: 'failed_to_get_user' });
  }
});

// PUT /api/users/:username - Update user properties (admin only)
app.put('/api/users/:username', requireAdminOrBuyerAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const { active, role, email, password, adminKey, rights } = req.body || {};

    // Prevent deactivating self
    const requestUser = req.session?.user || req.user;
    if (username === requestUser?.username && active === false) {
      return res.status(400).json({ error: 'cannot_deactivate_self' });
    }

    // Buyers can only edit their own profile (name/email/password), not roles/rights
    const isBuyer = String(requestUser?.role || 'USER').toUpperCase() === 'TEMPLATE_BUYER';
    if (isBuyer && username !== requestUser?.username) {
      return res.status(403).json({ error: 'cannot_edit_other_users' });
    }

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!users || !userKey || !users[userKey]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    // Buyers: only allow email, name, password changes
    if (isBuyer) {
      if (email !== undefined) {
        users[userKey].email = String(email).trim();
      }
      if (password) {
        users[userKey].passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
      }
    } else {
      // Full admin updates
      if (active !== undefined) {
        users[userKey].active = active;
      }
      if (role !== undefined) {
        users[userKey].role = role;
      }
      if (email !== undefined) {
        users[userKey].email = String(email).trim();
      }
      if (rights !== undefined && Array.isArray(rights)) {
        users[userKey].rights = rights;
      }
      if (password) {
        users[userKey].passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
      }
      if (adminKey !== undefined) {
        const trimmed = String(adminKey).trim();
        if (trimmed) {
          users[userKey].adminKeyHash = await bcrypt.hash(trimmed, BCRYPT_ROUNDS);
          users[userKey].adminKeyEnc = encryptText(trimmed);
          users[userKey].adminKeySet = true;
        } else {
          // Empty string clears the admin key
          delete users[userKey].adminKeyHash;
          delete users[userKey].adminKeyEnc;
          users[userKey].adminKeySet = false;
        }
      }
    }

    await saveUsers(users);
    return res.json({
      success: true,
      user: {
        username,
        name: users[userKey].name,
        email: users[userKey].email,
        role: users[userKey].role,
        active: users[userKey].active,
        rights: Array.isArray(users[userKey].rights) ? users[userKey].rights : []
      }
    });
  } catch (e) {
    console.error('Update user error:', e);
    return res.status(500).json({ error: 'failed_to_update_user' });
  }
});

// DELETE /api/users/:username - Delete user account (seller only)
app.delete('/api/users/:username', requireSeller, async (req, res) => {
  try {
    const { username } = req.params;
    const requestUser = req.session?.user || req.user;

    // Prevent deleting self
    if (username === requestUser?.username) {
      return res.status(400).json({ error: 'cannot_delete_self' });
    }

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!users || !userKey || !users[userKey]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    delete users[userKey];
    await saveUsers(users);
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (e) {
    console.error('Delete user error:', e);
    return res.status(500).json({ error: 'failed_to_delete_user' });
  }
});

// POST /api/users/:username/admin-key - Set user's admin key (user can set their own or admin can set for others)
app.post('/api/users/:username/admin-key', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const { adminKey } = req.body || {};

    if (!adminKey || String(adminKey).length === 0) {
      return res.status(400).json({ error: 'admin_key_required' });
    }

    const requestUser = req.session?.user || req.user;
    // Load users early so we can perform case-insensitive comparisons for permissions
    const users = await loadUsers();

    // If the route targets the canonical 'admin' identifier, map it to the
    // actual ADMIN account stored in users (helps when the stored admin username differs).
    const targetUsername = (String(username).toLowerCase() === 'admin')
      ? (Object.keys(users || {}).find(k => String(users[k]?.role || '').toUpperCase() === 'ADMIN') || username)
      : username;

    const resolvedUserKey = findUserKey(users, targetUsername);
    if (!users || !resolvedUserKey || !users[resolvedUserKey]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    // Check if user is setting their own key or if requester is an admin
    const isAdmin = String(requestUser?.role || 'USER').toUpperCase() === 'ADMIN';
    const requestUserKey = requestUser ? findUserKey(users, requestUser.username) : null;
    if (!requestUser || (requestUserKey !== resolvedUserKey && !isAdmin)) {
      return res.status(403).json({ error: 'cannot_set_other_users_admin_key' });
    }

    // Hash the admin key
    const keyHash = await bcrypt.hash(String(adminKey), BCRYPT_ROUNDS);
    users[resolvedUserKey].adminKeyHash = keyHash;
    users[resolvedUserKey].adminKeyEnc = encryptText(String(adminKey));
    users[resolvedUserKey].adminKeySet = true;

    await saveUsers(users);
    return res.json({ success: true, message: 'Admin key set successfully' });
  } catch (e) {
    console.error('Error setting admin key:', e);
    return res.status(500).json({ error: 'failed_to_set_admin_key' });
  }
});

// DELETE /api/users/:username/admin-key - Clear user's admin key (user can clear their own or super-admin can clear for others)
app.delete('/api/users/:username/admin-key', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;

    // Check if user is clearing their own key or if requester is an admin
    const requestUser = req.session?.user || req.user;
    const isAdmin = String(requestUser?.role || 'USER').toUpperCase() === 'ADMIN';
    if (!requestUser || (requestUser.username !== username && !isAdmin)) {
      return res.status(403).json({ error: 'cannot_clear_other_users_admin_key' });
    }

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    // Support canonical 'admin' path -> locate the ADMIN role user if needed
    const resolvedUserKey = userKey || (String(username).toLowerCase() === 'admin' ? Object.keys(users || {}).find(k => String(users[k]?.role || '').toUpperCase() === 'ADMIN') : null);
    if (!users || !resolvedUserKey || !users[resolvedUserKey]) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    delete users[resolvedUserKey].adminKeyHash;
    delete users[resolvedUserKey].adminKeyEnc;
    users[resolvedUserKey].adminKeySet = false;

    await saveUsers(users);

    // Clear verification if it's for this user
    if (req.session?.adminKeyVerifiedUsername === username || req.session?.adminKeyVerifiedUsername && String(req.session.adminKeyVerifiedUsername).toLowerCase() === String(username).toLowerCase()) {
      req.session.adminKeyVerified = false;
      req.session.adminKeyVerifiedAt = null;
      req.session.adminKeyVerifiedUsername = null;
    }

    return res.json({ success: true, message: 'Admin key cleared' });
  } catch (e) {
    console.error('Error clearing admin key:', e);
    return res.status(500).json({ error: 'failed_to_clear_admin_key' });
  }
});

// POST /api/users/:username/verify-admin-key - Verify user's admin key
app.post('/api/users/:username/verify-admin-key', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const { adminKey } = req.body || {};

    if (!adminKey) {
      return res.status(400).json({ error: 'admin_key_required' });
    }

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!users || !userKey || !users[userKey]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const user = users[userKey];

    // Check if user has admin key set
    if (!user.adminKeyHash) {
      return res.status(400).json({ error: 'user_has_no_admin_key' });
    }

    // Verify admin key
    const keyMatches = await bcrypt.compare(String(adminKey), user.adminKeyHash);
    if (!keyMatches) {
      return res.status(401).json({ error: 'invalid_admin_key' });
    }

    // Set admin key verification in session
    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
    req.session.adminKeyVerifiedUsername = username;

    return res.json({ success: true, message: 'Admin key verified' });
  } catch (e) {
    console.error('Error verifying admin key:', e);
    return res.status(500).json({ error: 'failed_to_verify_admin_key' });
  }
});

// POST /api/users/:username/admin-key/view - View a user's admin key (admin only)
app.post('/api/users/:username/admin-key/view', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'password_required' });

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!users || !userKey || !users[userKey]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const user = users[userKey];
    if (!user.adminKeyHash) {
      return res.status(400).json({ error: 'user_has_no_admin_key' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_password' });

    const key = decryptText(user.adminKeyEnc || '');
    return res.json({ success: true, key: key || '' });
  } catch (e) {
    console.error('Error viewing user admin key:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// -----------------------------------------------------------------
// Per-user Admin Entry Key (recommended) - status / set / verify / view
// -----------------------------------------------------------------

app.get('/api/security/admin-key/status', requireAuth, async (req, res) => {
  try {
    // Localhost bypass
    if (isLocalhostAdminKeyBypassEnabled(req)) {
      return res.json({ required: false, hasKey: false, verified: true, mode: 'localhost' });
    }

    const currentUser = req.session?.user || req.user;
    const username = currentUser?.username;

    if (!username) return res.status(401).json({ error: 'not authenticated' });

    // If env key is set, it's globally required
    if (process.env.ADMIN_ENTRY_KEY) {
      const verified = req.session?.adminKeyVerified === true;
      return res.json({ required: true, hasKey: true, verified, mode: 'env', username });
    }

    // Require key for admin users only
    const isAdmin = String(currentUser?.role || 'USER').toUpperCase() === 'ADMIN';
    if (!isAdmin) {
      return res.json({ required: false, hasKey: false, verified: true, mode: 'not_admin', username });
    }

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const hasKey = !!user.adminKeyHash;
    const verified = req.session?.adminKeyVerified === true && req.session?.adminKeyVerifiedUsername === username;
    return res.json({ required: true, hasKey, verified, mode: hasKey ? 'per_user' : 'per_user_not_set', username });
  } catch (e) {
    console.error('admin-key status error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/security/admin-key/set', requireAuth, async (req, res) => {
  try {
    const currentUser = req.session?.user || req.user;
    const username = currentUser?.username;
    if (!username) return res.status(401).json({ error: 'not authenticated' });
    if (process.env.ADMIN_ENTRY_KEY) {
      return res.status(403).json({ error: 'env_managed', message: 'Admin entry key is managed by environment.' });
    }

    const { adminKey } = req.body || {};
    const trimmed = String(adminKey || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'admin_key_required' });

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    user.adminKeyHash = await bcrypt.hash(trimmed, BCRYPT_ROUNDS);
    user.adminKeyEnc = encryptText(trimmed);
    user.adminKeySet = true;

    await saveUsers(users);

    // Auto-verify after setting
    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
    req.session.adminKeyVerifiedUsername = username;

    return res.json({ success: true, message: 'Admin key set' });
  } catch (e) {
    console.error('admin-key set error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/security/admin-key/verify', requireAuth, async (req, res) => {
  try {
    const currentUser = req.session?.user || req.user;
    const username = currentUser?.username;
    if (!username) return res.status(401).json({ error: 'not authenticated' });

    const provided = String(req.body?.adminKey || '').trim();
    if (!provided) return res.status(400).json({ error: 'admin_key_required' });

    // Env-managed global key
    if (process.env.ADMIN_ENTRY_KEY) {
      const ok = provided === String(process.env.ADMIN_ENTRY_KEY);
      if (!ok) return res.status(403).json({ success: false, error: 'invalid_admin_key', mode: 'env' });
      req.session.adminKeyVerified = true;
      req.session.adminKeyVerifiedAt = Date.now();
      req.session.adminKeyVerifiedUsername = username;
      return res.json({ success: true, mode: 'env' });
    }

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    if (!user.adminKeyHash) return res.status(400).json({ error: 'admin_key_not_set' });

    const ok = await bcrypt.compare(provided, user.adminKeyHash);
    if (!ok) return res.status(403).json({ success: false, error: 'invalid_admin_key', mode: 'per_user' });

    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
    req.session.adminKeyVerifiedUsername = username;
    return res.json({ success: true, mode: 'per_user' });
  } catch (e) {
    console.error('admin-key verify error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/security/admin-key/clear-verification', requireAuth, (req, res) => {
  req.session.adminKeyVerified = false;
  req.session.adminKeyVerifiedAt = null;
  req.session.adminKeyVerifiedUsername = null;
  return res.json({ success: true });
});

// EMERGENCY: Clear the current user's admin key (no admin key verification required)
app.post('/api/security/admin-key/emergency-clear', requireAuth, async (req, res) => {
  try {
    const currentUser = req.session?.user || req.user;
    const username = currentUser?.username;
    if (!username) return res.status(401).json({ error: 'not authenticated' });

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    delete user.adminKeyHash;
    delete user.adminKeyEnc;
    user.adminKeySet = false;

    await saveUsers(users);

    req.session.adminKeyVerified = false;
    req.session.adminKeyVerifiedAt = null;
    req.session.adminKeyVerifiedUsername = null;

    return res.json({ success: true, message: 'Admin key cleared. You can now set a new one from Security Settings.' });
  } catch (e) {
    console.error('emergency-clear error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/security/admin-key/view', requireAuth, async (req, res) => {
  try {
    if (process.env.ADMIN_ENTRY_KEY) {
      return res.status(403).json({ error: 'env_managed', message: 'Admin entry key is managed by environment; viewing disabled.' });
    }

    const currentUser = req.session?.user || req.user;
    const username = currentUser?.username;
    if (!username) return res.status(401).json({ error: 'not authenticated' });

    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'password_required' });

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_password' });

    const key = decryptText(user.adminKeyEnc || '');
    return res.json({ success: true, key: key || '' });
  } catch (e) {
    console.error('admin-key view error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ====================================================================
// Subscriber Key Gate – endpoints called by login.html BEFORE login
// (no requireAuth – user is not logged in yet at this point)
// ====================================================================

// POST /api/settings/verify-entry-key
// Validates the subscriber key for the gate overlay (no login session required).
// 2026: Brute-force lockout + constant-time comparison (no early-break loop)
// 2026: Returns a token valid for 5 minutes instead of relying on session (serverless-safe)
app.post('/api/settings/verify-entry-key', async (req, res) => {
  try {
    const ip = getClientIP(req);

    // 2026: Lockout check
    if (isLockedOut(ip)) {
      console.warn(`[SECURITY] key_gate_lockout ip=${ip}`);
      return res.status(429).json({ success: false, error: 'too_many_attempts', message: 'Too many failed attempts. Try again in 15 minutes.' });
    }

    const provided = String(req.body?.adminEntryKey || '').trim();

    // 2026: Input length cap before any expensive bcrypt call
    if (!provided || provided.length > 200) {
      return res.status(400).json({ success: false, error: 'key_required' });
    }

    // Env-managed global key
    if (process.env.ADMIN_ENTRY_KEY) {
      // 2026: Use timingSafeEqual to prevent timing attacks on env key
      const expected = Buffer.from(String(process.env.ADMIN_ENTRY_KEY));
      const actual = Buffer.from(provided.padEnd(process.env.ADMIN_ENTRY_KEY.length, '\0'));
      const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual.subarray(0, expected.length));
      if (!ok) {
        recordFailedAttempt(ip);
        console.warn(`[SECURITY] failed_key_gate ip=${ip}`);
        return res.status(401).json({ success: false, error: 'invalid_key' });
      }
      clearBruteRecord(ip);
      // 2026: Return token instead of session state (serverless-compatible)
      const keyToken = jwt.sign({ purpose: 'admin_key_gate', verifiedAt: Date.now() }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ success: true, mode: 'env', keyToken });
    }

    // Per-user: 2026: constant-time – run ALL comparisons regardless of match
    const users = await loadUsers();
    if (!users) return res.status(500).json({ success: false, error: 'storage_error' });

    let matched = false;
    const comparisons = Object.values(users)
      .filter(u => u.adminKeyHash)
      .map(u => bcrypt.compare(provided, u.adminKeyHash));

    // Run all comparisons concurrently (no early break)
    const results = await Promise.all(comparisons);
    if (results.some(Boolean)) matched = true;

    if (!matched) {
      recordFailedAttempt(ip);
      console.warn(`[SECURITY] failed_key_gate ip=${ip}`);
      return res.status(401).json({ success: false, error: 'invalid_key' });
    }

    clearBruteRecord(ip);
    // 2026: Return token instead of session state (serverless-compatible)
    const keyToken = jwt.sign({ purpose: 'admin_key_gate', verifiedAt: Date.now() }, JWT_SECRET, { expiresIn: '5m' });
    return res.json({ success: true, mode: 'per_user', keyToken });
  } catch (e) {
    console.error('/api/settings/verify-entry-key error:', e);
    return res.status(500).json({ success: false, error: 'internal' });
  }
});

// Admin: Categories API
// Delete category endpoint

const transporter = (process.env.SMTP_HOST && process.env.SMTP_USER)
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })
  : (process.env.SENDGRID_API_KEY
    ? nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY }
    })
    : {
      sendMail: async (opts) => {
        console.log('Mock email:', opts);
        return { messageId: 'mock-' + Date.now() };
      }
    }
  );

// Data backend status. Supabase is the default when configured; Mongo/file
// remain available as fallbacks (or as explicit migration sources).
app.get('/api/admin/data-backend', requireAdmin, async (req, res) => {
  try {
    const backend = isSupabaseEnabled()
      ? 'supabase'
      : ((process.env.DATA_BACKEND || '').toLowerCase() === 'file' ? 'file' : 'mongo');
    const report = { backend, supabase: isSupabaseEnabled() };

    if (isSupabaseEnabled()) {
      const [users, posts, comments, categories] = await Promise.all([
        loadUsers(),
        loadPosts(),
        loadComments(),
        loadCategories()
      ]);
      report.counts = {
        users: Object.keys(users).length,
        posts: posts.length,
        comments: comments.length,
        categories: categories.length
      };
    }

    return res.json({ success: true, ...report });
  } catch (e) {
    console.error('Data backend status error:', e);
    return res.status(500).json({ success: false, error: 'status_failed', details: e.message });
  }
});

// Retired: the old KV/file -> Mongo migration is superseded by
// `node scripts/migrate-to-supabase.js`.
app.post('/api/admin/migrate-to-mongodb', requireAdmin, (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'endpoint_retired',
    message: 'Data migration now runs from the CLI: node scripts/migrate-to-supabase.js (see supabase/README.md).'
  });
});

// Auth routes
app.post('/auth/login', async (req, res) => {
  const ip = getClientIP(req);

  // 2026: Input length cap – prevent bcrypt DoS via huge strings
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: 'missing credentials' });
  if (username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  // 2026: Brute-force lockout check
  if (isLockedOut(ip)) {
    console.warn(`[SECURITY] login_lockout ip=${ip} username=${username}`);
    return res.status(429).json({ error: 'too_many_attempts', message: 'Account temporarily locked. Try again in 15 minutes.' });
  }

  const users = await loadUsers();
  const userKey = findUserKey(users, username);
  const user = userKey ? users[userKey] : null;

  // BYPASSED — admin key gate disabled
  const devPwd = process.env.DEV_ADMIN_PASSWORD || 'password';

  // Only emit verbose/login diagnostics in dev mode (avoid leaking info in prod logs)
  if (IS_DEV) {
    console.log('Login attempt for:', username);
    console.log('User found in storage:', !!user);
    if (user) console.log('User active status:', user.active);
  }

  // Dev/Env admin credentials (single merged condition)
  const isDevAuth = ((IS_DEV || !!process.env.DEV_ADMIN_PASSWORD) && username === 'admin' && password === devPwd);

  if (isDevAuth) {
    clearBruteRecord(ip);
    if (IS_DEV) console.log('Authenticated via Dev/Env admin credentials');
    // Generate JWT token for dev admin
    const token = jwt.sign({
      username: 'admin',
      email: (user && user.email) || process.env.ALLOWED_EMAIL || 'admin@example.com',
      name: (user && user.name) || 'Admin',
      role: (user && user.role) || 'ADMIN'
    }, JWT_SECRET, { expiresIn: '8h' });

    if (IS_DEV) console.log('Login successful for admin (dev password), JWT token generated');

    // Ensure session-based auth works without JWT header
    req.session.user = {
      username: 'admin',
      email: (user && user.email) || process.env.ALLOWED_EMAIL || 'admin@example.com',
      name: (user && user.name) || 'Admin',
      role: (user && user.role) || 'ADMIN'
    };

    // Auto-verify admin key for localhost
    if (isLocalhostAdminKeyBypassEnabled(req)) {
      req.session.adminKeyVerified = true;
      req.session.adminKeyVerifiedAt = Date.now();
      req.session.adminKeyVerifiedUsername = 'admin';
    }

    // Accept keyToken for pre-login gate in dev/admin flow as well
    try {
      const keyToken = String(req.body?.keyToken || '').trim();
      if (keyToken) {
        const decoded = jwt.verify(keyToken, JWT_SECRET);
        if (decoded && decoded.purpose === 'admin_key_gate') {
          req.session.adminKeyVerified = true;
          req.session.adminKeyVerifiedAt = Date.now();
          req.session.adminKeyVerifiedUsername = 'admin';
        }
      }
    } catch (e) {
      console.warn('dev login: provided admin key token invalid or expired');
    }

    // Ensure session is saved before returning response
    return req.session.save((err) => {
      if (err) console.error('Session save error (dev login):', err);
      return res.json({ success: true, token, user: req.session.user });
    });
  }

  // Temporary login path removed for security

  if (!user) {
    recordFailedAttempt(ip);
    console.warn(`[SECURITY] failed_login ip=${ip} username=${username} reason=user_not_found`);
    return res.status(401).json({ error: 'invalid credentials' });
  }

  // Check if user is active
  if (user.active === false) {
    console.warn(`[SECURITY] failed_login ip=${ip} username=${username} reason=account_disabled`);
    return res.status(401).json({ error: 'account_disabled' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    recordFailedAttempt(ip);
    console.warn(`[SECURITY] failed_login ip=${ip} username=${username} reason=bad_password`);
    return res.status(401).json({ error: 'invalid credentials' });
  }

  // Success – clear lockout counter
  clearBruteRecord(ip);

  // 2026: JWT expiry aligned to session (8h)
  const token = jwt.sign({
    username: username,
    email: user.email,
    name: user.name,
    role: user.role || 'USER',
    tenantId: user.tenantId || null
  }, JWT_SECRET, { expiresIn: '8h' });

  if (IS_DEV) console.log('Login successful, JWT token generated for:', username, 'Role:', user.role || 'USER');

  // Ensure session-based auth works without JWT header
  req.session.user = {
    username: username,
    email: user.email,
    name: user.name,
    role: user.role || 'USER',
    tenantId: user.tenantId || null
  };

  // Auto-verify admin key for localhost
  if (isLocalhostAdminKeyBypassEnabled(req)) {
    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
    req.session.adminKeyVerifiedUsername = username;
  }

  // If the client provided a pre-login key token (from /api/settings/verify-entry-key),
  // validate it and mark the session as verified so the admin UI won't prompt again.
  try {
    const keyToken = String(req.body?.keyToken || '').trim();
    if (keyToken) {
      if (IS_DEV) console.log('Login: keyToken present in login payload — verifying');
      try {
        const decoded = jwt.verify(keyToken, JWT_SECRET);
        if (decoded && decoded.purpose === 'admin_key_gate') {
          req.session.adminKeyVerified = true;
          req.session.adminKeyVerifiedAt = Date.now();
          req.session.adminKeyVerifiedUsername = username;
          if (IS_DEV) console.log('Login: keyToken valid; session.adminKeyVerified set for', username);
        } else if (IS_DEV) {
          console.log('Login: keyToken decoded but purpose mismatch');
        }
      } catch (ve) {
        console.warn('Login: keyToken verification failed:', ve && ve.message);
      }
    } else if (IS_DEV) {
      console.log('Login: no keyToken provided in login payload');
    }
  } catch (e) {
    // Token invalid or expired - ignore and do not mark verified
    console.warn('login: provided admin key token invalid or expired');
  }

  // Ensure session is saved before returning response
  return req.session.save((err) => {
    if (err) console.error('Session save error (login):', err);
    if (IS_DEV) console.log('Login response: session.adminKeyVerified=', req.session.adminKeyVerified, 'verifiedFor=', req.session.adminKeyVerifiedUsername, 'user=', req.session.user && req.session.user.username);
    return res.json({ success: true, token, user: req.session.user });
  });
});

// Dev auto-login for localhost (no password needed)
app.post('/auth/dev-login', async (req, res) => {
  try {
    const ip = getClientIP(req);
    if (!isLocalhostRequest(req)) {
      return res.status(403).json({ error: 'localhost_only' });
    }

    const users = await loadUsers();
    const adminUserKey = Object.keys(users || {}).find(k => String(users[k]?.role || '').toUpperCase() === 'ADMIN');
    const adminUser = adminUserKey ? users[adminUserKey] : null;
    const username = adminUserKey || 'admin';

    clearBruteRecord(ip);

    const token = jwt.sign({
      username,
      email: adminUser?.email || process.env.ALLOWED_EMAIL || 'admin@example.com',
      name: adminUser?.name || 'Admin',
      role: adminUser?.role || 'ADMIN'
    }, JWT_SECRET, { expiresIn: '8h' });

    req.session.user = {
      username,
      email: adminUser?.email || process.env.ALLOWED_EMAIL || 'admin@example.com',
      name: adminUser?.name || 'Admin',
      role: adminUser?.role || 'ADMIN'
    };

    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();

    return req.session.save((err) => {
      if (err) console.error('Session save error (dev-login):', err);
      return res.json({ success: true, token, user: req.session.user });
    });
  } catch (e) {
    console.error('dev-login error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/auth/setup-status', async (req, res) => {
  try {
    const users = await loadUsers();
    const hasAny = Object.keys(users || {}).length > 0;
    return res.json({ setup: hasAny });
  } catch (e) {
    return res.json({ setup: false });
  }
});

app.post('/auth/setup', async (req, res) => {
  const { username, password, name, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing username or password' });

  const users = await loadUsers();
  const hasAny = Object.keys(users || {}).length > 0;

  // Check authentication: either session-based OR JWT token
  let isAuthenticated = false;

  if (req.session && req.session.user) {
    isAuthenticated = true;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    // Verify JWT token
    const token = req.headers.authorization.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      isAuthenticated = true;
      if (IS_DEV) console.log('JWT token verified for setup:', decoded.username);
    } catch (e) {
      console.error('JWT verification failed:', e.message);
    }
  }

  // First-run bootstrap: creating the *first* account must be explicit.
  // users.json/settings.json are no longer committed, so an empty user store
  // on a fresh deploy must not let anyone on the internet claim admin.
  const isFirstRun = !hasAny;
  const openFirstRun = isFirstRun && (isLocalhostRequest(req) || process.env.ALLOW_FIRST_RUN_SETUP === 'true');

  if (!isAuthenticated && !openFirstRun) {
    if (isFirstRun) {
      return res.status(403).json({
        error: 'first_run_setup_disabled',
        message: 'Set ALLOW_FIRST_RUN_SETUP=true (then unset it) or run setup from localhost.'
      });
    }
    return res.status(401).json({ error: 'not authenticated' });
  }

  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // Ensure we don't create conflicting usernames differing only in case
    const existingKey = findUserKey(users, username);
    if (existingKey) {
      // Username collision - return existing user info
      return res.status(400).json({ error: 'user_exists' });
    }

    users[username] = { name: name || 'Admin', email: email || '', passwordHash: hash };
    await saveUsers(users);
    const storedKey = findUserKey(users, username) || username;
    return res.json({ success: true, user: { username: storedKey, name: users[storedKey].name, email: users[storedKey].email } });
  } catch (e) {
    console.error('setup error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/auth/status', (req, res) => {
  // Prefer active session
  if (req.session && req.session.user) {
    return res.json({
      loggedIn: true,
      user: req.session.user
    });
  }

  // Fallback to JWT Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (IS_DEV) console.log('JWT token verified for user:', decoded.username);
      return res.json({
        loggedIn: true,
        user: {
          username: decoded.username,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role
        }
      });
    } catch (error) {
      console.log('JWT verification failed:', error.message);
      return res.json({ loggedIn: false });
    }
  }
  console.log('No active session or JWT token provided');
  return res.json({ loggedIn: false });
});

app.post('/auth/logout', (req, res) => {
  if (IS_DEV) console.log('Logout requested - Session exists:', !!req.session, 'User:', req.session?.user?.username || 'none');

  // Check if session exists and has user data
  if (!req.session || !req.session.user) {
    console.log('No active session or user, clearing any existing cookies and returning success');
    res.clearCookie('__s', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res.json({ success: true, message: 'already logged out' });
  }

  const username = req.session.user.username;

  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }

    // Always clear the cookie and send response, regardless of destroy success
    if (IS_DEV) console.log('Session destroy completed for user:', username);

    // Clear the session cookie with all required options
    res.clearCookie('__s', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    console.log('Logout completed successfully, sending response');

    // Send success response
    return res.json({ success: true, message: 'logged out successfully' });
  });
});

// GET /api/auth/me - Return current authenticated user info including rights.
// Returns 200 + {success:false,user:null} for guests instead of 401 so public
// pages don't log spurious auth errors. Storage is only touched when a valid
// session or JWT is present (fast path for the unauthenticated majority).
app.get('/api/auth/me', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  let currentUser = req.session?.user || null;

  if (!currentUser) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
        currentUser = {
          username: decoded.username,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
          via: decoded.via
        };
      } catch (e) {
        // invalid/expired token — treat as guest
      }
    }
  }

  if (!currentUser || !currentUser.username) {
    return res.json({ success: false, user: null });
  }

  try {
    const username = currentUser.username;
    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!users || !userKey || !users[userKey]) {
      // Signed Google JWT for a Google-only account (no user record):
      // the server already verified the Google credential and signed these
      // claims, so trust them instead of reporting a guest (which bounced
      // the admin panel straight back to the login page).
      if (currentUser.via === 'google') {
        return res.json({
          success: true,
          user: {
            username,
            name: currentUser.name || '',
            email: currentUser.email || '',
            role: currentUser.role || 'USER',
            active: true,
            rights: []
          }
        });
      }
      return res.json({ success: false, user: null });
    }

    const u = users[userKey];
    return res.json({
      success: true,
      user: {
        username: userKey,
        name: u.name || '',
        email: u.email || '',
        role: u.role || 'USER',
        active: u.active ?? true,
        rights: Array.isArray(u.rights) ? u.rights : []
      }
    });
  } catch (e) {
    console.error('Auth/me error:', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/auth/google', async (req, res) => {
  const { credential, id_token } = req.body || {};
  const token = credential || id_token; // Support both new and old formats
  const keyToken = String(req.body?.keyToken || '').trim();

  if (!token) return res.status(400).json({ error: 'missing token' });

  try {
    // Verify the token with Google's tokeninfo endpoint
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
    const payload = await response.json();

    if (!response.ok || payload.error) {
      return res.status(401).json({ error: 'invalid token' });
    }

    if (payload.aud !== CLIENT_ID) {
      return res.status(401).json({ error: 'invalid client' });
    }

    const email = payload.email;

    // Check if user exists in users.json or if it's an allowed email/domain
    const users = await loadUsers();
    const isExistingUser = Object.values(users).some(user => user.email === email);

    if (!isExistingUser) {
      if (ALLOWED_EMAIL && email !== ALLOWED_EMAIL) {
        return res.status(403).json({ error: 'email not allowed' });
      }
      if (ALLOWED_DOMAIN && !email.endsWith('@' + ALLOWED_DOMAIN)) {
        return res.status(403).json({ error: 'domain not allowed' });
      }
    }

    // Look up the matching user record so the session and JWT carry proper
    // username/role (Google-only users may not have a record).
    // NOTE: /api/auth/me requires session.user.username — a session without
    // it is treated as a guest, which used to bounce Google logins straight
    // back to the login page.
    const matchedUser = Object.entries(users).find(([, u]) => u && u.email === email);
    const sessionUser = {
      username: (matchedUser && matchedUser[0]) || email,
      email: payload.email,
      name: payload.name || 'Google User',
      role: matchedUser
        ? (String(matchedUser[1].role || 'USER').toUpperCase() || 'USER')
        : (ALLOWED_EMAIL && email === ALLOWED_EMAIL ? 'ADMIN' : 'USER'),
      tenantId: matchedUser ? (matchedUser[1].tenantId || null) : null,
      // Marker so /api/auth/me can trust the signed claims for Google-only
      // accounts that have no user record.
      via: 'google'
    };

    req.session.user = sessionUser;

    // If the client provided a pre-login key token, validate and mark session verified
    try {
      if (keyToken) {
        const decoded = jwt.verify(keyToken, JWT_SECRET);
        if (decoded && decoded.purpose === 'admin_key_gate') {
          // Use email as the verified username placeholder for session tracking
          req.session.adminKeyVerified = true;
          req.session.adminKeyVerifiedAt = Date.now();
          req.session.adminKeyVerifiedUsername = payload.email || null;
        }
      }
    } catch (e) {
      console.warn('Google login: provided admin key token invalid or expired');
    }

    // 2026: Always return a signed JWT (8h, same as password login) so auth
    // survives hosts where the server-side session store cannot persist
    // (e.g. serverless without KV). /api/auth/me falls back to this Bearer
    // token via the client's sessionStorage authToken. The previous base64
    // "email|timestamp" token failed jwt.verify and caused an instant logout.
    let authToken = '';
    try {
      authToken = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '8h' });
    } catch (e) {
      console.error('JWT sign error (google login):', e.message);
    }

    // Ensure session is saved before returning response
    return req.session.save((err) => {
      if (err) console.error('Session save error (google login):', err);
      return res.json({ success: true, email: payload.email, name: payload.name, token: authToken });
    });
  } catch (e) {
    console.error('Google auth error:', e);
    return res.status(500).json({ error: 'verification failed' });
  }
});

// ── Persistent password-reset token store ──
// Tokens are stored in MongoDB/KV (with the same fallback pattern as other data)
// so they survive Vercel serverless cold starts, and are pruned when they expire.
const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKENS_KV_KEY = 'reset_tokens';
const RESET_TOKENS_FILE = path.join(DATA_DIR, 'reset_tokens.json');

async function loadResetTokens() {
  if (isSupabaseEnabled()) {
    try {
      const tokens = await supabaseStore.loadResetTokens();
      let changed = false;
      for (const key of Object.keys(tokens)) {
        const entry = tokens[key];
        if (!entry || !entry.expires || Date.now() > entry.expires) {
          delete tokens[key];
          changed = true;
        }
      }
      if (changed) await supabaseStore.saveResetTokens(tokens);
      return tokens;
    } catch (e) {
      console.error('Supabase reset tokens load failed:', e.message);
      return {};
    }
  }
  try {
    const result = await loadWithFallbackSingle({
      collectionName: 'reset_tokens',
      mongoFilter: { type: 'tokens' },
      kvKey: RESET_TOKENS_KV_KEY,
      filePath: RESET_TOKENS_FILE,
      defaultData: {}
    });
    const tokens = (result && result.tokens && typeof result.tokens === 'object' && !Array.isArray(result.tokens))
      ? result.tokens
      : {};
    // Prune expired entries
    let changed = false;
    for (const key of Object.keys(tokens)) {
      const entry = tokens[key];
      if (!entry || !entry.expires || Date.now() > entry.expires) {
        delete tokens[key];
        changed = true;
      }
    }
    if (changed) await saveResetTokens(tokens);
    return tokens;
  } catch (e) {
    console.error('loadResetTokens error:', e.message);
    return {};
  }
}

async function saveResetTokens(tokens) {
  if (isSupabaseEnabled()) return supabaseStore.saveResetTokens(tokens);
  try {
    const mongoDb = await getMongoDB();
    if (mongoDb) {
      await mongoDb.collection('reset_tokens').updateOne(
        { type: 'tokens' },
        { $set: { tokens, updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set(RESET_TOKENS_KV_KEY, JSON.stringify({ tokens }));
      return;
    }
    fs.writeFileSync(RESET_TOKENS_FILE, JSON.stringify({ tokens }, null, 2));
  } catch (e) {
    console.error('saveResetTokens error:', e.message);
  }
}

// Forgot password endpoint
app.post('/auth/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'missing email' });

  try {
    const users = await loadUsers();
    const targetUser = Object.values(users).find(u => u.email === email);

    // Resolve admin email: prefer admin user email, then settings.author.email, then ALLOWED_EMAIL, else requester email
    let adminEmail = '';
    try {
      adminEmail = (users['admin'] && users['admin'].email) ? users['admin'].email : '';
      if (!adminEmail) {
        const settings = await readSettings();
        adminEmail = (settings && settings.author && settings.author.email) ? settings.author.email : '';
      }
      if (!adminEmail) adminEmail = process.env.ALLOWED_EMAIL || '';
      if (!adminEmail) adminEmail = email; // last resort
    } catch (e) {
      adminEmail = process.env.ALLOWED_EMAIL || email;
    }

    // If no matching user, avoid user enumeration: notify admin optionally, but always return success
    if (!targetUser) {
      const mailOptions = {
        from: (process.env.SMTP_FROM && String(process.env.SMTP_FROM).trim()) ? String(process.env.SMTP_FROM).trim() : (process.env.ALLOWED_EMAIL || 'noreply@example.com'),
        to: adminEmail,
        subject: `Password reset attempted for unknown email: ${email}`,
        html: `
          <h2>Password Reset Attempt</h2>
          <p>A password reset was requested for <strong>${email}</strong>, but no matching user was found.</p>
          <p>No action is required. If this was unexpected, you may review security logs in the admin panel.</p>
        `
      };
      try {
        await transporter.sendMail(mailOptions);
        console.log('Admin notification email sent for unknown email:', email);
      } catch (err) {
        console.error('Failed to send admin notification:', err.message);
      }
      return res.json({ success: true, message: 'If an account exists, a reset email has been sent.' });
    }

    // Generate reset token (username + timestamp + random)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenData = `${targetUser.username}|${Date.now()}|${resetToken}`;
    const encryptedToken = encryptText(tokenData);

    // Store token persistently (survives serverless cold starts) with an expiry
    const tokens = await loadResetTokens();
    tokens[resetToken] = { username: targetUser.username, expires: Date.now() + RESET_TOKEN_TTL_MS };
    await saveResetTokens(tokens);

    // Build admin-focused email with both password reset link and admin key guidance
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/reset.html?token=${resetToken}`;
    const adminPanelUrl = `${baseUrl}/admin.html`;

    // Choose a valid From address (avoid using SMTP_USER like 'apikey')
    const fromAddress = (process.env.SMTP_FROM && String(process.env.SMTP_FROM).trim())
      ? String(process.env.SMTP_FROM).trim()
      : (adminEmail || process.env.ALLOWED_EMAIL || 'noreply@example.com');

    const mailOptions = {
      from: fromAddress,
      to: adminEmail,
      subject: `Admin action required: Password reset for ${targetUser.username} (${email})`,
      html: `
        <h2>Password Reset Requested</h2>
        <p>A password reset was requested for the user:</p>
        <ul>
          <li><strong>Username:</strong> ${targetUser.username}</li>
          <li><strong>Email:</strong> ${email}</li>
        </ul>
        <p>Use the link below to reset the password:</p>
        <p><a href="${resetUrl}">Reset Password</a> (expires in 24 hours)</p>
        <hr>
        <h3>Admin Entry Key</h3>
        <p>If you also need to rotate or reset the Admin Entry Key, open the admin panel and update it in the Security section:</p>
        <p><a href="${adminPanelUrl}">Open Admin Panel</a></p>
        <p>This email was sent to the configured admin email to ensure secure password and key management.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', adminEmail);
    return res.json({ success: true, message: 'Reset email sent' });
  } catch (e) {
    console.error('Forgot password error:', e);
    return res.status(500).json({ error: 'failed to send reset email' });
  }
});

// Reset password endpoint
app.post('/auth/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'missing token or password' });

  try {
    // Verify token (from persistent store)
    const tokens = await loadResetTokens();
    const tokenInfo = tokens[token];
    if (!tokenInfo) {
      return res.status(400).json({ error: 'invalid or expired token' });
    }

    if (Date.now() > tokenInfo.expires) {
      delete tokens[token];
      await saveResetTokens(tokens);
      return res.status(400).json({ error: 'token expired' });
    }

    // Update user password
    const users = await loadUsers();
    const user = users[tokenInfo.username];
    if (!user) return res.status(404).json({ error: 'user not found' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.passwordHash = hash;
    await saveUsers(users);

    // Clean up token
    delete tokens[token];
    await saveResetTokens(tokens);

    return res.json({ success: true, message: 'password reset successfully' });
  } catch (e) {
    console.error('Reset password error:', e);
    return res.status(500).json({ error: 'failed to reset password' });
  }
});

// ── Post list helpers ────────────────────────────────────────────────
function stripHtml(html) {
  return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function excerptOf(content, max = 240) {
  const text = stripHtml(content);
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function readingMinutesOf(content) {
  const words = stripHtml(content).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Lightweight list item: no body HTML (payload win on list/archive responses)
function toSummary(post) {
  const { content, ...rest } = post;
  return { ...rest, excerpt: excerptOf(content), readingMinutes: readingMinutesOf(content) };
}

function isExpiredPost(post) {
  if (!post || !post.expiryDate) return false;
  const expiry = new Date(post.expiryDate).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

function publishedPosts(posts) {
  const now = new Date();
  return posts.filter(p => !p.isDeleted && !p.isDraft && new Date(p.date) <= now && !isExpiredPost(p));
}

function isPremiumReader(req) {
  const role = String((req.session?.user || req.user)?.role || 'USER').toUpperCase();
  return isUserAdmin(req) || role === 'TEMPLATE_BUYER';
}

function teaserContent(content, max = 600) {
  const source = String(content || '');
  // Show only the opening paragraph so paywalled bodies don't leak.
  const firstBlock = source.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const text = stripHtml(firstBlock ? firstBlock[1] : source);
  const cut = text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  if (!cut) return '';
  const escaped = cut.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped}</p>`;
}

function redactPremiumPost(post, req) {
  if (!post) return post;
  let view = post;
  if (post.isPremium && !isPremiumReader(req)) {
    view = { ...post, content: teaserContent(post.content) };
  }
  if (!isUserAdmin(req)) {
    const { previewToken, ...safe } = view;
    return safe;
  }
  return view;
}

// Responses depend on the caller's role (drafts, premium teasers) and on the
// tenant host, so keep them out of shared caches while letting browsers
// revalidate cheaply with the ETag Express attaches to res.json().
function setPrivateRevalidate(res) {
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
}

app.get('/api/posts', async (req, res) => {
  try {
    const posts = await loadPosts();
    const includeDrafts = req.query.include_drafts === 'true';
    const isAdmin = isUserAdmin(req);
    const currentUser = req.session?.user || req.user;
    const isBuyer = String(currentUser?.role || 'USER').toUpperCase() === 'TEMPLATE_BUYER';
    const now = new Date();

    const filteredPosts = posts.filter(p => {
      // Basic filter: not deleted
      if (p.isDeleted) return false;

      // Buyers only see their own posts when in admin mode (include_drafts)
      if (includeDrafts && isBuyer && currentUser?.username) {
        return p.authorUsername === currentUser.username;
      }

      // Only include drafts if admin AND explicitly requested
      if (p.isDraft) return isAdmin && includeDrafts;

      // Expired posts disappear from public listings; admins keep access
      if (!isAdmin && isExpiredPost(p)) return false;

      // For regular readers: must be published (date <= now)
      // Admins always see all non-draft posts
      if (isAdmin) return true;
      return new Date(p.date) <= now;
    });

    // Optional tag archive filter: /api/posts?tag=javascript
    const tag = String(req.query.tag || '').trim().toLowerCase();
    const visiblePosts = tag
      ? filteredPosts.filter(p => (p.tags || []).some(t => String(t).toLowerCase() === tag))
      : filteredPosts;

    // Optional list-mode controls (backwards compatible: omitted => full list)
    const wantsSummary = ['1', 'true'].includes(String(req.query.summary || '').toLowerCase());
    const page = parseInt(req.query.page, 10);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const paginated = Number.isFinite(page) && page > 0;

    let items = visiblePosts;
    if (paginated) {
      // Stable ordering required for paging
      items = [...visiblePosts].sort((a, b) => new Date(b.date) - new Date(a.date));
      items = items.slice((page - 1) * limit, page * limit);
    }
    items = items.map(p => redactPremiumPost(p, req));
    if (wantsSummary) items = items.map(toSummary);

    const payload = paginated || wantsSummary || tag
      ? {
          posts: items,
          summary: wantsSummary,
          tag: req.query.tag || '',
          total: visiblePosts.length,
          page,
          limit,
          hasMore: paginated && page * limit < visiblePosts.length
        }
      : { posts: filteredPosts.map(p => redactPremiumPost(p, req)) };

    return sendJsonWithEtag(req, res, payload);
  } catch (error) {
    console.error('Error in GET /api/posts:', error);
    return res.status(500).json({ error: 'Failed to load posts' });
  }
});

// ── Full-text search ────────────────────────────────────────────────
// Simple weighted search over published posts: title > tags > subtitle >
// author > body. Good enough for a personal archive without a search index.
app.get('/api/search', async (req, res) => {
  try {
    setPrivateRevalidate(res);
    const query = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    if (!query) {
      return res.json({ success: true, query: '', results: [], total: 0, page, limit, hasMore: false });
    }

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    const posts = publishedPosts(await loadPosts());
    const scored = [];

    for (const post of posts) {
      const title = String(post.title || '').toLowerCase();
      const subtitle = String(post.subtitle || '').toLowerCase();
      const author = String(post.author || '').toLowerCase();
      const tags = (post.tags || []).map(t => String(t).toLowerCase());
      const body = stripHtml(redactPremiumPost(post, req).content).toLowerCase();

      let score = 0;
      let matchedTerms = 0;
      for (const term of terms) {
        let termScore = 0;
        if (title.includes(term)) termScore += 10;
        if (tags.some(tag => tag.includes(term))) termScore += 6;
        if (subtitle.includes(term)) termScore += 4;
        if (author.includes(term)) termScore += 3;
        if (body.includes(term)) termScore += 2;
        if (termScore > 0) {
          score += termScore;
          matchedTerms++;
        }
      }
      if (!matchedTerms) continue;
      if (matchedTerms === terms.length) score += 5;

      scored.push({ post, score });
    }

    scored.sort((a, b) => b.score - a.score || new Date(b.post.date) - new Date(a.post.date));
    const total = scored.length;
    const results = scored.slice((page - 1) * limit, page * limit)
      .map(entry => ({ ...toSummary(redactPremiumPost(entry.post, req)), score: entry.score }));

    return res.json({
      success: true,
      query,
      results,
      total,
      page,
      limit,
      hasMore: page * limit < total
    });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'search_failed' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { posts, byId } = await loadPostsEntry();
    const post = (byId && byId.get(String(id))) || posts.find(p => p.id.toString() === id.toString());

    if (!post || post.isDeleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const isAdmin = isUserAdmin(req);
    const now = new Date();
    const previewToken = String(req.query.preview || '').trim();
    const hasValidPreview = previewToken && post.previewToken && previewToken === post.previewToken;

    // Restricted access for non-admins: hide drafts, future and expired posts
    if (!isAdmin && !hasValidPreview && (post.isDraft || new Date(post.date) > now || isExpiredPost(post))) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Record view for analytics
    if (!isAdmin && !hasValidPreview) await recordPageView(`/post/${encodeURIComponent(id)}`, req);

    // Prev/next (chronological) + related posts (shared tags / same category),
    // returned as summaries so clients don't need a full-list fetch.
    const chronology = publishedPosts(posts).sort((a, b) => new Date(a.date) - new Date(b.date));
    const pos = chronology.findIndex(p => String(p.id) === String(post.id));
    const prev = pos > 0 ? toSummary(redactPremiumPost(chronology[pos - 1], req)) : null;
    const next = pos > -1 && pos < chronology.length - 1 ? toSummary(redactPremiumPost(chronology[pos + 1], req)) : null;

    const postTags = new Set((post.tags || []).map(t => String(t).toLowerCase()));
    const related = chronology
      .filter(p => String(p.id) !== String(post.id))
      .map(p => {
        const sharedTags = (p.tags || []).filter(t => postTags.has(String(t).toLowerCase())).length;
        const sameCategory = p.categoryId && post.categoryId && p.categoryId === post.categoryId ? 1 : 0;
        return { post: p, score: sharedTags * 2 + sameCategory };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.post.date) - new Date(a.post.date))
      .slice(0, 3)
      .map(entry => toSummary(redactPremiumPost(entry.post, req)));

    // Member-only posts send a teaser instead of the full body.
    let payload = post;
    let locked = false;
    if (post.isPremium && !hasValidPreview && !isPremiumReader(req)) {
      locked = true;
      payload = { ...post, content: teaserContent(post.content) };
    }
    if (!isAdmin) {
      const { previewToken, ...safe } = payload;
      payload = safe;
    }

    return sendJsonWithEtag(req, res, { post: payload, prev, next, related, locked, preview: !!hasValidPreview });
  } catch (error) {
    console.error('Error in GET /api/posts/:id:', error);
    return res.status(500).json({ error: 'Failed to load post' });
  }
});

app.post('/api/posts', requireAdminOrBuyerAuth, async (req, res) => {
  const body = req.body;
  if (!body || !body.title || !body.content) return res.status(400).json({ error: 'missing title or content' });

  // Store image URLs as host-relative paths so they work from any domain
  normalizeImageFields(body);
  body.content = sanitizeRichHtml(body.content);

  const currentUser = req.session?.user || req.user;
  const isBuyer = String(currentUser?.role || 'USER').toUpperCase() === 'TEMPLATE_BUYER';
  const scopeTenantId = tenancy.scope.currentTenantId();

  const requestedDate = body.date ? new Date(body.date) : null;
  const publishDate = requestedDate && Number.isFinite(requestedDate.getTime())
    ? requestedDate.toISOString()
    : new Date().toISOString();
  const expiryDate = body.expiryDate && Number.isFinite(new Date(body.expiryDate).getTime())
    ? new Date(body.expiryDate).toISOString()
    : '';

  const post = {
    tenantId: scopeTenantId,
    title: body.title,
    subtitle: body.subtitle || '',
    author: body.author || currentUser?.name || 'Admin',
    content: body.content,
    date: publishDate,
    tags: Array.isArray(body.tags) ? body.tags : [],
    image: body.image || '',
    images: Array.isArray(body.images) ? body.images : [],
    featured: isBuyer ? false : !!body.featured,
    isDraft: !!body.isDraft,
    categoryId: body.categoryId || null,
    fontFamily: body.fontFamily || '',
    pullQuote: body.pullQuote || '',
    sceneCard: body.sceneCard || '',
    closingBox: body.closingBox || '',
    seoDescription: String(body.seoDescription || '').slice(0, 300),
    seoImage: body.seoImage || '',
    expiryDate,
    isPremium: isBuyer ? false : !!body.isPremium,
    likes: 0,
    dislikes: 0,
    authorUsername: currentUser?.username || null
  };

  try {
    if (db) {
      // If featured, reset others
      if (post.featured) {
        await db.collection('posts').updateMany(tenantMongoFilter(scopeTenantId), { $set: { featured: false } });
      }
      const result = await db.collection('posts').insertOne(post);
      post.id = result.insertedId.toString();
    } else {
      // Fallback for local/KV
      const posts = await loadPosts();
      // UUIDs keep ids unique across tenants; Date.now() can collide when two
      // tenants publish in the same millisecond.
      post.id = tenancy.store.newId();
      if (post.featured) posts.forEach(p => p.featured = false);
      posts.unshift(post);
      await savePosts(posts);
    }

    // Send notification and auto-share if it's NOT a draft
    if (!post.isDraft && new Date(post.date) <= new Date()) {
      await sendNewPostNotification(post).catch(err => console.error('Notification error:', err));

      // Auto-share to social media
      try {
        const settings = await readSettings();
        const creds = settings.socialCredentials || {};
        if (Object.values(creds).some(c => c && c.enabled)) {
          const SocialPoster = require('./utils/socialPoster');
          const poster = new SocialPoster(creds);
          const postUrl = `${req.protocol}://${req.get('host')}/post.html?id=${post.id}`;
          poster.postToAll(post, postUrl).then(results => {
            console.log('Social auto-post results:', JSON.stringify(results));
          }).catch(err => console.error('Social auto-post error:', err));
        }
      } catch (err) {
        console.error('Social auto-post setup error:', err);
      }
    }

    return res.json({ success: true, post });
  } catch (error) {
    console.error('Error creating post:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// PUT /api/posts/:id - update (admin or buyer for own posts)
app.put('/api/posts/:id', requireAdminOrBuyerAuth, async (req, res) => {
  const id = req.params.id;
  const body = req.body;
  const currentUser = req.session?.user || req.user;
  const isBuyer = String(currentUser?.role || 'USER').toUpperCase() === 'TEMPLATE_BUYER';

  // Store image URLs as host-relative paths so they work from any domain
  normalizeImageFields(body);
  if (body.content !== undefined) body.content = sanitizeRichHtml(body.content);

  try {
    if (db) {
      const scopeTenantId = tenancy.scope.currentTenantId();
      const filter = { $and: [postIdFilter(id), tenantMongoFilter(scopeTenantId)] };
      const existing = await db.collection('posts').findOne(filter);
      if (!existing) return res.status(404).json({ error: 'not found' });

      // Buyers can only edit their own posts
      if (isBuyer && existing.authorUsername !== currentUser.username) {
        return res.status(403).json({ error: 'cannot_edit_other_posts' });
      }

      const updatedFields = {};
      if (body.title !== undefined) updatedFields.title = body.title;
      if (body.subtitle !== undefined) updatedFields.subtitle = body.subtitle;
      if (body.author !== undefined) updatedFields.author = body.author;
      if (body.content !== undefined) updatedFields.content = body.content;
      if (body.tags !== undefined) updatedFields.tags = Array.isArray(body.tags) ? body.tags : [];
      if (body.image !== undefined) updatedFields.image = body.image;
      if (body.images !== undefined) updatedFields.images = body.images;
      if (body.featured !== undefined) {
        updatedFields.featured = !!body.featured;
        if (updatedFields.featured) {
          await db.collection('posts').updateMany(
            { $and: [{ _id: { $ne: existing._id } }, tenantMongoFilter(tenancy.scope.currentTenantId())] },
            { $set: { featured: false } }
          );
        }
      }
      if (body.isDraft !== undefined) updatedFields.isDraft = !!body.isDraft;
      if ('categoryId' in body) updatedFields.categoryId = body.categoryId;
      if (body.fontFamily !== undefined) updatedFields.fontFamily = body.fontFamily;
      if (body.pullQuote !== undefined) updatedFields.pullQuote = body.pullQuote;
      if (body.sceneCard !== undefined) updatedFields.sceneCard = body.sceneCard;
      if (body.closingBox !== undefined) updatedFields.closingBox = body.closingBox;
      if (body.seoDescription !== undefined) updatedFields.seoDescription = String(body.seoDescription || '').slice(0, 300);
      if (body.seoImage !== undefined) updatedFields.seoImage = body.seoImage || '';
      if (body.expiryDate !== undefined) {
        const expiry = body.expiryDate ? new Date(body.expiryDate) : null;
        updatedFields.expiryDate = expiry && Number.isFinite(expiry.getTime()) ? expiry.toISOString() : '';
      }
      if (body.isPremium !== undefined) updatedFields.isPremium = isBuyer ? false : !!body.isPremium;
      if (body.date !== undefined) {
        const publish = body.date ? new Date(body.date) : null;
        if (publish && Number.isFinite(publish.getTime())) updatedFields.date = publish.toISOString();
      }
      
      updatedFields.updatedAt = new Date().toISOString();

      await db.collection('posts').updateOne(filter, { $set: updatedFields });
      return res.json({
        success: true,
        post: normalizePost({ ...existing, ...updatedFields })
      });
    } else {
      const posts = await loadPosts();
      const idx = posts.findIndex(p => p.id.toString() === id.toString());
      if (idx === -1) return res.status(404).json({ error: 'not found' });

      // Buyers can only edit their own posts
      if (isBuyer && posts[idx].authorUsername !== currentUser.username) {
        return res.status(403).json({ error: 'cannot_edit_other_posts' });
      }

      const updated = {
        ...posts[idx],
        title: body.title || posts[idx].title,
        subtitle: body.subtitle !== undefined ? body.subtitle : posts[idx].subtitle,
        author: body.author || posts[idx].author,
        content: body.content || posts[idx].content,
        tags: Array.isArray(body.tags) ? body.tags : posts[idx].tags,
        image: body.image || posts[idx].image,
        images: Array.isArray(body.images) ? body.images : (posts[idx].images || []),
        featured: 'featured' in body ? !!body.featured : posts[idx].featured,
        isDraft: 'isDraft' in body ? !!body.isDraft : posts[idx].isDraft,
        fontFamily: body.fontFamily !== undefined ? body.fontFamily : (posts[idx].fontFamily || ''),
        pullQuote: body.pullQuote !== undefined ? body.pullQuote : posts[idx].pullQuote,
        sceneCard: body.sceneCard !== undefined ? body.sceneCard : posts[idx].sceneCard,
        closingBox: body.closingBox !== undefined ? body.closingBox : posts[idx].closingBox,
        seoDescription: body.seoDescription !== undefined ? String(body.seoDescription || '').slice(0, 300) : (posts[idx].seoDescription || ''),
        seoImage: body.seoImage !== undefined ? (body.seoImage || '') : (posts[idx].seoImage || ''),
        expiryDate: body.expiryDate !== undefined
          ? (body.expiryDate && Number.isFinite(new Date(body.expiryDate).getTime()) ? new Date(body.expiryDate).toISOString() : '')
          : (posts[idx].expiryDate || ''),
        isPremium: body.isPremium !== undefined ? (isBuyer ? false : !!body.isPremium) : !!posts[idx].isPremium,
        date: body.date && Number.isFinite(new Date(body.date).getTime())
          ? new Date(body.date).toISOString()
          : posts[idx].date,
        updatedAt: new Date().toISOString()
      };

      if ('categoryId' in body) {
        updated.categoryId = body.categoryId == null ? null : body.categoryId;
      }

      if (updated.featured) {
        posts.forEach(p => p.featured = false);
      }

      posts[idx] = updated;
      await savePosts(posts);
      return res.json({ success: true, post: updated });
    }
  } catch (error) {
    console.error('Error updating post:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/posts/:id/preview-token - issue a shareable draft preview link
app.post('/api/posts/:id/preview-token', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const token = crypto.randomBytes(18).toString('hex');

    if (db) {
      const scopeTenantId = tenancy.scope.currentTenantId();
      const result = await db.collection('posts').updateOne(
        { $and: [postIdFilter(id), tenantMongoFilter(scopeTenantId)] },
        { $set: { previewToken: token, updatedAt: new Date().toISOString() } }
      );
      if (!result.matchedCount) return res.status(404).json({ error: 'not found' });
    } else {
      const posts = await loadPosts();
      const idx = posts.findIndex(p => String(p.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      posts[idx].previewToken = token;
      await savePosts(posts);
    }

    const base = publicBaseUrl(req);
    return res.json({
      success: true,
      token,
      url: `${base}/post.html?id=${encodeURIComponent(id)}&preview=${token}`
    });
  } catch (error) {
    console.error('Preview token error:', error);
    return res.status(500).json({ error: 'preview_token_failed' });
  }
});

app.delete('/api/posts/:id', requireAdminOrBuyerAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const currentUser = req.session?.user || req.user;
    const isBuyer = String(currentUser?.role || 'USER').toUpperCase() === 'TEMPLATE_BUYER';

    if (db) {
      const scopeTenantId = tenancy.scope.currentTenantId();
      const filter = { $and: [postIdFilter(id), tenantMongoFilter(scopeTenantId)] };
      const existing = await db.collection('posts').findOne(filter);
      if (!existing) return res.status(404).json({ error: 'not found' });
      if (isBuyer && existing.authorUsername !== currentUser.username) {
        return res.status(403).json({ error: 'cannot_delete_other_posts' });
      }
      await db.collection('posts').updateOne(filter, { 
        $set: { isDeleted: true, deletedAt: new Date().toISOString() } 
      });
    } else {
      let posts = await loadPosts();
      const idx = posts.findIndex(p => p.id.toString() === id || p.id === parseInt(id, 10));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      if (isBuyer && posts[idx].authorUsername !== currentUser.username) {
        return res.status(403).json({ error: 'cannot_delete_other_posts' });
      }
      
      posts[idx].isDeleted = true;
      posts[idx].deletedAt = new Date().toISOString();
      await savePosts(posts);
    }
    return res.json({ success: true, message: 'Post moved to trash' });
  } catch (e) {
    console.error('Delete post error:', e);
    return res.status(500).json({ error: 'delete_failed', details: e.message });
  }
});

// GET /api/posts/deleted - List soft-deleted posts (admin only)
app.get('/api/admin/posts/deleted', requireAdmin, async (req, res) => {
  try {
    const posts = await loadPosts();
    const deletedPosts = posts.filter(p => p.isDeleted);
    return res.json({ success: true, posts: deletedPosts });
  } catch (e) {
    return res.status(500).json({ error: 'failed_to_load_deleted_posts' });
  }
});

// POST /api/posts/:id/restore - Restore a soft-deleted post (admin only)
app.post('/api/posts/:id/restore', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    let posts = await loadPosts();
    const idx = posts.findIndex(p => p.id.toString() === id || p.id === parseInt(id, 10));
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    
    posts[idx].isDeleted = false;
    delete posts[idx].deletedAt;
    
    await savePosts(posts);
    return res.json({ success: true, message: 'Post restored' });
  } catch (e) {
    return res.status(500).json({ error: 'restore_failed' });
  }
});

// DELETE /api/posts/:id/perma - Permanently delete a post (admin only)
app.delete('/api/posts/:id/perma', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    let posts = await loadPosts();
    const idx = posts.findIndex(p => p.id.toString() === id || p.id === parseInt(id, 10));
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    
    posts.splice(idx, 1);
    await savePosts(posts);
    return res.json({ success: true, message: 'Post permanently deleted' });
  } catch (e) {
    return res.status(500).json({ error: 'permanent_delete_failed' });
  }
});

// Build a Mongo filter for a post id. Post ids have been stored over time as
// ObjectIds, hex strings, numeric timestamps, or string timestamps, so match
// `_id`/`id` against every sensible representation to stay compatible.
function postIdFilter(id) {
  const s = String(id);
  const variants = [s];
  if (/^\d+$/.test(s)) variants.push(Number(s));
  if (s.length === 24 && /^[0-9a-fA-F]{24}$/.test(s)) variants.push(new ObjectId(s));
  const unique = [...new Set(variants)];
  return {
    $or: [
      { _id: { $in: unique } },
      { id: { $in: unique } }
    ]
  };
}

// Atomically adjust a numeric counter (likes/dislikes) on a post.
// Uses a targeted Mongo $inc update when available; otherwise falls back to
// load-all + save (non-Mongo storage), invalidating the posts cache.
// Returns the updated counter value, or null if the post was not found.
async function adjustPostCounter(id, field, delta, action, type, req) {
  if (isSupabaseEnabled()) {
    const value = await supabaseStore.adjustPostCounter(id, field, delta);
    if (value === null) return null;
    postsScopeCache.clear(tenancy.scope.currentTenantId());
    if (action === 'add') await recordInteraction(type, id, null, req);
    return value;
  }

  const mongoDb = await getMongoDB();
  if (mongoDb) {
    const result = await mongoDb.collection('posts').findOneAndUpdate(
      postIdFilter(id),
      { $inc: { [field]: delta } },
      { returnDocument: 'after' }
    );
    if (!result || !result.value) return null;
    if (action === 'add') await recordInteraction(type, id, null, req);
    postsCache = null; // reflect the counter change on the next read
    postsCacheTime = 0;
    return typeof result.value[field] === 'number' ? result.value[field] : 0;
  }

  return postWriteQueue(async () => {
    const posts = await loadPosts();
    const idx = posts.findIndex(p => p.id.toString() === id.toString());
    if (idx === -1) return null;
    if (typeof posts[idx][field] !== 'number') posts[idx][field] = 0;
    if (action === 'remove') {
      posts[idx][field] = Math.max(0, posts[idx][field] - 1);
    } else {
      posts[idx][field] += 1;
      await recordInteraction(type, id, null, req);
    }
    await savePosts(posts);
    return posts[idx][field];
  });
}

// Like a post
app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const id = req.params.id;
    const action = req.body && req.body.action === 'remove' ? 'remove' : 'add';
    const delta = action === 'remove' ? -1 : 1;
    const likes = await adjustPostCounter(id, 'likes', delta, action, 'like', req);
    if (likes === null) return res.status(404).json({ error: 'not found' });
    return res.json({ success: true, likes });
  } catch (error) {
    console.error('Error liking post:', error);
    return res.status(500).json({ error: 'like_failed' });
  }
});

// Dislike a post
app.post('/api/posts/:id/dislike', async (req, res) => {
  try {
    const id = req.params.id;
    const action = req.body && req.body.action === 'remove' ? 'remove' : 'add';
    const delta = action === 'remove' ? -1 : 1;
    const dislikes = await adjustPostCounter(id, 'dislikes', delta, action, 'dislike', req);
    if (dislikes === null) return res.status(404).json({ error: 'not found' });
    return res.json({ success: true, dislikes });
  } catch (error) {
    console.error('Error disliking post:', error);
    return res.status(500).json({ error: 'dislike_failed' });
  }
});

// Comments API - Consolidated endpoints
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id;
    const includeDeleted = req.query.includeDeleted === 'true';
    const isAdmin = isUserAdmin(req);
    let postComments = await loadCommentsForPost(postId);
    if (!includeDeleted) {
      postComments = postComments.filter(c => !c.deleted);
    }
    if (!isAdmin) {
      postComments = postComments.filter(c => c.approved !== false);
    }
    return res.json({ success: true, comments: postComments });
  } catch (e) {
    console.error('Error loading comments:', e);
    return res.status(500).json({ error: 'failed_to_load_comments' });
  }
});

app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id;
    const { name, email, content, parentId, subscribe } = req.body || {};
    if (!name || !content) {
      return res.status(400).json({ error: 'name_and_content_required' });
    }

    let imageUrl = null;
    if (req.files && req.files.image) {
      const file = req.files.image;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.mimetype)) {
         return res.status(400).json({ error: 'invalid_image_type' });
      }
      if (file.size > 5 * 1024 * 1024) {
         return res.status(400).json({ error: 'image_too_large' });
      }
      const uploadRes = await uploadFileToStorage(file, 'comments');
      imageUrl = uploadRes.url;
    }

    const newComment = {
      id: tenancy.store.newId(),
      tenantId: tenancy.scope.currentTenantId(),
      postId: postId,
      name: name.trim(),
      email: email ? email.trim() : '',
      content: content.trim(),
      image: imageUrl,
      parentId: parentId ? String(parentId) : null,
      pinned: false,
      date: new Date().toISOString(),
      approved: true,
      likes: 0,
      dislikes: 0
    };
    if (isSupabaseEnabled()) {
      // Insert only the new row; a load-all + replace would drop comments
      // created by concurrent requests.
      await supabaseStore.insertComment(newComment);
      invalidatePostComments();
    } else {
      const allComments = await loadComments();
      allComments.push(newComment);
      await saveComments(allComments);
    }

    await recordInteraction('comment', postId, null, req);

    if (subscribe && email) {
      try {
        const subscriptions = await loadSubscriptions();
        const normalizedEmail = email.trim();
        const exists = subscriptions.some(s => s.email === normalizedEmail && String(s.postId) === String(postId));
        if (!exists) {
          subscriptions.push({
            id: tenancy.store.newId(),
            tenantId: tenancy.scope.currentTenantId(),
            postId: String(postId),
            email: normalizedEmail,
            name: name.trim(),
            subscribedAt: new Date().toISOString()
          });
          await saveSubscriptions(subscriptions);
        }
      } catch (subError) {
        console.error('Comment subscribe error:', subError.message);
      }
    }

    return res.json({ success: true, comment: { ...newComment, email: undefined } });
  } catch (e) {
    console.error('Error posting comment:', e);
    return res.status(500).json({ error: 'failed_to_post_comment' });
  }
});

// Soft delete comment (admin only)
app.delete('/api/posts/:id/comments/:commentId', requireAdmin, async (req, res) => {
  try {
    const postId = req.params.id;
    const commentId = req.params.commentId;
    const allComments = await loadComments();
    const idx = allComments.findIndex(c => c.id.toString() === commentId && c.postId.toString() === postId);
    if (idx === -1) {
      return res.status(404).json({ error: 'comment_not_found' });
    }
    allComments[idx].deleted = true;
    allComments[idx].deletedAt = new Date().toISOString();
    await saveComments(allComments);
    return res.json({ success: true });
  } catch (e) {
    console.error('Error deleting comment:', e);
    return res.status(500).json({ error: 'failed_to_delete_comment' });
  }
});

// Get all comments for admin (includes deleted) - with limit for performance
app.get('/api/admin/comments', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const allComments = await loadComments();
    const sorted = allComments.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
    return res.json({ success: true, comments: sorted, total: allComments.length });
  } catch (e) {
    console.error('Error loading all comments:', e);
    return res.status(500).json({ error: 'failed_to_load_comments' });
  }
});

// Restore soft-deleted comment (admin only)
app.post('/api/posts/:id/comments/:commentId/restore', requireAdmin, async (req, res) => {
  try {
    const postId = req.params.id;
    const commentId = req.params.commentId;
    const allComments = await loadComments();
    const idx = allComments.findIndex(c => c.id.toString() === commentId && c.postId.toString() === postId);
    if (idx === -1) {
      return res.status(404).json({ error: 'comment_not_found' });
    }
    allComments[idx].deleted = false;
    allComments[idx].deletedAt = null;
    await saveComments(allComments);
    return res.json({ success: true });
  } catch (e) {
    console.error('Error restoring comment:', e);
    return res.status(500).json({ error: 'failed_to_restore_comment' });
  }
});

// Like/dislike comment
app.post('/api/posts/:id/comments/:commentId/:type', async (req, res, next) => {
  try {
    const postId = req.params.id;
    const commentId = req.params.commentId;
    const type = req.params.type; // 'like' or 'dislike'
    // Let more specific comment actions (e.g. /pin) fall through.
    if (type !== 'like' && type !== 'dislike') return next();
    const { action } = req.body || {}; // 'add' or 'remove'
    
    const allComments = await loadComments();
    const idx = allComments.findIndex(c => c.id.toString() === commentId && c.postId.toString() === postId);
    if (idx === -1) {
      return res.status(404).json({ error: 'comment_not_found' });
    }
    
    const comment = allComments[idx];
    comment.likes = comment.likes || 0;
    comment.dislikes = comment.dislikes || 0;
    const prevType = comment.userReaction || null;
    
    if (action === 'add') {
      // Adding a reaction
      if (prevType) {
        // Remove previous reaction
        if (prevType === 'like') comment.likes = Math.max(0, comment.likes - 1);
        else comment.dislikes = Math.max(0, comment.dislikes - 1);
      }
      // Add new reaction
      if (type === 'like') comment.likes++;
      else comment.dislikes++;
      comment.userReaction = type;
    } else {
      // Removing a reaction
      if (type === 'like') comment.likes = Math.max(0, comment.likes - 1);
      else comment.dislikes = Math.max(0, comment.dislikes - 1);
      comment.userReaction = null;
    }
    
    await saveComments(allComments);
    return res.json({ success: true, likes: comment.likes, dislikes: comment.dislikes });
  } catch (e) {
    console.error('Error toggling comment like:', e);
    return res.status(500).json({ error: 'failed_to_toggle_like' });
  }
});

// Pin / unpin a comment (admin only)
app.post('/api/posts/:id/comments/:commentId/pin', requireAdmin, async (req, res) => {
  try {
    const postId = req.params.id;
    const commentId = req.params.commentId;
    const allComments = await loadComments();
    const idx = allComments.findIndex(c => c.id.toString() === commentId && c.postId.toString() === postId);
    if (idx === -1) {
      return res.status(404).json({ error: 'comment_not_found' });
    }

    const requested = req.body && Object.prototype.hasOwnProperty.call(req.body, 'pinned')
      ? !!req.body.pinned
      : !allComments[idx].pinned;
    allComments[idx].pinned = requested;
    await saveComments(allComments);
    return res.json({ success: true, pinned: requested });
  } catch (e) {
    console.error('Error pinning comment:', e);
    return res.status(500).json({ error: 'failed_to_pin_comment' });
  }
});

// Upload API with Cloudinary
app.post('/api/upload', requireAdminOrBuyerAuth, async (req, res) => {
  try {
    if (!req.files || (!req.files.image && !req.files.video)) return res.status(400).json({ error: 'no file uploaded' });
    const file = req.files.image || req.files.video;
    const isVideo = !!req.files.video;
    const MAX_BYTES = 100 * 1024 * 1024; // 100MB
    const allowedImages = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const allowedVideos = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    const allowed = [...allowedImages, ...allowedVideos];

    if (!allowed.includes(file.mimetype)) {
      return res.status(400).json({ error: 'invalid_file_type', allowed });
    }
    if (file.size > MAX_BYTES) {
      return res.status(400).json({ error: 'file_too_large', maxBytes: MAX_BYTES });
    }

    const scopeId = tenancy.scope.currentTenantId();
    const folder = scopeId === tenancy.PLATFORM_TENANT_ID ? 'blog' : `blog/${scopeId}`;
    const uploadRes = await uploadFileToStorage(file, folder, scopeId);
    
    // Return host-relative URLs (e.g. /uploads/x.jpg) so stored image URLs
    // keep working no matter which domain the site is served from.
    const url = uploadRes.url;

    return res.json({ 
      success: true, 
      url: url, 
      filename: uploadRes.filename, 
      size: file.size, 
      isVideo 
    });
  } catch (err) {
    console.error('upload error:', err);
    return res.status(500).json({ error: 'upload_failed', details: err.message });
  }
});

// List uploaded files (scoped to the current tenant)
app.get('/api/uploads', async (req, res) => {
  try {
    const scopeId = tenancy.scope.currentTenantId();
    const platformScope = scopeId === tenancy.PLATFORM_TENANT_ID;
    if (isSupabaseEnabled()) {
      const objects = await listSupabaseStorage(platformScope ? 'blog' : `blog/${scopeId}`);
      const images = objects.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));
      return res.json({ files: images.map(f => f.url) });
    }
    const tenantPrefix = platformScope ? '' : `tenant-${String(scopeId).replace(/[^a-z0-9-]/gi, '')}__`;
    const files = (await fs.promises.readdir(UPLOADS_DIR))
      .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
      .filter(f => platformScope ? !/^tenant-[a-z0-9-]+__/i.test(f) : f.startsWith(tenantPrefix));
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({ files: files.map(f => `${baseUrl}/uploads/${f}`) });
  } catch (err) {
    console.error('List uploads error:', err.message);
    res.json({ files: [] });
  }
});

// Delete uploaded file
app.delete('/api/uploads', requireAdmin, async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

    if (isSupabaseEnabled()) {
      const removed = await deleteFromSupabaseStorage(url);
      return res.json({ success: true, filename: removed });
    }

    const urlObj = new URL(url);
    const filename = path.basename(urlObj.pathname);
    const filePath = path.join(UPLOADS_DIR, filename);
    
    try {
      await fs.promises.unlink(filePath);
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found' });
      throw error;
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Monthly Themes API (Admin only)
app.get('/api/admin/themes', requireAdmin, async (req, res) => {
  try {
    const themes = await loadThemes();
    res.json({ success: true, themes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/themes', requireAdmin, async (req, res) => {
  try {
    const { month, year, title, description } = req.body || {};
    if (!month || !year || !title) return res.status(400).json({ success: false, error: 'Month, year, and title are required' });
    
    const newTheme = { 
      month, 
      year: parseInt(year), 
      title, 
      description: (description || '').trim(),
      tenantId: tenancy.scope.currentTenantId(),
      createdAt: new Date().toISOString()
    };
    
    if (db) {
      const result = await db.collection('themes').insertOne(newTheme);
      newTheme.id = result.insertedId.toString();
    } else {
      const themes = await loadThemes();
      newTheme.id = Date.now().toString();
      themes.push(newTheme);
      await saveThemes(themes);
    }
    res.json({ success: true, theme: newTheme });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/themes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year, title, description } = req.body || {};
    
    const updatedFields = {};
    if (month) updatedFields.month = month;
    if (year) updatedFields.year = parseInt(year);
    if (title) updatedFields.title = title;
    if (description !== undefined) updatedFields.description = description.trim();
    updatedFields.updatedAt = new Date().toISOString();
    
    if (db) {
      const scopeTenantId = tenancy.scope.currentTenantId();
      const filter = { $and: [{ _id: (id.length === 24 ? new ObjectId(id) : id) }, tenantMongoFilter(scopeTenantId)] };
      const result = await db.collection('themes').updateOne(filter, { $set: updatedFields });
      if (result.matchedCount === 0) return res.status(404).json({ success: false, error: 'Theme not found' });
    } else {
      const themes = await loadThemes();
      const idx = themes.findIndex(t => t.id.toString() === id.toString());
      if (idx === -1) return res.status(404).json({ success: false, error: 'Theme not found' });
      themes[idx] = { ...themes[idx], ...updatedFields };
      await saveThemes(themes);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/themes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      const scopeTenantId = tenancy.scope.currentTenantId();
      const filter = { $and: [{ _id: (id.length === 24 ? new ObjectId(id) : id) }, tenantMongoFilter(scopeTenantId)] };
      const result = await db.collection('themes').deleteOne(filter);
      if (result.deletedCount === 0) return res.status(404).json({ success: false, error: 'Theme not found' });
    } else {
      let themes = await loadThemes();
      themes = themes.filter(t => t.id.toString() !== id.toString());
      await saveThemes(themes);
    }
    res.json({ success: true, message: 'Theme deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const settingsPath = path.join(DATA_DIR, 'settings.json');
const aboutPath = path.join(DATA_DIR, 'about.json');

const DEFAULT_SETTINGS = {
  backgroundUrl: '',
  backgrounds: [],
  author: {
    name: '',
    email: '',
    bio: '',
    phone: '',
    whatsapp: '',
    profilePicture: '',
    social: { email: '', twitter: '', facebook: '', linkedin: '', instagram: '', github: '', website: '' }
  },
  security: {
    adminEntryKeyHash: '',
    adminEntryKeyEnc: ''
  },
  payment: {
    mpesaEnvironment: 'sandbox',
    mpesaConsumerKey: '',
    mpesaConsumerSecret: '',
    mpesaShortcode: '',
    mpesaPasskey: '',
    templatePrice: 1000
  },
  socialCredentials: {
    twitter: { enabled: false, appKey: '', appSecret: '', accessToken: '', accessSecret: '' },
    linkedin: { enabled: false, accessToken: '', personUrn: '' },
    facebook: { enabled: false, accessToken: '', pageId: '' },
    mastodon: { enabled: false, url: '', accessToken: '' },
  }
};

// Settings are read on most requests, so keep a very short-lived cache to
// avoid a Supabase round-trip per call. Writes invalidate it immediately.
const SETTINGS_CACHE_TTL_MS = 5000;
let settingsCache = null;
let settingsCacheAt = 0;

// Legacy Mongo stored settings as one document per feature. Merge them (and the
// newer single `type: 'app'` document) into the settings object the app uses.
async function readSettingsFromMongo() {
  const mongoDb = await getMongoDB();
  if (!mongoDb) return null;
  try {
    const docs = await mongoDb.collection('settings').find({}).toArray();
    if (!docs.length) return null;

    const byType = new Map();
    for (const doc of docs) {
      if (doc && doc.type) byType.set(doc.type, doc);
    }

    const merged = {};
    let found = false;
    const appDoc = byType.get('app');
    if (appDoc && appDoc.data && typeof appDoc.data === 'object') {
      Object.assign(merged, appDoc.data);
      found = true;
    }

    const background = byType.get('background');
    if (background) {
      for (const field of ['backgroundUrl', 'backgrounds']) {
        if (background[field] !== undefined) { merged[field] = background[field]; found = true; }
      }
    }
    const security = byType.get('security');
    if (security) {
      for (const field of ['adminEntryKeyHash', 'adminEntryKeyEnc']) {
        if (security[field] !== undefined) { merged[field] = security[field]; found = true; }
      }
    }
    const blogInfo = byType.get('blog-info') || byType.get('blogInfo');
    if (blogInfo && blogInfo.blogInfo !== undefined) {
      merged.blogInfo = blogInfo.blogInfo;
      found = true;
    }
    for (const type of ['theme', 'author', 'socialCredentials', 'notifications', 'content', 'payment']) {
      const doc = byType.get(type);
      if (doc && doc[type] !== undefined) { merged[type] = doc[type]; found = true; }
    }

    return found ? merged : null;
  } catch (e) {
    console.warn('MongoDB settings read error:', e.message);
    return null;
  }
}

// Helper function to read settings (Supabase, then Mongo, then local file)
async function readSettings() {
  const activeTenantId = tenancy.currentTenantId();
  if (activeTenantId !== tenancy.PLATFORM_TENANT_ID) {
    const stored = await tenancy.store.loadTenantSettings(activeTenantId);
    return { ...DEFAULT_SETTINGS, ...(stored || {}) };
  }
  if (settingsCache && Date.now() - settingsCacheAt < SETTINGS_CACHE_TTL_MS) {
    return JSON.parse(JSON.stringify(settingsCache));
  }

  let stored = null;
  if (isSupabaseEnabled()) {
    try {
      stored = await supabaseStore.loadSettingsObject();
    } catch (error) {
      console.error('Supabase settings read failed:', error.message);
    }
  } else {
    stored = await readSettingsFromMongo();
  }

  if (!stored) {
    try {
      stored = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Error reading settings:', error);
    }
  }

  const result = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  settingsCache = result;
  settingsCacheAt = Date.now();
  return JSON.parse(JSON.stringify(result));
}

// Helper function to write settings (Supabase, then Mongo, then local file)
async function writeSettings(settings) {
  const activeTenantId = tenancy.currentTenantId();
  if (activeTenantId !== tenancy.PLATFORM_TENANT_ID) {
    await tenancy.store.saveTenantSettings(activeTenantId, settings);
    return;
  }
  if (isSupabaseEnabled()) {
    await supabaseStore.saveSettingsObject(settings);
    settingsCache = settings;
    settingsCacheAt = Date.now();
    return;
  }

  const mongoDb = await getMongoDB();
  if (mongoDb) {
    const updatedAt = new Date();
    const doc = (type, fields) => ({
      updateOne: {
        filter: { type },
        update: { $set: { type, ...fields, updatedAt } },
        upsert: true
      }
    });
    const ops = [
      doc('app', { data: settings }),
      doc('background', {
        backgroundUrl: settings.backgroundUrl || '',
        backgrounds: Array.isArray(settings.backgrounds) ? settings.backgrounds : []
      }),
      doc('blog-info', { blogInfo: settings.blogInfo }),
      doc('security', settings.security || {})
    ];
    for (const type of ['theme', 'author', 'socialCredentials', 'notifications', 'content', 'payment']) {
      if (settings[type] !== undefined) ops.push(doc(type, { [type]: settings[type] }));
    }

    await mongoDb.collection('settings').bulkWrite(ops);
    settingsCache = settings;
    settingsCacheAt = Date.now();
    return;
  }

  if (process.env.VERCEL) {
    throw new Error('No persistent settings storage on Vercel (configure Supabase or MongoDB).');
  }

  try {
    await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    settingsCache = settings;
    settingsCacheAt = Date.now();
  } catch (error) {
    console.error('Error writing settings:', error);
  }
}

// Helper function to read about info
const EXPECTED_SECTIONS = ['who-i-am', 'mission'];
const DEFAULT_SECTION_TITLES = { 'who-i-am': 'Who I Am', 'mission': 'My Mission' };
const DEFAULT_ABOUT_TITLES = {
  timeline: 'The Path Here',
  skills: 'What I Do',
  featured: 'Featured Posts',
  photos: 'Snapshots',
  currently: 'Currently',
  contact: 'Get In Touch'
};
const ABOUT_LIST_LIMITS = { skills: 20, timeline: 30, currently: 20, points: 20 };

let aboutSeedCache = null;
function readAboutSeed() {
  if (aboutSeedCache) return aboutSeedCache;
  try {
    aboutSeedCache = fs.existsSync(aboutPath)
      ? (JSON.parse(fs.readFileSync(aboutPath, 'utf8')) || {})
      : {};
  } catch (e) {
    aboutSeedCache = {};
  }
  return aboutSeedCache;
}

function cleanAboutText(value, maxLength = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanAboutList(items, maxItems, mapper) {
  if (!Array.isArray(items)) return null;
  return items.slice(0, maxItems).map(mapper).filter(Boolean);
}

function normalizeAbout(aboutData) {
  const data = { ...(aboutData || {}) };
  const seed = readAboutSeed();

  if (Array.isArray(data.photos)) {
    data.photos = data.photos.map(p => typeof p === 'string' ? normalizeAssetUrl(p) : p);
  } else {
    data.photos = [];
  }

  if (!Array.isArray(data.sections)) data.sections = [];
  data.sections = data.sections.filter(s => s && typeof s === 'object').map(s => ({
    ...s,
    id: String(s.id || ''),
    title: String(s.title || ''),
    content: String(s.content || ''),
    ...(Array.isArray(s.points) ? { points: s.points.map(p => String(p ?? '')).filter(Boolean) } : {})
  }));
  EXPECTED_SECTIONS.forEach(secId => {
    if (!data.sections.find(s => s.id === secId)) {
      data.sections.push({ id: secId, title: DEFAULT_SECTION_TITLES[secId], content: '' });
    }
  });

  if (!Array.isArray(data.skills)) data.skills = Array.isArray(seed.skills) ? seed.skills : [];
  data.skills = data.skills.filter(item => item && typeof item === 'object').map(item => ({
    title: String(item.title || ''),
    description: String(item.description || '')
  }));

  if (!Array.isArray(data.timeline)) data.timeline = Array.isArray(seed.timeline) ? seed.timeline : [];
  data.timeline = data.timeline.filter(item => item && typeof item === 'object').map(item => ({
    period: String(item.period || ''),
    title: String(item.title || ''),
    description: String(item.description || '')
  }));

  if (!Array.isArray(data.currently)) data.currently = Array.isArray(seed.currently) ? seed.currently : [];
  data.currently = data.currently.filter(item => item && typeof item === 'object').map(item => ({
    label: String(item.label || ''),
    text: String(item.text || '')
  }));

  const incomingTitles = data.titles && typeof data.titles === 'object' ? data.titles : {};
  data.titles = { ...DEFAULT_ABOUT_TITLES };
  Object.keys(DEFAULT_ABOUT_TITLES).forEach(key => {
    const value = String(incomingTitles[key] || '').trim();
    if (value) data.titles[key] = value;
  });

  return data;
}

async function loadAbout() {
  if (isSupabaseEnabled()) {
    try {
      const stored = await supabaseStore.loadAbout();
      if (stored && typeof stored === 'object') return normalizeAbout(stored);

      // No row yet: seed from the repo snapshot once, then serve it.
      if (fs.existsSync(aboutPath)) {
        const seeded = JSON.parse(fs.readFileSync(aboutPath, 'utf8'));
        if (seeded) {
          try { await supabaseStore.saveAbout(seeded); } catch (e) {
            console.warn('Could not seed about data into Supabase:', e.message);
          }
          return normalizeAbout(seeded);
        }
      }
      return normalizeAbout({});
    } catch (e) {
      console.error('Supabase about load failed:', e.message);
      return normalizeAbout({});
    }
  }

  let aboutData = null;
  try {
    const db = await getMongoDB();
    if (db) {
      try {
        const aboutDoc = await db.collection('about').findOne({ _id: 'about_data' });
        if (aboutDoc) {
          const data = { ...aboutDoc };
          delete data._id;
          aboutData = data;
        }
      } catch (mongoErr) {
        console.warn('MongoDB about query error:', mongoErr.message);
      }
    }

    if (!aboutData && process.env.VERCEL && kv) {
      try {
        const data = await kv.get('about');
        if (data) {
          aboutData = typeof data === 'string' ? JSON.parse(data) : data;
        }
      } catch (kvErr) {
        console.warn('Vercel KV about error:', kvErr.message);
      }
    }

    let readFromFile = false;
    if (!aboutData) {
      try {
        aboutData = JSON.parse(await fs.promises.readFile(aboutPath, 'utf8'));
        readFromFile = true;
      } catch (readErr) {
        if (readErr.code !== 'ENOENT') throw readErr;
      }
    }
    // Seed MongoDB/KV with about.json data on first load
    if (readFromFile && aboutData) {
      console.log('Seeding about data from about.json to persistent storage...');
      await saveAbout(aboutData);
    }
  } catch (error) {
    console.error('Error loading about info:', error);
  }

  return normalizeAbout(aboutData);
}

// Helper function to write about info
async function saveAbout(about) {
  if (isSupabaseEnabled()) return supabaseStore.saveAbout(about);
  try {
    const db = await getMongoDB();
    if (db) {
      try {
        await db.collection('about').updateOne(
          { _id: 'about_data' },
          { $set: about },
          { upsert: true }
        );
        return;
      } catch (mongoErr) {
        console.warn('MongoDB save about error:', mongoErr.message);
      }
    }

    if (process.env.VERCEL && kv) {
      try {
        await kv.set('about', JSON.stringify(about));
        return;
      } catch (kvErr) {
        console.warn('Vercel KV save about error:', kvErr.message);
      }
    }

    if (process.env.VERCEL) {
      console.warn('saveAbout: cannot write on Vercel without storage. Changes will NOT persist.');
      return;
    }

    await fs.promises.writeFile(aboutPath, JSON.stringify(about, null, 2));
  } catch (error) {
    console.error('Error saving about info:', error);
  }
}

// About API
app.get('/api/about', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const about = await loadAbout();
  return res.json(about);
});

app.post('/api/about', requireAdmin, async (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    // Load existing data so omitted fields keep their current values.
    const existing = await loadAbout();

    // Map contact safely
    const inContact = incoming.contact || {};
    const exContact = existing.contact || {};

    const incomingHero = incoming.hero && typeof incoming.hero === 'object' ? incoming.hero : {};
    const hero = {
      title: cleanAboutText(incomingHero.title, 200) || existing.hero?.title || '',
      subtitle: cleanAboutText(incomingHero.subtitle, 300) || existing.hero?.subtitle || ''
    };

    const titles = { ...(existing.titles || DEFAULT_ABOUT_TITLES) };
    if (incoming.titles && typeof incoming.titles === 'object') {
      Object.keys(DEFAULT_ABOUT_TITLES).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(incoming.titles, key)) {
          titles[key] = cleanAboutText(incoming.titles[key], 120) || DEFAULT_ABOUT_TITLES[key];
        }
      });
    }

    // Build the updated about object
    const updated = {
      hero,
      titles,
      sections: existing.sections,
      skills: Array.isArray(incoming.skills)
        ? (cleanAboutList(incoming.skills, ABOUT_LIST_LIMITS.skills, skill => {
            if (!skill || typeof skill !== 'object') return null;
            const title = cleanAboutText(skill.title, 120);
            const description = cleanAboutText(skill.description, 600);
            return title || description ? { title, description } : null;
          }) || [])
        : (existing.skills || []),
      timeline: Array.isArray(incoming.timeline)
        ? (cleanAboutList(incoming.timeline, ABOUT_LIST_LIMITS.timeline, entry => {
            if (!entry || typeof entry !== 'object') return null;
            const period = cleanAboutText(entry.period, 120);
            const title = cleanAboutText(entry.title, 160);
            const description = cleanAboutText(entry.description, 600);
            return period || title || description ? { period, title, description } : null;
          }) || [])
        : (existing.timeline || []),
      currently: Array.isArray(incoming.currently)
        ? (cleanAboutList(incoming.currently, ABOUT_LIST_LIMITS.currently, item => {
            if (!item || typeof item !== 'object') return null;
            const label = cleanAboutText(item.label, 80);
            const text = cleanAboutText(item.text, 600);
            return label || text ? { label, text } : null;
          }) || [])
        : (existing.currently || []),
      // Photos: use incoming if provided (array), otherwise preserve existing
      photos: Array.isArray(incoming.photos) ? incoming.photos
        : (Array.isArray(existing.photos) ? existing.photos : []),
      contact: {
        email: String(inContact.email ?? exContact.email ?? ''),
        twitter: String(inContact.twitter ?? exContact.twitter ?? ''),
        linkedin: String(inContact.linkedin ?? exContact.linkedin ?? ''),
        github: String(inContact.github ?? exContact.github ?? '')
      }
    };

    // Apply editable content to known sections; mission points are now editable too.
    if (incoming.sections && Array.isArray(incoming.sections)) {
      updated.sections = incoming.sections.slice(0, 10).filter(sec => sec && typeof sec === 'object').map(newSec => {
        const oldSec = (existing.sections || []).find(s => s && s.id === newSec.id);
        const id = String(newSec.id || oldSec?.id || '');
        const points = Array.isArray(newSec.points)
          ? (cleanAboutList(newSec.points, ABOUT_LIST_LIMITS.points, point => cleanAboutText(point, 500)) || [])
          : (Array.isArray(oldSec?.points) ? oldSec.points : []);
        return {
          id,
          title: cleanAboutText(newSec.title, 120) || oldSec?.title || DEFAULT_SECTION_TITLES[id] || '',
          content: cleanAboutText(newSec.content, 8000),
          ...(points.length ? { points } : {})
        };
      }).filter(sec => sec.id);
    }

    await saveAbout(updated);
    console.log('About saved successfully:', JSON.stringify(updated).substring(0, 200));
    return res.json({ success: true, updated });
  } catch (err) {
    console.error('Error saving about:', err);
    return res.status(500).json({ error: 'save_failed', details: err.message });
  }
});

// Get current background image
app.get('/api/settings/background', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    const settings = await readSettings();
    return res.json({ backgroundUrl: normalizeAssetUrl(settings.backgroundUrl || '') });
  } catch (e) {
    console.error('Error reading background settings:', e);
    return res.json({ backgroundUrl: '' });
  }
});

// Set background image
app.post('/api/settings/background', requireAdmin, async (req, res) => {
  try {
    const { backgroundUrl } = req.body || {};
    if (!backgroundUrl) return res.status(400).json({ error: 'missing backgroundUrl' });

    const settings = await readSettings();
    settings.backgroundUrl = backgroundUrl;
    // Always append new URL to history (avoid duplicates)
    if (!Array.isArray(settings.backgrounds)) settings.backgrounds = [];
    if (!settings.backgrounds.includes(backgroundUrl)) {
      settings.backgrounds.push(backgroundUrl);
    }
    await writeSettings(settings);

    return res.json({ success: true, backgroundUrl });
  } catch (e) {
    console.error('Error saving background settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Multiple backgrounds API
app.get('/api/settings/backgrounds', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    const settings = await readSettings();
    const list = Array.isArray(settings.backgrounds) ? settings.backgrounds : (settings.backgroundUrl ? [settings.backgroundUrl] : []);
    return res.json({ backgrounds: list.map(normalizeAssetUrl) });
  } catch (e) {
    console.error('Error reading backgrounds settings:', e);
    return res.json({ backgrounds: [] });
  }
});

app.post('/api/settings/backgrounds', requireAdmin, async (req, res) => {
  try {
    const { backgrounds } = req.body || {};
    if (!Array.isArray(backgrounds)) return res.status(400).json({ error: 'backgrounds_must_be_array' });
    const urls = backgrounds.map(u => String(u)).filter(u => u.length > 0);
    const backgroundUrl = urls[0] || '';

    const settings = await readSettings();
    settings.backgrounds = urls;
    // Keep legacy single backgroundUrl aligned to first
    settings.backgroundUrl = backgroundUrl;
    await writeSettings(settings);
    return res.json({ success: true, backgrounds: urls });
  } catch (e) {
    console.error('save backgrounds error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Theme settings API
app.get('/api/settings/theme', async (req, res) => {
  try {
    const settings = await readSettings();
    const theme = settings.theme || { primaryColor: '#F4A191', accentColor: '#4A9B9B' };
    return res.json({ theme });
  } catch (e) {
    console.error('Error reading theme settings:', e);
    const theme = { primaryColor: '#F4A191', accentColor: '#4A9B9B' };
    return res.json({ theme });
  }
});

app.post('/api/settings/theme', requireAdmin, async (req, res) => {
  try {
    const payload = req.body && req.body.theme ? req.body.theme : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

    const theme = {
      primaryColor: String(payload.primaryColor || '#F4A191'),
      accentColor: String(payload.accentColor || '#4A9B9B')
    };

    const settings = await readSettings();
    settings.theme = theme;
    await writeSettings(settings);
    return res.json({ success: true, theme: settings.theme });
  } catch (e) {
    console.error('Error saving theme settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Author settings API
const defaultAuthorSocial = { email: '', twitter: '', facebook: '', linkedin: '', instagram: '', github: '', website: '' };
const defaultAuthor = { name: '', email: '', bio: '', phone: '', whatsapp: '', profilePicture: '', social: defaultAuthorSocial };

function withAuthorDefaults(author) {
  const merged = Object.assign({}, defaultAuthor, author || {});
  merged.social = Object.assign({}, defaultAuthorSocial, merged.social || {});
  if (typeof merged.profilePicture === 'string') merged.profilePicture = normalizeAssetUrl(merged.profilePicture);
  return merged;
}

app.get('/api/settings/author', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    // Read from the configured backend (Supabase, Mongo, or local file)
    const settings = await readSettings();
    return res.json({ author: withAuthorDefaults(settings.author) });
  } catch (e) {
    console.error('Error reading author settings:', e);
    // Fall back to local file on error
    try {
      const settings = await readSettings();
      return res.json({ author: withAuthorDefaults(settings.author) });
    } catch (innerErr) {
      return res.json({ author: withAuthorDefaults({}) });
    }
  }
});

// Blog info settings API
app.get('/api/settings/payment', async (req, res) => {
  try {
    const settings = await readSettings();
    return res.json({ payment: settings.payment || { mpesaEnvironment: 'sandbox', mpesaConsumerKey: '', mpesaConsumerSecret: '', mpesaShortcode: '', mpesaPasskey: '', templatePrice: 1000 } });
  } catch (e) {
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/settings/payment', requireAdmin, async (req, res) => {
  try {
    const payload = req.body && req.body.payment ? req.body.payment : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

    const payment = {
      mpesaEnvironment: String(payload.mpesaEnvironment || 'sandbox'),
      mpesaConsumerKey: String(payload.mpesaConsumerKey || ''),
      mpesaConsumerSecret: String(payload.mpesaConsumerSecret || ''),
      mpesaShortcode: String(payload.mpesaShortcode || ''),
      mpesaPasskey: String(payload.mpesaPasskey || ''),
      templatePrice: Number(payload.templatePrice || 1000)
    };

    const settings = await readSettings();
    settings.payment = payment;
    await writeSettings(settings);
    return res.json({ success: true, payment });
  } catch (e) {
    return res.status(500).json({ error: 'internal' });
  }
});

// Social auto-post credentials API
const defaultSocialCredentials = {
  twitter: { enabled: false, appKey: '', appSecret: '', accessToken: '', accessSecret: '' },
  linkedin: { enabled: false, accessToken: '', personUrn: '' },
  facebook: { enabled: false, accessToken: '', pageId: '' },
  mastodon: { enabled: false, url: '', accessToken: '' },
};

function maskValue(val) {
  if (!val || typeof val !== 'string' || val.length < 8) return val ? '***' : '';
  return val.slice(0, 4) + '***' + val.slice(-4);
}

app.get('/api/settings/social-credentials', requireAdmin, async (req, res) => {
  try {
    const settings = await readSettings();
    let creds = settings.socialCredentials || defaultSocialCredentials;
    // Mask secrets before sending to client
    const masked = JSON.parse(JSON.stringify(creds));
    for (const platform of ['twitter', 'linkedin', 'facebook', 'mastodon']) {
      if (!masked[platform]) continue;
      const p = masked[platform];
      for (const key of Object.keys(p)) {
        if (key === 'enabled') continue;
        if (typeof p[key] === 'string' && p[key].length > 0) {
          p[key] = maskValue(p[key]);
        }
      }
    }
    return res.json({ socialCredentials: masked });
  } catch (e) {
    console.error('Error reading social credentials:', e);
    return res.json({ socialCredentials: defaultSocialCredentials });
  }
});

app.put('/api/settings/social-credentials', requireAdmin, async (req, res) => {
  try {
    const payload = req.body?.socialCredentials || req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

    const clean = (val) => {
      if (!val || typeof val !== 'string') return '';
      // If the value contains masked chars (***), return empty to keep existing
      if (val.includes('***')) return '';
      return val.trim();
    };

    const socialCredentials = {
      twitter: {
        enabled: !!payload.twitter?.enabled,
        appKey: clean(payload.twitter?.appKey) || (payload.twitter?.appKey?.includes('***') ? '' : ''),
        appSecret: clean(payload.twitter?.appSecret) || '',
        accessToken: clean(payload.twitter?.accessToken) || '',
        accessSecret: clean(payload.twitter?.accessSecret) || '',
      },
      linkedin: {
        enabled: !!payload.linkedin?.enabled,
        accessToken: clean(payload.linkedin?.accessToken) || '',
        personUrn: clean(payload.linkedin?.personUrn) || '',
      },
      facebook: {
        enabled: !!payload.facebook?.enabled,
        accessToken: clean(payload.facebook?.accessToken) || '',
        pageId: clean(payload.facebook?.pageId) || '',
      },
      mastodon: {
        enabled: !!payload.mastodon?.enabled,
        url: clean(payload.mastodon?.url) || '',
        accessToken: clean(payload.mastodon?.accessToken) || '',
      },
    };

    // Re-read existing settings and merge so masked secrets are preserved.
    const settings = await readSettings();
    const existing = settings.socialCredentials || {};

    for (const platform of ['twitter', 'linkedin', 'facebook', 'mastodon']) {
      for (const key of Object.keys(socialCredentials[platform])) {
        if (key === 'enabled') continue;
        if (socialCredentials[platform][key] === '' && existing[platform]?.[key]) {
          socialCredentials[platform][key] = existing[platform][key];
        }
      }
    }

    settings.socialCredentials = socialCredentials;
    await writeSettings(settings);

    return res.json({ success: true });
  } catch (e) {
    console.error('Error saving social credentials:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/settings/blog-info', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    const settings = await readSettings();
    const blogInfo = settings.blogInfo || { title: 'zedong254ke', description: 'Discover insights, tutorials, and thoughts on web development, programming, and technology.' };
    return res.json({ blogInfo });
  } catch (e) {
    console.error('Error reading blog info settings:', e);
    const blogInfo = { title: 'zedong254ke', description: 'Discover insights, tutorials, and thoughts on web development, programming, and technology.' };
    return res.json({ blogInfo });
  }
});

app.post('/api/settings/blog-info', requireAdmin, async (req, res) => {
  try {
    const payload = req.body && req.body.blogInfo ? req.body.blogInfo : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = await readSettings();
    settings.blogInfo = {
      title: String(payload.title || 'zedong254ke'),
      description: String(payload.description || 'Discover insights, tutorials, and thoughts on web development, programming, and technology.')
    };
    if (payload.donationUrl !== undefined) {
      const raw = String(payload.donationUrl || '').trim();
      try {
        const parsed = raw ? new URL(raw) : null;
        settings.blogInfo.donationUrl = parsed && /^https?:$/.test(parsed.protocol)
          ? parsed.href
          : (raw.startsWith('/') ? raw : '');
      } catch (e) {
        settings.blogInfo.donationUrl = raw.startsWith('/') ? raw : '';
      }
    }
    await writeSettings(settings);
    return res.json({ success: true, blogInfo: settings.blogInfo });
  } catch (e) {
    console.error('Error saving blog info settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/settings/author', requireAdmin, async (req, res) => {
  try {
    const payload = req.body && req.body.author ? req.body.author : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = await readSettings();
    const existingAuthor = settings.author && typeof settings.author === 'object' ? settings.author : {};
    settings.author = {
      name: String(payload.name || ''),
      email: String(payload.email || ''),
      bio: String(payload.bio || ''),
      phone: String(payload.phone || ''),
      whatsapp: String(payload.whatsapp || ''),
      // Preserve the saved portrait when the client omits the field entirely;
      // an explicit empty string still clears it.
      profilePicture: Object.prototype.hasOwnProperty.call(payload, 'profilePicture')
        ? String(payload.profilePicture || '').trim()
        : String(existingAuthor.profilePicture || ''),
      social: {
        email: String(payload.social?.email || ''),
        twitter: String(payload.social?.twitter || ''),
        facebook: String(payload.social?.facebook || ''),
        linkedin: String(payload.social?.linkedin || ''),
        instagram: String(payload.social?.instagram || ''),
        github: String(payload.social?.github || ''),
        website: String(payload.social?.website || '')
      }
    };
    await writeSettings(settings);
    return res.json({ success: true, author: settings.author });
  } catch (e) {
    console.error('Error saving author settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Security settings API (admin entry key)
app.get('/api/settings/security', async (req, res) => {
  try {
    // Force bypass for localhost by reporting no key exists
    if (isLocalhostAdminKeyBypassEnabled(req)) {
      return res.json({ hasEntryKey: false, mode: 'localhost' });
    }

    // If env-managed key exists, it's globally required
    if (process.env.ADMIN_ENTRY_KEY) {
      return res.json({ hasEntryKey: true, mode: 'env' });
    }

    // Per-user mode: require key for admin users
    const currentUser = req.session?.user || req.user;
    const isAdmin = String(currentUser?.role || 'USER').toUpperCase() === 'ADMIN';
    
    // If no user is logged in (pre-login), check if ANY admin has an admin key
    if (!currentUser || !currentUser.username) {
      const users = await loadUsers();
      const anyAdminWithKey = Object.values(users || {}).some(u => {
        return String(u.role || 'USER').toUpperCase() === 'ADMIN' && u.adminKeyHash;
      });
      if (anyAdminWithKey) {
        return res.json({ hasEntryKey: true, mode: 'per_user', preLogin: true });
      }
      // No admin has a key set yet - don't block the login page
      return res.json({ hasEntryKey: false, mode: 'no_keys_configured' });
    }

    if (!isAdmin) {
      return res.json({ hasEntryKey: false, mode: 'not_admin' });
    }

    const username = currentUser?.username;
    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    const hasUserKey = !!user?.adminKeyHash;
    return res.json({ hasEntryKey: true, hasUserKey, mode: hasUserKey ? 'per_user' : 'per_user_not_set' });
  } catch (e) {
    return res.json({ hasEntryKey: false, mode: 'none' });
  }
});

app.post('/api/settings/security', requireAdmin, async (req, res) => {
  try {
    const { adminEntryKey, sessionTimeout } = req.body || {};

    if (adminEntryKey !== undefined) {
      const rawKey = String(adminEntryKey);
      const trimmed = rawKey.trim();

      // IMPORTANT:
      // Treat empty/blank input as "clear / disable entry key".
      // Previously we were hashing an empty string which made `hasEntryKey === true`
      // but impossible to satisfy from the UI (since the UI won't allow blank input).
      const isClearingKey = trimmed.length === 0;
      const hash = isClearingKey ? '' : await bcrypt.hash(trimmed, BCRYPT_ROUNDS);
      const enc = isClearingKey ? '' : encryptText(trimmed);

      const settings = await readSettings();
      if (!settings.security) settings.security = {};
      settings.security.adminEntryKeyHash = hash;
      settings.security.adminEntryKeyEnc = enc;
      await writeSettings(settings);
      return res.json({
        success: true,
        message: isClearingKey ? 'Admin entry key cleared successfully' : 'Admin entry key updated successfully'
      });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('Error saving security settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Legacy endpoint (kept for backward compatibility): verifies the *current user's* admin key
app.post('/api/settings/verify-my-key', requireAuth, async (req, res) => {
  try {
    const provided = String(req.body?.adminEntryKey || '').trim();
    const currentUser = req.session?.user || req.user;
    const username = currentUser?.username;
    if (!username) return res.status(401).json({ success: false, error: 'not_authenticated' });

    // Localhost bypass
    if (isLocalhostAdminKeyBypassEnabled(req)) {
      req.session.adminKeyVerified = true;
      req.session.adminKeyVerifiedAt = Date.now();
      req.session.adminKeyVerifiedUsername = username;
      return res.json({ success: true, mode: 'localhost' });
    }

    // Env-managed key
    if (process.env.ADMIN_ENTRY_KEY) {
      if (provided && provided === String(process.env.ADMIN_ENTRY_KEY)) {
        req.session.adminKeyVerified = true;
        req.session.adminKeyVerifiedAt = Date.now();
        req.session.adminKeyVerifiedUsername = username;
        return res.json({ success: true, mode: 'env' });
      }
      return res.status(403).json({ success: false, error: 'invalid_key', mode: 'env' });
    }

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    if (!user) return res.status(404).json({ success: false, error: 'user_not_found' });
    if (!user.adminKeyHash) return res.status(400).json({ success: false, error: 'admin_key_not_set' });

    const ok = await bcrypt.compare(provided, user.adminKeyHash);
    if (!ok) return res.status(403).json({ success: false, error: 'invalid_key', mode: 'per_user' });

    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
    req.session.adminKeyVerifiedUsername = username;
    return res.json({ success: true, mode: 'per_user' });
  } catch (e) {
    console.error('verify-entry-key error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Check if admin entry key is verified in session (NO requireAuth - called before login)
app.get('/api/settings/check-admin-key-verified', (req, res) => {
  res.set('Cache-Control', 'no-store');

  // Auto-verify for localhost
  if (!req.session.adminKeyVerified && isLocalhostAdminKeyBypassEnabled(req)) {
    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
  }

  const currentUser = req.session?.user || req.user;
  const username = currentUser?.username;
  const verified = req.session.adminKeyVerified === true && (!username || req.session.adminKeyVerifiedUsername === username);
  const verifiedAt = req.session.adminKeyVerifiedAt || null;
  const verifiedFor = req.session.adminKeyVerifiedUsername || null;
  return res.json({ verified, verifiedAt, verifiedFor });
});

// Clear admin key verification (for idle timeout)
app.post('/api/settings/clear-admin-key-verification', requireAuth, (req, res) => {
  req.session.adminKeyVerified = false;
  req.session.adminKeyVerifiedAt = null;
  req.session.adminKeyVerifiedUsername = null;
  return res.json({ success: true });
});

// View security logs after verifying admin credentials
app.post('/api/settings/security/logs', requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing credentials' });
    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    const user = userKey ? users[userKey] : null;
    if (!user) return res.status(401).json({ error: 'invalid user' });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid password' });

    const logs = await loadSecurityLogs();
    // Return most recent first
    const ordered = logs.slice().sort((a, b) => b.id - a.id).slice(0, 2000);
    return res.json({ success: true, logs: ordered });
  } catch (e) {
    console.error('security logs error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// View current admin entry key (requires admin creds). Returns plaintext if stored, else empty
app.post('/api/settings/security/key-view', requireAdmin, async (req, res) => {
  try {
    if (process.env.ADMIN_ENTRY_KEY) {
      return res.status(403).json({
        error: 'env_managed',
        message: 'Admin entry key is managed by environment; viewing disabled.'
      });
    }

    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing credentials' });
  const users = await loadUsers();
  const userKey = findUserKey(users, username);
  const user = userKey ? users[userKey] : null;
    if (!user) return res.status(401).json({ error: 'invalid user' });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid password' });

    const settings = await readSettings();
    const enc = settings.security?.adminEntryKeyEnc || '';

    const key = decryptText(enc);
    return res.json({ success: true, key: key || '' });
  } catch (e) {
    console.error('security key view error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Notifications settings API
app.get('/api/settings/notifications', async (req, res) => {
  try {
    const settings = await readSettings();
    const notifications = settings.notifications || {
      emailNotifications: true,
      commentNotifications: true,
      subscriptionNotifications: true,
      adminEmail: ''
    };
    return res.json({ notifications });
  } catch (e) {
    console.error('Error reading notifications settings:', e);
    const notifications = {
      emailNotifications: true,
      commentNotifications: true,
      subscriptionNotifications: true,
      adminEmail: ''
    };
    return res.json({ notifications });
  }
});

app.post('/api/settings/notifications', requireAdmin, async (req, res) => {
  try {
    const payload = req.body && req.body.notifications ? req.body.notifications : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = await readSettings();
    settings.notifications = {
      emailNotifications: Boolean(payload.emailNotifications !== false),
      commentNotifications: Boolean(payload.commentNotifications !== false),
      subscriptionNotifications: Boolean(payload.subscriptionNotifications !== false),
      adminEmail: String(payload.adminEmail || '')
    };
    await writeSettings(settings);
    return res.json({ success: true, notifications: settings.notifications });
  } catch (e) {
    console.error('Error saving notifications settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Content settings API
app.get('/api/settings/content', async (req, res) => {
  try {
    const settings = await readSettings();
    const content = settings.content || {
      enableComments: true,
      enableSubscriptions: true,
      postsPerPage: 10,
      featuredPostsCount: 3,
      enableRichTextEditor: true
    };
    return res.json({ content });
  } catch (e) {
    console.error('Error reading content settings:', e);
    const content = {
      enableComments: true,
      enableSubscriptions: true,
      postsPerPage: 10,
      featuredPostsCount: 3,
      enableRichTextEditor: true
    };
    return res.json({ content });
  }
});

app.post('/api/settings/content', requireAdmin, async (req, res) => {
  try {
    const payload = req.body && req.body.content ? req.body.content : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = await readSettings();
    settings.content = {
      enableComments: Boolean(payload.enableComments !== false),
      enableSubscriptions: Boolean(payload.enableSubscriptions !== false),
      postsPerPage: Math.max(1, Math.min(50, parseInt(payload.postsPerPage) || 10)),
      featuredPostsCount: Math.max(0, Math.min(10, parseInt(payload.featuredPostsCount) || 3)),
      enableRichTextEditor: Boolean(payload.enableRichTextEditor !== false)
    };
    await writeSettings(settings);
    return res.json({ success: true, content: settings.content });
  } catch (e) {
    console.error('Error saving content settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Categories API
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await loadCategories();
    const isAdmin = isUserAdmin(req);

    if (isAdmin) {
      return sendJsonWithEtag(req, res, { categories });
    }

    // For readers, only show categories with at least one published post
    const posts = await loadPosts();
    const now = new Date();

    const publishedCategoryIds = new Set(
      posts
        .filter(p => !p.isDeleted && !p.isDraft && new Date(p.date) <= now)
        .map(p => p.categoryId ? p.categoryId.toString() : null)
        .filter(id => id !== null)
    );

    const filteredCategories = categories.filter(c => publishedCategoryIds.has(c.id.toString()));

    return sendJsonWithEtag(req, res, { categories: filteredCategories });
  } catch (error) {
    console.error('Categories load error:', error);
    return res.status(500).json({ error: 'failed_to_load_categories' });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'missing name' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const category = {
      name: name.trim(),
      slug,
      description: (description || '').trim(),
      tenantId: tenancy.scope.currentTenantId(),
      createdAt: new Date().toISOString()
    };

    if (db) {
      const result = await db.collection('categories').insertOne(category);
      category.id = result.insertedId.toString();
    } else {
      const categories = await loadCategories();
      category.id = Date.now().toString();
      categories.push(category);
      await saveCategories(categories);
    }

    return res.json({ success: true, category });
  } catch (error) {
    console.error('Category creation error:', error);
    return res.status(500).json({ error: 'failed_to_create_category' });
  }
});

app.put('/api/categories/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'missing name' });

    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const updatedFields = {
      name: trimmedName,
      slug,
      description: typeof description === 'string' ? description.trim() : '',
      updatedAt: new Date().toISOString()
    };

    if (db) {
      const scopeTenantId = tenancy.scope.currentTenantId();
      const filter = { $and: [{ _id: (id.length === 24 ? new ObjectId(id) : id) }, tenantMongoFilter(scopeTenantId)] };
      const result = await db.collection('categories').updateOne(filter, { $set: updatedFields });
      if (result.matchedCount === 0) return res.status(404).json({ error: 'not found' });
    } else {
      const categories = await loadCategories();
      const idx = categories.findIndex(c => c.id.toString() === id || c.id === parseInt(id, 10));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      categories[idx] = { ...categories[idx], ...updatedFields };
      await saveCategories(categories);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Category update error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (db) {
      const scopeTenantId = tenancy.scope.currentTenantId();
      const filter = { $and: [{ _id: (id.length === 24 ? new ObjectId(id) : id) }, tenantMongoFilter(scopeTenantId)] };
      const result = await db.collection('categories').deleteOne(filter);
      if (result.deletedCount === 0) return res.status(404).json({ error: 'not found' });
    } else {
      let categories = await loadCategories();
      const idx = categories.findIndex(c => c.id.toString() === id || c.id === parseInt(id, 10));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      categories.splice(idx, 1);
      await saveCategories(categories);
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('Delete category error:', e);
    return res.status(500).json({ error: 'delete_failed', details: e.message });
  }
});

// Analytics API
app.post('/api/stats/pageview', async (req, res) => {
  try {
    const { page } = req.body || {};
    await recordPageView(page || '/', req);
    return res.json({ success: true });
  } catch (e) {
    console.error('Analytics pageview error:', e);
    return res.status(500).json({ error: 'failed to track pageview' });
  }
});

app.post('/api/stats/interaction', async (req, res) => {
  try {
    const { type, target, value } = req.body || {};
    if (!type || !target) return res.status(400).json({ error: 'type_and_target_required' });

    await recordInteraction(type, target, value, req);
    res.json({ success: true });
  } catch (e) {
    console.error('Analytics interaction error:', e);
    return res.status(500).json({ error: 'failed to track interaction' });
  }
});

// Get analytics data (protected with advanced metrics)
app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const rawAnalytics = scopeAnalytics(await loadAnalytics());
    const posts = await loadPosts();
    const comments = await loadComments();
    
    // Determine time range
    const days = parseInt(period) || 7;
    const now = new Date();
    const currentStart = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    const previousStart = new Date(now.getTime() - (2 * days * 24 * 60 * 60 * 1000));
    
    const filterByRange = (data, start, end) => {
      return data.filter(item => {
        const ts = new Date(item.timestamp);
        return ts >= start && ts < end;
      });
    };

    const currentViews = filterByRange(rawAnalytics.pageViews, currentStart, now);
    const previousViews = filterByRange(rawAnalytics.pageViews, previousStart, currentStart);
    
    const currentInteractions = filterByRange(rawAnalytics.interactions, currentStart, now);
    const previousInteractions = filterByRange(rawAnalytics.interactions, previousStart, currentStart);

    // ── Metrics & Deltas ──
    const calculateStats = (views, interactions) => {
      const totalViews = views.length;
      const likes = interactions.filter(i => i.type === 'like').length;
      const commentsCount = interactions.filter(i => i.type === 'comment').length;
      const sharesCount = interactions.filter(i => i.type === 'share').length;
      
      const engagementRate = totalViews > 0 ? ((likes + commentsCount + sharesCount) / totalViews * 100) : 0;
      
      // Improved Heuristic: Time on page increases with interactions, bounce rate decreases
      const baseTime = 1.8 + (Math.random() * 0.4); // 1.8 - 2.2 min base
      const avgTime = totalViews > 0 ? baseTime + (engagementRate / 20) : 0; 
      
      const baseBounce = 45 - (Math.random() * 10); // 35 - 45% base
      const bounceRate = totalViews > 0 ? Math.max(15, baseBounce - (engagementRate / 2)) : 0;

      return { 
        totalViews, 
        engagementRate, 
        avgTime, 
        bounceRate, 
        likes, 
        commentsCount, 
        sharesCount 
      };
    };

    const lifetimeStats = calculateStats(rawAnalytics.pageViews || [], rawAnalytics.interactions || []);
    const currentStats = calculateStats(currentViews, currentInteractions);
    const previousStats = calculateStats(previousViews, previousInteractions);

    const formatDelta = (curr, prev, isPercentage = false) => {
      if (!prev || prev === 0) return curr > 0 ? `+${curr.toFixed(1)}${isPercentage ? '%' : ''}` : '0';
      const diff = curr - prev;
      const percent = (diff / prev) * 100;
      const sign = diff >= 0 ? '+' : '';
      return `${sign}${isPercentage ? percent.toFixed(1) : diff.toFixed(1)}${isPercentage ? '%' : ''}`;
    };

    // ── Traffic Sources ──
    const getTrafficSources = (views) => {
      const sources = { Direct: 0, Organic: 0, Social: 0, Referral: 0 };
      views.forEach(v => {
        const ref = v.referrer ? v.referrer.toLowerCase() : '';
        if (!ref) sources.Direct++;
        else if (ref.includes('google') || ref.includes('bing') || ref.includes('baidu')) sources.Organic++;
        else if (ref.includes('facebook') || ref.includes('t.co') || ref.includes('twitter') || ref.includes('linkedin') || ref.includes('instagram')) sources.Social++;
        else sources.Referral++;
      });
      const total = views.length || 1;
      return Object.entries(sources).map(([name, count]) => ({
        name,
        count,
        percent: ((count / total) * 100).toFixed(1)
      }));
    };

    // ── Device & Browser Breakdown ──
    const getDeviceAndBrowser = (views) => {
      const devices = { Mobile: 0, Desktop: 0, Tablet: 0 };
      const browsers = { Chrome: 0, Safari: 0, Firefox: 0, Edge: 0, Others: 0 };
      
      views.forEach(v => {
        const ua = v.userAgent || '';
        if (/mobile/i.test(ua)) devices.Mobile++;
        else if (/tablet|ipad/i.test(ua)) devices.Tablet++;
        else devices.Desktop++;

        if (/chrome|crios/i.test(ua)) browsers.Chrome++;
        else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browsers.Safari++;
        else if (/firefox|fxios/i.test(ua)) browsers.Firefox++;
        else if (/edg/i.test(ua)) browsers.Edge++;
        else browsers.Others++;
      });

      const total = views.length || 1;
      return {
        devices: Object.entries(devices).map(([name, count]) => ({ name, count, percent: ((count / total) * 100).toFixed(1) })),
        browsers: Object.entries(browsers).map(([name, count]) => ({ name, count, percent: ((count / total) * 100).toFixed(1) }))
      };
    };

    // ── Top Countries (Mock/Heuristic) ──
    const getTopCountries = (views) => {
      // Mocking country data based on IP prefix or just balanced distribution for demo
      const countries = [
        { name: 'United States', flag: '🇺🇸', percent: 35.2 },
        { name: 'Kenya', flag: '🇰🇪', percent: 24.8 },
        { name: 'United Kingdom', flag: '🇬🇧', percent: 12.5 },
        { name: 'Germany', flag: '🇩🇪', percent: 8.4 },
        { name: 'Canada', flag: '🇨🇦', percent: 5.1 }
      ];
      return countries;
    };

    // ── Heatmap Data (last 12 weeks) ──
    const getHeatmap = (views) => {
      const heatmap = [];
      for (let i = 0; i < 12 * 7; i++) {
        const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
        const dateStr = d.toISOString().split('T')[0];
        const count = views.filter(v => v.timestamp && v.timestamp.startsWith(dateStr)).length;
        heatmap.push({ date: dateStr, count });
      }
      return heatmap.reverse();
    };

    // ── Final Aggregation ──
    const dailyViews = {};
    const prevDailyViews = {};
    
    [...Array(days)].forEach((_, i) => {
      const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      const dateStr = d.toISOString().split('T')[0];
      dailyViews[dateStr] = currentViews.filter(v => v.timestamp && v.timestamp.startsWith(dateStr)).length;
      
      const prevD = new Date(currentStart.getTime() - (i * 24 * 60 * 60 * 1000));
      const prevDateStr = prevD.toISOString().split('T')[0];
      prevDailyViews[prevDateStr] = previousViews.filter(v => v.timestamp && v.timestamp.startsWith(prevDateStr)).length;
    });

    const popularPosts = posts.filter(p => !p.isDraft)
      .map(p => {
        const id = p.id;
        const pageSlug = `/post/${encodeURIComponent(id)}`;
        const pViews = currentViews.filter(v => {
          const pageStr = v.page || v.target || '';
          return pageStr.includes(pageSlug) || pageStr === id;
        }).length;
        return { id, title: p.title, views: pViews };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    const devAndBrowser = getDeviceAndBrowser(currentViews);

    const stats = {
      totalViews: currentStats.totalViews,
      totalViewsDelta: formatDelta(currentStats.totalViews, previousStats.totalViews),
      engagementRate: currentStats.engagementRate.toFixed(1) + '%',
      engagementRateDelta: formatDelta(currentStats.engagementRate, previousStats.engagementRate, true),
      avgTime: currentStats.avgTime.toFixed(1) + 'm',
      avgTimeDelta: formatDelta(currentStats.avgTime, previousStats.avgTime),
      bounceRate: currentStats.bounceRate.toFixed(1) + '%',
      bounceRateDelta: formatDelta(currentStats.bounceRate, previousStats.bounceRate, true),
      
      // Metadata for high-level summaries
      lifetime: {
        views: lifetimeStats.totalViews,
        likes: lifetimeStats.likes,
        comments: lifetimeStats.commentsCount,
        shares: lifetimeStats.sharesCount,
        engagement: lifetimeStats.engagementRate.toFixed(1) + '%'
      },
      
      viewsByDay: dailyViews,
      previousViewsByDay: prevDailyViews,
      
      trafficSources: getTrafficSources(currentViews),
      popularPosts,
      devices: devAndBrowser.devices,
      browsers: devAndBrowser.browsers,
      heatmap: getHeatmap(rawAnalytics.pageViews),
      // NOTE: countries is illustrative demo data — no geo-IP resolution yet
      countries: getTopCountries(currentViews),
      countriesDemoData: true,
      
      engagement: {
        avgScrollDepth: '74%',
        commentsCount: currentStats.commentsCount,
        sharesCount: currentInteractions.filter(i => i.type === 'share').length,
        returnVisitorRate: '18.5%'
      }
    };

    return res.json({ success: true, stats });
  } catch (e) {
    console.error('Failed to aggregate analytics:', e);
    return res.status(500).json({ error: 'failed to aggregate analytics' });
  }
});

// Get all subscriptions (admin only)
app.get('/api/subscriptions', requireAdmin, async (req, res) => {
  try {
    const subscriptions = await loadSubscriptions();
    return res.json({ subscriptions, count: subscriptions.length });
  } catch (e) {
    console.error('Load subscriptions error:', e);
    return res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

// Newsletter subscription API
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, name, postId } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const subscriptions = await loadSubscriptions();
    const existingSub = subscriptions.find(s => s.email === email && (!postId || s.postId === parseInt(postId, 10)));
    if (existingSub) {
      return res.json({ success: true, message: 'Already subscribed' });
    }

    const subscription = {
      id: Date.now(),
      email: email.trim(),
      name: name ? name.trim() : '',
      postId: postId ? parseInt(postId, 10) : null,
      subscribedAt: new Date().toISOString()
    };

    subscriptions.push(subscription);
    await saveSubscriptions(subscriptions);

    // Send confirmation email (best effort — never fail the subscription because of email)
    await sendSubscriptionConfirmation(subscription.email, subscription.name);

    console.log('New newsletter subscription:', email);
    return res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error('Subscription error:', e);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Comments API - Extended endpoints with nested replies
app.get('/api/comments/:postId', async (req, res) => {
  try {
    const postId = req.params.postId;
    const isAdmin = isUserAdmin(req);
    const comments = await loadComments();
    const visible = isAdmin ? comments : comments.filter(c => c.approved !== false);
    const postComments = visible.filter(c => String(c.postId) === postId && !c.parentId).map(comment => ({
      ...comment,
      replies: visible.filter(c => String(c.parentId) === String(comment.id))
    }));
    return res.json({ comments: postComments });
  } catch (e) {
    console.error('Load comments error:', e);
    return res.status(500).json({ error: 'Failed to load comments' });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { postId, name, email, content, parentId, subscribe } = req.body || {};
    if (!postId || !name || !email || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let imageUrl = null;
    if (req.files && req.files.image) {
      const file = req.files.image;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.mimetype)) {
         return res.status(400).json({ error: 'invalid_image_type' });
      }
      if (file.size > 5 * 1024 * 1024) {
         return res.status(400).json({ error: 'image_too_large' });
      }
      const uploadRes = await uploadFileToStorage(file, 'comments');
      imageUrl = uploadRes.url;
    }

    const commentId = tenancy.store.newId();
    const comment = {
      id: commentId,
      tenantId: tenancy.scope.currentTenantId(),
      postId: String(postId),
      name: name.trim(),
      email: email.trim(),
      content: content.trim(),
      image: imageUrl,
      parentId: parentId ? String(parentId) : null,
      date: new Date().toISOString(),
      approved: false
    };

    if (isSupabaseEnabled()) {
      await supabaseStore.insertComment(comment);
    } else {
      const comments = await loadComments();
      comments.push(comment);
      await saveComments(comments);
    }

    await recordInteraction('comment', String(postId), null, req);

    if (subscribe) {
      const subscriptions = await loadSubscriptions();
      const existingSub = subscriptions.find(s => s.email === email && String(s.postId) === String(postId));
      if (!existingSub) {
        const subscription = {
          id: tenancy.store.newId(),
          tenantId: tenancy.scope.currentTenantId(),
          postId: String(postId),
          email: email.trim(),
          name: name.trim(),
          subscribedAt: new Date().toISOString()
        };
        if (isSupabaseEnabled()) {
          await supabaseStore.insertSubscription(subscription);
        } else {
          subscriptions.push(subscription);
          await saveSubscriptions(subscriptions);
        }

        // Send confirmation email (best effort — never fail the comment because of email)
        await sendSubscriptionConfirmation(subscription.email, subscription.name);
      }
    }

    return res.json({ success: true, comment: { ...comment, approved: undefined } });
  } catch (e) {
    console.error('Create comment error:', e);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
});

app.post('/api/comments/:id/approve', requireAdmin, async (req, res) => {
  try {
    const commentId = req.params.id;
    const comments = await loadComments();
    const comment = comments.find(c => String(c.id) === commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    comment.approved = true;
    await saveComments(comments);

    if (comment.parentId) {
      const parentComment = comments.find(c => String(c.id) === String(comment.parentId));
      if (parentComment && parentComment.email) {
        const subscriptions = await loadSubscriptions();
        const subscriber = subscriptions.find(s => s.email === parentComment.email && String(s.postId) === String(comment.postId));
        if (subscriber) {
          const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
          await sendNotificationEmail(parentComment.email, comment, parentComment, baseUrl);
        }
      }
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('Approve comment error:', e);
    return res.status(500).json({ error: 'Failed to approve comment' });
  }
});

app.delete('/api/comments/:id', requireAdmin, async (req, res) => {
  try {
    const commentId = req.params.id;
    const comments = await loadComments();
    const filteredComments = comments.filter(c => String(c.id) !== commentId && String(c.parentId) !== commentId);
    await saveComments(filteredComments);
    return res.json({ success: true });
  } catch (e) {
    console.error('Delete comment error:', e);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Helper function to send notification emails
async function sendNotificationEmail(toEmail, replyComment, originalComment, baseUrl = '') {
  try {
    const posts = await loadPosts();
    const post = posts.find(p => String(p.id) === String(replyComment.postId));

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@yourblog.com',
      to: toEmail,
      subject: `New reply to your comment on "${post?.title || 'Blog Post'}"`,
      html: `
        <h2>New Reply to Your Comment</h2>
        <p>Hi ${originalComment.name},</p>
        <p>Someone has replied to your comment on the blog post "${post?.title || 'Blog Post'}".</p>
        <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-left: 4px solid #F4A191;">
          <p><strong>Your comment:</strong></p>
          <p>${originalComment.content}</p>
        </div>
        <div style="background: #e8f5e8; padding: 15px; margin: 20px 0; border-left: 4px solid #4A9B9B;">
          <p><strong>Reply:</strong></p>
          <p>${replyComment.content}</p>
          <p><em>By: ${replyComment.name}</em></p>
        </div>
        <p><a href="${baseUrl}/post.html?id=${replyComment.postId}">View the full discussion</a></p>
        <p>If you no longer wish to receive these notifications, you can unsubscribe from the blog post page.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Notification email sent to:', toEmail);
  } catch (e) {
    console.error('Failed to send notification email:', e);
  }
}

// Export analytics data with optional date filters
// Query params: dataset=pageViews|interactions|all (default=all), format=json|csv (default=json), from=ISO, to=ISO
app.get('/api/stats/export', requireAdmin, async (req, res) => {
  try {
    const { dataset = 'all', format = 'json', from, to } = req.query;
    const all = await loadAnalytics();

    const parseDate = (v, endOfDay) => {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      if (endOfDay) d.setHours(23, 59, 59, 999);
      else d.setHours(0, 0, 0, 0);
      return d;
    };
    const start = parseDate(from, false);
    const end = parseDate(to, true);

    const inRange = (ts) => {
      const t = new Date(ts).getTime();
      if (isNaN(t)) return false;
      if (start && t < start.getTime()) return false;
      if (end && t > end.getTime()) return false;
      return true;
    };

    const filtered = {
      pageViews: (all.pageViews || []).filter(p => inRange(p.timestamp)),
      interactions: (all.interactions || []).filter(i => inRange(i.timestamp)),
      postViews: (all.postViews || []).filter(p => inRange(p.timestamp))
    };

    if (format === 'json') {
      const data = dataset === 'all' ? filtered : { [dataset]: filtered[dataset] };
      const filename = dataset === 'all' ? 'analytics.json' : `${dataset}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(data, null, 2));
    }

    // CSV export supports single dataset at a time
    if (format === 'csv') {
      if (!['pageViews', 'interactions'].includes(dataset)) {
        return res.status(400).json({ error: 'csv_export_requires_dataset_pageViews_or_interactions' });
      }
      const rows = filtered[dataset] || [];
      const toCsv = (arr) => {
        if (!arr.length) return '';
        const headers = Array.from(
          arr.reduce((set, obj) => { Object.keys(obj).forEach(k => set.add(k)); return set; }, new Set())
        );
        const escape = (v) => {
          if (v == null) return '';
          const s = String(v).replace(/"/g, '""');
          return `"${s}"`;
        };
        const lines = [headers.join(',')];
        for (const obj of arr) {
          lines.push(headers.map(h => escape(obj[h])).join(','));
        }
        return lines.join('\n');
      };
      const csv = toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${dataset}.csv"`);
      return res.send(csv);
    }

    return res.status(400).json({ error: 'unsupported_format' });
  } catch (e) {
    console.error('analytics export error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Welcome API endpoint
app.get('/api/welcome', (req, res) => {
  console.log(`Request received: ${req.method} ${req.path}`);
  return res.json({ message: 'Welcome to the API!' });
});

// Birthday API endpoint
app.get('/api/birthday', (req, res) => {
  console.log(`Request received: ${req.method} ${req.path}`);
  return res.json({ message: 'Happy Birthday! Wishing you a fantastic year ahead!' });
});

// Admin-only maintenance endpoint to delete all posts (for production cleanup)
app.delete('/api/admin/delete-all-posts', requireAdmin, async (req, res) => {
  try {
    console.log('Admin requested to delete all posts');

    // Delete all posts
    await savePosts([]);

    // Delete all comments
    await saveComments([]);

    // Delete all subscriptions
    await saveSubscriptions([]);

    console.log('All posts, comments, and subscriptions deleted successfully');
    return res.json({
      success: true,
      message: 'All posts, comments, and subscriptions have been deleted'
    });
  } catch (error) {
    console.error('Error deleting all posts:', error);
    return res.status(500).json({ error: 'Failed to delete posts' });
  }
});

app.get('/admin', (req, res) => {
  // Serve the modernized admin with comprehensive settings UI
  const modernAdmin = path.join(__dirname, 'admin.html');
  return res.sendFile(modernAdmin);
});

app.get('/admin.html', (req, res) => {
  // Serve the modernized admin with comprehensive settings UI
  const modernAdmin = path.join(__dirname, 'admin.html');
  return res.sendFile(modernAdmin);
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/post.html', async (req, res) => {
  const postId = req.query.id;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // Cache the template in memory; reload automatically if the file changes
  const postHtmlPath = path.join(__dirname, 'post.html');
  const postHtmlStat = await fs.promises.stat(postHtmlPath);
  if (!postHtmlTemplate || postHtmlStat.mtimeMs !== postHtmlTemplateMtimeMs) {
    postHtmlTemplate = await fs.promises.readFile(postHtmlPath, 'utf8');
    postHtmlTemplateMtimeMs = postHtmlStat.mtimeMs;
  }
  let html = postHtmlTemplate;

  if (postId) {
    try {
      // loadPostsEntry() is storage-aware and cached in-process
      const { posts, byId } = await loadPostsEntry();
      const post = (byId && byId.get(String(postId))) || posts.find(p => String(p.id) === String(postId));

      if (post) {
        const settings = await readSettings();
        const authorName = (settings && settings.author && settings.author.name) || 'Admin';
        const title = post.title || 'Untitled Post';
        const description = (post.content || '').substring(0, 160).replace(/<[^>]*>/g, '') || 'Click to read more';
        const image = post.image || '';
        const postUrl = `${baseUrl}/post.html?id=${postId}`;

        // Structured data for search engines / social crawlers
        const jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: title,
          description,
          datePublished: post.date || undefined,
          dateModified: post.updatedAt || post.date || undefined,
          mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
          author: { '@type': 'Person', name: post.author || authorName },
          publisher: { '@type': 'Person', name: authorName },
          keywords: Array.isArray(post.tags) && post.tags.length ? post.tags.join(', ') : undefined,
          timeRequired: `PT${readingMinutesOf(post.content)}M`,
          ...(image ? { image: [absoluteUrl(image, baseUrl)] } : {})
        };

        const ogMeta = `
    <meta property="og:title" content="${String(title).replace(/"/g, '&quot;')}">
    <meta property="og:description" content="${String(description).replace(/"/g, '&quot;')}">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="${String(authorName)}">
    <meta name="twitter:card" content="summary_large_image">
    ${image ? `<meta property="og:image" content="${image}">` : ''}
    <link rel="canonical" href="${postUrl}">
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
`;
        html = html.replace('</head>', `${ogMeta}\n</head>`);
      }
    } catch (e) {
      console.error('Error generating OG tags:', e.message);
    }
  }

  res.send(html);
});

// ── SSR homepage ─────────────────────────────────────────────────────
// The homepage is a Vue SPA; search engines and no-JS clients additionally
// get a server-rendered post archive + JSON-LD so the content is indexable.
function htmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

app.get('/', async (req, res) => {
  try {
    const indexHtmlPath = path.join(__dirname, 'index.html');
    // Reload the template when the file changes on disk so HTML edits go live
    // without a server restart (mtime-based cache, same file always cached).
    try {
      const indexStat = await fs.promises.stat(indexHtmlPath);
      if (!indexHtmlTemplate || indexStat.mtimeMs !== indexHtmlTemplateMtimeMs) {
        indexHtmlTemplate = await fs.promises.readFile(indexHtmlPath, 'utf8');
        indexHtmlTemplateMtimeMs = indexStat.mtimeMs;
      }
    } catch (e) {
      if (!indexHtmlTemplate) {
        indexHtmlTemplate = await fs.promises.readFile(indexHtmlPath, 'utf8');
      }
    }

    const base = publicBaseUrl(req);
    const meta = await siteMeta();
    const posts = publishedPosts(await loadPosts())
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = posts.slice(0, 20);

    const blogLd = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: meta.title,
      description: meta.description,
      url: `${base}/`,
      author: { '@type': 'Person', name: meta.author },
      blogPost: recent.slice(0, 10).map(p => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: `${base}/post.html?id=${encodeURIComponent(p.id)}`,
        datePublished: p.date || undefined
      }))
    };

    const archive = recent.map(p =>
      `        <li><a href="/post.html?id=${encodeURIComponent(p.id)}">${htmlEscape(p.title)}</a> — ${htmlEscape(excerptOf(p.content, 160))}</li>`
    ).join('\n');

    const inject = `
    <script type="application/ld+json">${JSON.stringify(blogLd).replace(/</g, '\\u003c')}</script>
    <noscript>
      <h1>${htmlEscape(meta.title)}</h1>
      <p>${htmlEscape(meta.description)}</p>
      <ol>
${archive}
      </ol>
    </noscript>
`;

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
      .send(indexHtmlTemplate.replace('</head>', `${inject}</head>`));
  } catch (e) {
    console.error('Homepage render error:', e.message);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/about.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'about.html'));
});

// Clean tag archive URLs: /tag/name renders the home app, which applies the
// tag filter from the pathname.
app.get('/tag/:tag', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Test social media connections
app.get('/api/social/test', requireAdmin, async (req, res) => {
  try {
    const settings = await readSettings();
    const creds = settings.socialCredentials || {};
    const SocialPoster = require('./utils/socialPoster');
    const poster = new SocialPoster(creds);
    const testPost = {
      title: 'Test Post - Social Auto-Post Setup',
      subtitle: 'Connection test',
      tags: ['test'],
      content: 'This is a test post to verify social media auto-posting is working correctly.',
    };
    const testUrl = `${req.protocol}://${req.get('host')}/post.html?id=test`;
    const results = await poster.postToAll(testPost, testUrl);
    return res.json({ success: true, results });
  } catch (e) {
    console.error('Social test error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// Social sharing endpoint
app.post('/api/share', async (req, res) => {
    const { postId, platforms } = req.body || {};
    if (!postId || !platforms || !Array.isArray(platforms)) {
        return res.status(400).json({ error: 'postId and platforms array required' });
    }

    try {
        const posts = await loadPosts();
        const post = posts.find(p => p.id == postId);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const settings = await readSettings();
        const author = settings.author || {};
        const social = author.social || {};

        const postUrl = `${req.protocol}://${req.get('host')}/post.html?id=${postId}`;
        const shareResults = [];

        for (const platform of platforms) {
            try {
                let result = { platform, success: false, error: null };

                if (platform === 'twitter' && social.twitter) {
                    const tweetText = encodeURIComponent(`${post.title}\n\n${postUrl}`);
                    result.twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
                    result.success = true;
                } else if (platform === 'facebook' && social.facebook) {
                    result.facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;
                    result.success = true;
                } else if (platform === 'linkedin' && social.linkedin) {
                    result.linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(postUrl)}`;
                    result.success = true;
                } else {
                    result.error = 'Not configured';
                }

                shareResults.push(result);
            } catch (e) {
                shareResults.push({ platform, success: false, error: e.message });
            }
        }

        return res.json({ success: true, results: shareResults, postUrl });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Handle favicon.ico to prevent 404 in browser console
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// ── SEO: canonical base URL, sitemap, RSS feed ───────────────────────
function publicBaseUrl(req) {
  // Tenant blogs must use their own host for canonical URLs, sitemap and RSS;
  // BASE_URL only applies to the platform site itself.
  const tenantId = tenancy.scope.currentTenantId();
  if (tenantId === tenancy.PLATFORM_TENANT_ID && process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function absoluteUrl(src, base) {
  const value = String(src || '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

async function siteMeta() {
  let settings = {};
  try { settings = await readSettings() || {}; } catch (e) { settings = {}; }
  const blogInfo = settings.blogInfo || {};
  const author = settings.author || {};
  return {
    title: blogInfo.title || author.name || 'Blog',
    description: blogInfo.description || author.bio || 'Personal blog',
    author: author.name || 'Admin'
  };
}

app.get('/sitemap.xml', async (req, res) => {
  try {
    const base = publicBaseUrl(req);
    const posts = publishedPosts(await loadPosts())
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const staticPages = [
      { loc: `${base}/`, lastmod: posts[0] ? posts[0].date : new Date().toISOString() },
      { loc: `${base}/about.html`, lastmod: new Date().toISOString() }
    ];

    const tagSet = new Set();
    posts.forEach(p => (p.tags || []).forEach(tag => {
      const value = String(tag || '').trim();
      if (value) tagSet.add(value);
    }));
    const tagPages = [...tagSet].map(tag => ({
      loc: `${base}/tag/${encodeURIComponent(tag)}`,
      lastmod: posts[0] ? posts[0].date : new Date().toISOString()
    }));

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      ...staticPages.map(p =>
        `  <url><loc>${xmlEscape(p.loc)}</loc><lastmod>${new Date(p.lastmod).toISOString()}</lastmod></url>`),
      ...tagPages.map(p =>
        `  <url><loc>${xmlEscape(p.loc)}</loc><lastmod>${new Date(p.lastmod).toISOString()}</lastmod></url>`),
      ...posts.map(p => {
        const image = p.image
          ? `<image:image><image:loc>${xmlEscape(absoluteUrl(p.image, base))}</image:loc><image:title>${xmlEscape(p.title)}</image:title></image:image>`
          : '';
        return `  <url><loc>${xmlEscape(`${base}/post.html?id=${encodeURIComponent(p.id)}`)}</loc>` +
          `<lastmod>${new Date(p.date).toISOString()}</lastmod>` +
          (p.title ? `<image:title>${xmlEscape(p.title)}</image:title>` : '') + image + '</url>';
      }),
      '</urlset>'
    ].join('\n');

    res.type('application/xml').send(xml);
  } catch (e) {
    console.error('sitemap error:', e.message);
    res.status(500).type('application/xml').send('<?xml version="1.0"?><urlset/>');
  }
});

async function buildRssFeed(baseUrl) {
  const meta = await siteMeta();
  const posts = publishedPosts(await loadPosts())
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 30);

  const items = posts.map(p => {
    const link = `${baseUrl}/post.html?id=${encodeURIComponent(p.id)}`;
    const excerpt = p.isPremium
      ? excerptOf(teaserContent(p.content, 400), 400)
      : excerptOf(p.content, 400);
    return [
      '    <item>',
      `      <title>${xmlEscape(p.title)}</title>`,
      `      <link>${xmlEscape(link)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      `      <pubDate>${new Date(p.date).toUTCString()}</pubDate>`,
      `      <description>${xmlEscape(excerpt)}</description>`,
      ...(Array.isArray(p.tags) ? p.tags.map(t => `      <category>${xmlEscape(t)}</category>`) : []),
      '    </item>'
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(meta.title)}</title>`,
    `    <link>${xmlEscape(baseUrl)}</link>`,
    `    <description>${xmlEscape(meta.description)}</description>`,
    `    <language>en</language>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${xmlEscape(`${baseUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    items,
    '  </channel>',
    '</rss>'
  ].filter(line => line !== null).join('\n');
}

async function rssHandler(req, res) {
  try {
    const xml = await buildRssFeed(publicBaseUrl(req));
    res.type('application/xml').send(xml);
  } catch (e) {
    console.error('feed error:', e.message);
    res.status(500).type('application/xml').send('<?xml version="1.0"?><rss version="2.0"><channel/></rss>');
  }
}
app.get('/feed.xml', rssHandler);
app.get('/rss.xml', rssHandler);

// Handle robots.txt
app.get('/robots.txt', (req, res) => {
  const base = publicBaseUrl(req);
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
});

// ── MPesa Template Purchase Endpoints ──

// Public: Get template price
app.get('/api/payments/config', async (req, res) => {
  try {
    let templatePrice = 1000;
    const settings = await readSettings();
    templatePrice = settings?.payment?.templatePrice || 1000;
    res.json({
      success: true,
      templatePrice,
      platformDomain: tenancy.PLATFORM_DOMAIN || null,
      customDomainTarget: tenancy.CUSTOM_DOMAIN_TARGET || null,
      reservationMinutes: Math.round(tenancy.RESERVATION_TTL_MS / 60000)
    });
  } catch (e) {
    res.json({ success: true, templatePrice: 1000 });
  }
});

// Public: Initiate MPesa STK Push payment
app.post('/api/payments/checkout', async (req, res) => {
  let reservedHostname = null;
  try {
    const { phoneNumber, name, email, subdomain } = req.body;

    if (!phoneNumber || !name || !email) {
      return res.status(400).json({ error: 'Phone number, name, and email are required' });
    }

    // Validate phone number format
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 9 || cleanPhone.length > 15) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Reserve the chosen subdomain before charging, so two customers cannot
    // pay for the same slug. Holds expire automatically.
    let chosenSlug = null;
    let chosenHostname = null;
    if (subdomain !== undefined && subdomain !== null && String(subdomain).trim() !== '') {
      const slugCheck = tenancy.validateSubdomain(subdomain);
      if (!slugCheck.valid) {
        return res.status(400).json({ error: slugCheck.error });
      }
      const availability = await tenancy.store.isSubdomainAvailable(slugCheck.hostname);
      if (!availability.available) {
        return res.status(409).json({ error: availability.reason === 'reserved'
          ? 'That subdomain is on hold for another checkout. Please choose another.'
          : 'That subdomain is already taken.' });
      }
      const reservation = await tenancy.store.reserveSubdomain({
        subdomain: slugCheck.hostname,
        email,
        ttlMs: tenancy.RESERVATION_TTL_MS
      });
      if (!reservation.ok) {
        return res.status(409).json({ error: reservation.error });
      }
      chosenSlug = slugCheck.slug;
      chosenHostname = slugCheck.hostname;
      reservedHostname = slugCheck.hostname;
    }

    // Get template price from settings
    let templatePrice = 1000;
    const settings = await readSettings();
    templatePrice = settings?.payment?.templatePrice || 1000;

    // Initiate STK Push
    const stkResult = await initiateMpesaSTKPush(cleanPhone, templatePrice, 'BlogTemplate');

    const txnId = (typeof ObjectId !== 'undefined') ? new ObjectId().toString() : Date.now().toString();

    // Save transaction record
    const transaction = {
      id: txnId,
      checkoutRequestId: stkResult.CheckoutRequestID || null,
      merchantRequestId: stkResult.MerchantRequestID || null,
      responseCode: stkResult.ResponseCode,
      responseDescription: stkResult.ResponseDescription || '',
      customerName: name,
      customerEmail: email,
      customerPhone: cleanPhone,
      amount: templatePrice,
      subdomain: chosenSlug,
      hostname: chosenHostname,
      status: stkResult.ResponseCode === '0' ? 'pending' : 'failed',
      welcomeEmailSent: false,
      createdAt: new Date().toISOString()
    };

    const txns = await loadMpesaTransactions();
    txns.push(transaction);
    await saveMpesaTransactions(txns);

    if (stkResult.ResponseCode === '0') {
      res.json({
        success: true,
        checkoutRequestId: stkResult.CheckoutRequestID,
        merchantRequestId: stkResult.MerchantRequestID,
        message: 'STK Push sent to your phone. Please enter your MPesa PIN to complete payment.',
        transactionId: txnId
      });
    } else {
      if (reservedHostname) {
        await tenancy.store.releaseReservation(reservedHostname, { email }).catch(() => {});
      }
      res.status(400).json({
        error: stkResult.ResponseDescription || 'Payment initiation failed',
        responseCode: stkResult.ResponseCode
      });
    }
  } catch (e) {
    console.error('MPesa checkout error:', e);
    if (reservedHostname) {
      await tenancy.store.releaseReservation(reservedHostname, { email: req.body?.email }).catch(() => {});
    }
    res.status(500).json({ error: 'Payment processing failed. Please try again.' });
  }
});

// MPesa callback endpoint (called by Safaricom after STK push)
app.post('/api/payments/callback', async (req, res) => {
  try {
    const callbackData = req.body;
    const stkCallback = callbackData?.Body?.stkCallback;

    if (!stkCallback) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
    }

    const merchantRequestId = stkCallback.MerchantRequestID;
    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    // Find the transaction
    const txns = await loadMpesaTransactions();
    const txnIndex = txns.findIndex(t =>
      t.checkoutRequestId === checkoutRequestId || t.merchantRequestId === merchantRequestId
    );

    if (txnIndex !== -1) {
      txns[txnIndex].status = resultCode === 0 ? 'completed' : 'failed';
      txns[txnIndex].resultCode = resultCode;
      txns[txnIndex].resultDescription = resultDesc;
      txns[txnIndex].completedAt = new Date().toISOString();

      if (resultCode !== 0 && (txns[txnIndex].hostname || txns[txnIndex].subdomain)) {
        await tenancy.store.releaseReservation(txns[txnIndex].hostname || txns[txnIndex].subdomain, {
          email: txns[txnIndex].customerEmail
        }).catch(() => {});
      }

      if (resultCode === 0 && stkCallback.CallbackMetadata?.Item) {
        const items = stkCallback.CallbackMetadata.Item;
        const mpesaReceipt = items.find(i => i.Name === 'MpesaReceiptNumber');
        const amount = items.find(i => i.Name === 'Amount');
        const phoneNumber = items.find(i => i.Name === 'PhoneNumber');

        if (mpesaReceipt) txns[txnIndex].mpesaReceiptNumber = mpesaReceipt.Value;
        if (amount) txns[txnIndex].paidAmount = amount.Value;
        if (phoneNumber) txns[txnIndex].paidPhone = phoneNumber.Value;
        txns[txnIndex].paymentKey = txns[txnIndex].mpesaReceiptNumber
          ? `mpesa:${txns[txnIndex].mpesaReceiptNumber}`
          : `mpesa:${checkoutRequestId}`;

        // Auto-register as buyer on successful payment
        const txn = txns[txnIndex];
        const buyers = await loadTemplateBuyers();
        let buyerRecord = buyers.find(b => b.email.toLowerCase() === txn.customerEmail.toLowerCase());
        if (!buyerRecord) {
          const generateSegment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
          const licenseKey = `BLG-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
          const id = (typeof ObjectId !== 'undefined') ? new ObjectId().toString() : Date.now().toString();
          buyerRecord = {
            id,
            name: txn.customerName,
            email: txn.customerEmail,
            phone: txn.customerPhone,
            licenseKey,
            purchaseDate: new Date().toISOString(),
            mpesaReceiptNumber: txn.mpesaReceiptNumber || null,
            amountPaid: txn.paidAmount || txn.amount,
            status: 'active'
          };
          buyers.push(buyerRecord);
          await saveTemplateBuyers(buyers);
          txns[txnIndex].buyerRegistered = true;

          // Auto-create user account for the buyer
          const users = await loadUsers();
          let existingKey = findUserKeyByEmail(users, txn.customerEmail);
          if (!existingKey) {
            let buyerUsername = txn.customerEmail.split('@')[0];
            if (findUserKey(users, buyerUsername)) {
              buyerUsername = `${buyerUsername}_${Math.random().toString(36).substring(2, 6)}`;
            }
            const tempHash = await bcrypt.hash(licenseKey, BCRYPT_ROUNDS);
            users[buyerUsername] = {
              name: txn.customerName || buyerUsername,
              email: txn.customerEmail,
              passwordHash: tempHash,
              active: true,
              role: 'TEMPLATE_BUYER',
              rights: ['view_template', 'manage_own_posts', 'manage_profile'],
              buyerId: id,
              createdAt: new Date().toISOString()
            };
            await saveUsers(users);
          }

          // Send license email
          sendLicenseEmail(buyerRecord);
        }

        // Create the tenant + subdomain and seed the blog. Idempotent on the
        // M-Pesa receipt number, so duplicate callbacks do not provision twice.
        await finalizeTenantPurchase(txns[txnIndex], buyerRecord);
      }

      await saveMpesaTransactions(txns);
    }

    // Respond to Safaricom
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (e) {
    console.error('MPesa callback error:', e);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Processed' });
  }
});

// Public: Check payment status
app.get('/api/payments/status/:checkoutRequestId', async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const txns = await loadMpesaTransactions();
    const txn = txns.find(t => t.checkoutRequestId === checkoutRequestId || t.id === checkoutRequestId);

    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    let licenseKey = null;
    if (txn.status === 'completed' && txn.buyerRegistered) {
      const buyers = await loadTemplateBuyers();
      const buyer = buyers.find(b => b.email.toLowerCase() === (txn.customerEmail || '').toLowerCase());
      if (buyer) licenseKey = buyer.licenseKey;
    }

    res.json({
      success: true,
      status: txn.status,
      checkoutRequestId: txn.checkoutRequestId,
      mpesaReceiptNumber: txn.mpesaReceiptNumber || null,
      amount: txn.amount,
      buyerRegistered: txn.buyerRegistered || false,
      license_key: licenseKey,
      subdomain: txn.subdomain || null,
      hostname: txn.hostname || null,
      blog_url: txn.blogUrl || null,
      tenant_id: txn.tenantId || null,
      provisioning: txn.provisionError ? 'failed' : (txn.provisioned ? 'ready' : 'pending'),
      createdAt: txn.createdAt
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// Public: Check if email already has a license
app.get('/api/payments/license/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const buyers = await loadTemplateBuyers();
    const buyer = buyers.find(b => b.email.toLowerCase() === email.toLowerCase());

    if (buyer) {
      // Only expose the license key to the authenticated buyer themselves.
      const authedEmail = (req.session?.user?.email || req.user?.email || '').toLowerCase();
      const isOwner = authedEmail && authedEmail === email.toLowerCase();
      const payload = { success: true, hasLicense: true };
      if (isOwner) payload.licenseKey = buyer.licenseKey;
      return res.json(payload);
    }
    res.json({ success: true, hasLicense: false });
  } catch (e) {
    res.status(500).json({ error: 'Failed to check license' });
  }
});

// ──────────────────────────────────────────────────────────────────────
// TENANCY — public config + custom-domain management
// ──────────────────────────────────────────────────────────────────────

// Public: what the frontend needs to render the blog it is serving.
app.get('/api/tenant-config', async (req, res) => {
  try {
    const tenant = req.tenant || tenancy.platformTenant();
    const settings = await readSettings();
    const blogInfo = settings.blogInfo || {};
    const author = settings.author || {};
    const platform = tenant.id === tenancy.PLATFORM_TENANT_ID;

    let domains = [];
    if (!platform) {
      domains = (await tenancy.store.listDomainsForTenant(tenant.id))
        .filter(domain => domain.status === 'active')
        .map(domain => ({
          hostname: domain.hostname,
          type: domain.type,
          isPrimary: Boolean(domain.isPrimary)
        }));
    }

    res.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        templateRef: tenant.templateRef || 'default',
        status: tenant.status || 'active',
        platform
      },
      hostname: req.get('host'),
      baseUrl: publicBaseUrl(req),
      primaryHostname: tenant.primaryHostname || (domains.find(d => d.isPrimary) || {}).hostname || null,
      blog: {
        title: blogInfo.title || author.name || tenant.name || 'Blog',
        description: blogInfo.description || author.bio || '',
        author: author.name || ''
      },
      domains
    });
  } catch (e) {
    console.error('Tenant config error:', e);
    res.status(500).json({ success: false, error: 'tenant_config_failed' });
  }
});

// Public: live subdomain availability for the checkout form.
app.get('/api/tenants/availability', subdomainLookupLimiter, async (req, res) => {
  const checked = tenancy.validateSubdomain(req.query.subdomain);
  if (!checked.valid) {
    return res.json({ success: true, available: false, error: checked.error, subdomain: String(req.query.subdomain || '') });
  }
  try {
    const availability = await tenancy.store.isSubdomainAvailable(checked.hostname);
    return res.json({
      success: true,
      available: availability.available,
      subdomain: checked.slug,
      hostname: checked.hostname,
      reason: availability.reason || null
    });
  } catch (e) {
    console.error('Subdomain availability error:', e);
    return res.status(500).json({ success: false, error: 'availability_failed' });
  }
});

// Auth: list the current tenant's domains with DNS instructions.
app.get('/api/tenant/domains', requireAuth, async (req, res) => {
  try {
    const tenant = await getManagedTenant(req);
    if (!tenant) return res.status(404).json({ success: false, error: 'no_tenant' });
    const domains = await tenancy.listTenantDomains(tenant.id);
    return res.json({
      success: true,
      tenant: { id: tenant.id, name: tenant.name },
      platformDomain: tenancy.PLATFORM_DOMAIN || null,
      customDomainTarget: tenancy.CUSTOM_DOMAIN_TARGET || null,
      serverIp: tenancy.SERVER_IP || null,
      primaryHostname: tenant.primaryHostname || null,
      domains
    });
  } catch (e) {
    console.error('List domains error:', e);
    return res.status(500).json({ success: false, error: 'list_domains_failed' });
  }
});

// Auth: connect a custom domain (starts in "pending" until DNS is verified).
app.post('/api/tenant/domains', requireAuth, async (req, res) => {
  try {
    const tenant = await getManagedTenant(req);
    if (!tenant) return res.status(404).json({ success: false, error: 'no_tenant' });
    const { hostname, makePrimary } = req.body || {};
    const result = await tenancy.addCustomDomain({ tenant, hostname, makePrimary: Boolean(makePrimary) });
    return res.json({ success: true, domain: result.domain, instructions: result.instructions });
  } catch (e) {
    const status = e.code === 'DOMAIN_TAKEN' ? 409 : 400;
    return res.status(status).json({ success: false, error: e.code || 'add_domain_failed', message: e.message });
  }
});

// Auth: verify DNS for one custom domain.
app.post('/api/tenant/domains/:id/verify', requireAuth, domainVerifyLimiter, async (req, res) => {
  try {
    const tenant = await getManagedTenant(req);
    if (!tenant) return res.status(404).json({ success: false, error: 'no_tenant' });
    const result = await tenancy.verifyCustomDomain({ tenantId: tenant.id, domainId: req.params.id });
    if (!result.verified && !result.alreadyActive) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'dns_not_verified',
        message: 'DNS records are not visible yet. Changes can take a few minutes to propagate.',
        check: result.check,
        instructions: result.instructions
      });
    }
    return res.json({
      success: true,
      verified: true,
      domain: result.domain,
      certificate: result.certificate || null,
      instructions: result.instructions
    });
  } catch (e) {
    const status = e.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ success: false, error: e.code || 'verify_failed', message: e.message });
  }
});

// Auth: choose which active domain is primary (others 301 to it).
app.post('/api/tenant/domains/:id/primary', requireAuth, async (req, res) => {
  try {
    const tenant = await getManagedTenant(req);
    if (!tenant) return res.status(404).json({ success: false, error: 'no_tenant' });
    const result = await tenancy.setPrimaryDomain({ tenantId: tenant.id, domainId: req.params.id });
    return res.json({ success: true, domain: result.domain, domains: result.domains });
  } catch (e) {
    const status = e.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ success: false, error: e.code || 'primary_failed', message: e.message });
  }
});

// Auth: disconnect a custom domain. Platform subdomains cannot be removed.
app.delete('/api/tenant/domains/:id', requireAuth, async (req, res) => {
  try {
    const tenant = await getManagedTenant(req);
    if (!tenant) return res.status(404).json({ success: false, error: 'no_tenant' });
    await tenancy.removeCustomDomain({ tenantId: tenant.id, domainId: req.params.id });
    return res.json({ success: true });
  } catch (e) {
    const status = e.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ success: false, error: e.code || 'remove_failed', message: e.message });
  }
});

// Seller/cron: re-check every pending custom domain and expire stale ones.
app.post('/api/tenant/domains/verify-pending', requireCronOrSeller, async (req, res) => {
  try {
    const expired = await tenancy.expireStalePendingDomains();
    const domains = await tenancy.store.loadDomains();
    const pending = domains.filter(domain => domain.type === 'custom' && domain.status === 'pending');
    const results = [];
    for (const domain of pending) {
      try {
        const result = await tenancy.verifyCustomDomain({
          tenantId: domain.tenantId,
          domainId: domain.id
        });
        results.push({ domainId: domain.id, hostname: domain.hostname, verified: Boolean(result.verified || result.alreadyActive) });
      } catch (e) {
        results.push({ domainId: domain.id, hostname: domain.hostname, verified: false, error: e.message });
      }
    }
    let certificates = { checked: 0, updated: [] };
    try {
      certificates = await tenancy.refreshDomainCertificates();
    } catch (e) {
      console.warn('[tenancy] certificate refresh failed:', e.message);
    }
    return res.json({
      success: true,
      checked: pending.length,
      results,
      expired: expired.expired.map(d => d.hostname),
      certificates
    });
  } catch (e) {
    console.error('Pending domain verification error:', e);
    return res.status(500).json({ success: false, error: 'verify_pending_failed' });
  }
});

// Shared-secret access for scheduled jobs (Vercel cron or external
// scheduler); falls back to a seller session for manual runs.
function isCronAuthorized(req) {
  const secret = String(process.env.CRON_SECRET || '');
  if (!secret) return false;
  const provided = String(req.get('x-cron-secret') || '');
  if (!provided || provided.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

function requireCronOrSeller(req, res, next) {
  if (isCronAuthorized(req)) return next();
  return requireAuth(req, res, () => requireSellerOnly(req, res, next));
}

// Retry paid-but-unprovisioned purchases. Safe to call repeatedly.
async function provisionRecoveryHandler(req, res) {
  try {
    const force = String(req.query.force || '') === '1';
    const result = await recoverPendingProvisioning({ force });
    return res.json({ success: true, ...result });
  } catch (e) {
    console.error('Provisioning recovery error:', e);
    return res.status(500).json({ success: false, error: 'provision_recovery_failed' });
  }
}
app.get('/api/admin/payments/provision-recovery', requireCronOrSeller, provisionRecoveryHandler);
app.post('/api/admin/payments/provision-recovery', requireCronOrSeller, provisionRecoveryHandler);

// Caddy on-demand TLS "ask" endpoint. Only known, eligible hostnames get certs.
app.get('/internal/tls/ask', async (req, res) => {
  const hostname = String(req.query.domain || '').toLowerCase();
  if (!hostname) return res.status(400).send('missing domain');
  try {
    const eligible = await tenancy.isCertificateEligible(hostname);
    if (!eligible) return res.status(404).send('unknown hostname');
    return res.status(200).send('ok');
  } catch (e) {
    return res.status(500).send('error');
  }
});

// ──────────────────────────────────────────────────────────────────────
// TEMPLATE PURCHASE — creates a buyer account with TEMPLATE_BUYER role
// ──────────────────────────────────────────────────────────────────────
app.post('/api/template/purchase', async (req, res) => {
  let reservedHostname = null;
  let reservedEmail = null;
  try {
    const { name, email, phone, payment_method, card_token, checkoutRequestId, subdomain } = req.body || {};
    if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email are required.' });

    let purchaseSubdomain = subdomain;
    let paymentKey = null;
    let mpesaTxn = null;

    // ── Payment Validation ──
    if (payment_method === 'mpesa') {
      // M-Pesa: validate via checkoutRequestId
      if (!checkoutRequestId) {
        return res.status(400).json({ success: false, message: 'Missing payment reference.' });
      }
      const txns = await loadMpesaTransactions();
      const txn = txns.find(t => t.checkoutRequestId === checkoutRequestId || t.id === checkoutRequestId);
      if (!txn) {
        return res.status(400).json({ success: false, message: 'Payment transaction not found.' });
      }
      if (txn.status !== 'completed') {
        return res.status(400).json({ success: false, message: 'Payment has not been completed.' });
      }
      if ((txn.customerEmail || '').toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ success: false, message: 'Payment email mismatch.' });
      }
      mpesaTxn = txn;
      purchaseSubdomain = txn.subdomain || subdomain;
      paymentKey = txn.paymentKey
        || (txn.mpesaReceiptNumber ? `mpesa:${txn.mpesaReceiptNumber}` : `mpesa:${checkoutRequestId}`);
    } else {
      // Card: simulate payment validation with delay
      if (!card_token) {
        return res.status(400).json({ success: false, message: 'Missing card payment token.' });
      }
      // Simulate payment processing delay
      await new Promise(r => setTimeout(r, 2000));

      // Validate card token format (basic check)
      if (!card_token.startsWith('tok_')) {
        return res.status(400).json({ success: false, message: 'Invalid card payment token.' });
      }

      // Simulate 5% failure rate for realism
      const cardHash = card_token.split('_')[1] || '';
      const failSim = parseInt(cardHash.slice(-2), 36) % 20 === 0;
      if (failSim) {
        return res.status(400).json({ success: false, message: 'Card payment was declined. Please try a different card.' });
      }
    }

    // ── Subdomain selection ──
    // M-Pesa reuses the subdomain the customer chose when the STK push was
    // initiated (and already holds its reservation). Card payments arrive in a
    // single request, so validate and reserve here before touching the buyer.
    let chosenSlug = null;
    let chosenHostname = null;
    if (mpesaTxn) {
      chosenSlug = mpesaTxn.subdomain || null;
      chosenHostname = mpesaTxn.hostname || (chosenSlug && tenancy.PLATFORM_DOMAIN
        ? `${chosenSlug}.${tenancy.PLATFORM_DOMAIN}`
        : chosenSlug);
    } else if (purchaseSubdomain !== undefined && purchaseSubdomain !== null && String(purchaseSubdomain).trim() !== '') {
      const slugCheck = tenancy.validateSubdomain(purchaseSubdomain);
      if (!slugCheck.valid) return res.status(400).json({ success: false, message: slugCheck.error });
      const availability = await tenancy.store.isSubdomainAvailable(slugCheck.hostname);
      if (!availability.available) {
        return res.status(409).json({ success: false, message: 'That subdomain is already taken or reserved.' });
      }
      const reservation = await tenancy.store.reserveSubdomain({
        subdomain: slugCheck.hostname,
        email,
        ttlMs: tenancy.RESERVATION_TTL_MS
      });
      if (!reservation.ok) return res.status(409).json({ success: false, message: reservation.error });
      chosenSlug = slugCheck.slug;
      chosenHostname = slugCheck.hostname;
      reservedHostname = slugCheck.hostname;
      reservedEmail = email;
    }

    const buyers = await loadTemplateBuyers();
    if (buyers.find(b => b.email.toLowerCase() === email.toLowerCase())) {
      if (reservedHostname) {
        await tenancy.store.releaseReservation(reservedHostname, { email: reservedEmail }).catch(() => {});
        reservedHostname = null;
      }
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    const generateSegment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const licenseKey = `BLG-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
    const id = (typeof ObjectId !== 'undefined') ? new ObjectId().toString() : Date.now().toString();

    const buyer = {
      id, name, email, phone: phone || '',
      licenseKey, purchaseDate: new Date().toISOString(),
      paymentMethod: payment_method || 'mpesa',
      status: 'active'
    };
    buyers.push(buyer);
    await saveTemplateBuyers(buyers);

    // Auto-create a user account for the buyer so they can log in
    const users = await loadUsers();
    let existingKey = findUserKeyByEmail(users, email);
    if (!existingKey) {
      let buyerUsername = email.split('@')[0];
      if (findUserKey(users, buyerUsername)) {
        buyerUsername = `${buyerUsername}_${Math.random().toString(36).substring(2, 6)}`;
      }
      // Use license key as initial password hash (buyer will set real password via reset)
      const tempHash = await bcrypt.hash(licenseKey, BCRYPT_ROUNDS);
      users[buyerUsername] = {
        name: name || buyerUsername,
        email: email,
        passwordHash: tempHash,
        active: true,
        role: 'TEMPLATE_BUYER',
        rights: ['view_template', 'manage_own_posts', 'manage_profile'],
        buyerId: id,
        createdAt: new Date().toISOString()
      };
      await saveUsers(users);
    }

    // Send license key via email
    sendLicenseEmail(buyer);

    // Provision the blog (idempotent for M-Pesa where the callback may have
    // already created it). This is the only addition to the purchase flow.
    let tenantResult = null;
    if (chosenSlug) {
      const txnForTenant = mpesaTxn || {
        id,
        customerName: name,
        customerEmail: email
      };
      txnForTenant.subdomain = chosenSlug;
      txnForTenant.hostname = chosenHostname;
      txnForTenant.paymentKey = paymentKey || `card:${checkoutRequestId || card_token}`;
      tenantResult = await finalizeTenantPurchase(txnForTenant, buyer);

      // Persist provisioning state on the M-Pesa transaction so the status
      // endpoint can report the blog URL immediately after purchase.
      if (mpesaTxn) {
        const txns = await loadMpesaTransactions();
        const idx = txns.findIndex(t => t.id === mpesaTxn.id ||
          (t.checkoutRequestId && t.checkoutRequestId === mpesaTxn.checkoutRequestId));
        if (idx !== -1) {
          txns[idx] = {
            ...txns[idx],
            subdomain: chosenSlug,
            hostname: chosenHostname,
            paymentKey: txnForTenant.paymentKey,
            tenantId: tenantResult?.tenant?.id || txns[idx].tenantId || null,
            blogUrl: tenantResult?.blogUrl || txns[idx].blogUrl || null,
            provisioned: Boolean(tenantResult)
          };
          await saveMpesaTransactions(txns);
        }
      }
    }

    res.json({
      success: true,
      license_key: licenseKey,
      buyer,
      subdomain: chosenSlug,
      blog_url: tenantResult?.blogUrl || null,
      tenant_id: tenantResult?.tenant?.id || null
    });
  } catch (e) {
    console.error('Template purchase error:', e);
    if (reservedHostname) {
      await tenancy.store.releaseReservation(reservedHostname, { email: reservedEmail }).catch(() => {});
    }
    res.status(500).json({ success: false, message: 'Purchase failed. Please try again.' });
  }
});

// ──────────────────────────────────────────────────────────────────────
// LICENSE KEY LOGIN — template buyers log in with email + license key
// ──────────────────────────────────────────────────────────────────────
app.post('/auth/license-login', async (req, res) => {
  try {
    const { email, licenseKey } = req.body || {};
    if (!email || !licenseKey) return res.status(400).json({ error: 'Email and license key are required.' });

    const buyers = await loadTemplateBuyers();
    const buyer = buyers.find(b => b.email.toLowerCase() === email.toLowerCase() && b.licenseKey === licenseKey);
    if (!buyer) return res.status(401).json({ error: 'Invalid email or license key.' });
    if (buyer.status === 'suspended') return res.status(403).json({ error: 'account_suspended', message: buyer.suspensionReason || 'Your account has been suspended.' });

    // Find or create the user account
    const users = await loadUsers();
    let userKey = findUserKeyByEmail(users, email);

    if (!userKey) {
      let buyerUsername = email.split('@')[0];
      if (findUserKey(users, buyerUsername)) {
        buyerUsername = `${buyerUsername}_${Math.random().toString(36).substring(2, 6)}`;
      }
      const tempHash = await bcrypt.hash(licenseKey, BCRYPT_ROUNDS);
      users[buyerUsername] = {
        name: buyer.name || buyerUsername,
        email: email,
        passwordHash: tempHash,
        active: true,
        role: 'TEMPLATE_BUYER',
        rights: ['view_template', 'manage_own_posts', 'manage_profile'],
        buyerId: buyer.id,
        createdAt: new Date().toISOString()
      };
      await saveUsers(users);
      userKey = buyerUsername;
    }

    // Check if user is suspended
    const user = users[userKey];
    if (user && user.active === false) {
      return res.status(403).json({ error: 'account_suspended', message: user.suspensionReason || 'Your account has been suspended.' });
    }

    const token = jwt.sign({
      username: userKey,
      email: user.email,
      name: user.name,
      role: user.role || 'TEMPLATE_BUYER',
      tenantId: user.tenantId || null
    }, JWT_SECRET, { expiresIn: '8h' });

    req.session.user = {
      username: userKey,
      email: user.email,
      name: user.name,
      role: user.role || 'TEMPLATE_BUYER',
      tenantId: user.tenantId || null
    };

    return req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      return res.json({ success: true, token, user: req.session.user });
    });
  } catch (e) {
    console.error('License login error:', e);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ──────────────────────────────────────────────────────────────────────
// SENSITIVE CONTENT WARNINGS
// ──────────────────────────────────────────────────────────────────────
const SENSITIVE_KEYWORDS = [
  'murder', 'kill', 'killing', 'homicide', 'assassinate',
  'terrorist', 'terrorism', 'bomb', 'bombing',
  'hate speech', 'racial slur', 'ethnic cleansing',
  'self-harm', 'suicide', 'suicidal',
  'sexual assault', 'rape', 'molestation',
  'human trafficking', 'drug trafficking',
  'mass shooting', 'school shooting'
];

function detectSensitiveContent(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.filter(kw => lower.includes(kw));
}

// Pre-publish content warning check endpoint
app.post('/api/content/check-sensitive', requireAuth, (req, res) => {
  const { title, content } = req.body || {};
  const combined = `${title || ''} ${content || ''}`;
  const matches = detectSensitiveContent(combined);
  if (matches.length > 0) {
    return res.json({ success: true, sensitive: true, keywords: matches });
  }
  res.json({ success: true, sensitive: false, keywords: [] });
});

// ──────────────────────────────────────────────────────────────────────
// ACCOUNT SUSPENSION (Admin only)
// ──────────────────────────────────────────────────────────────────────
app.post('/api/admin/suspend-user', requireAdmin, async (req, res) => {
  try {
    const { username, reason } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username is required.' });

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!userKey) return res.status(404).json({ error: 'User not found.' });

    // Cannot suspend the main admin
    if (users[userKey].role === 'ADMIN' && !users[userKey].buyerId) {
      return res.status(403).json({ error: 'Cannot suspend the main admin account.' });
    }

    users[userKey].active = false;
    users[userKey].suspendedAt = new Date().toISOString();
    users[userKey].suspensionReason = reason || 'Suspended by administrator.';
    const tenantId = users[userKey].tenantId || null;
    await saveUsers(users);

    // Stop serving the tenant's blog while the account is suspended.
    await setTenantServing(tenantId, false, reason);

    // Also suspend the buyer record if linked
    if (users[userKey].buyerId) {
      const buyers = await loadTemplateBuyers();
      const buyer = buyers.find(b => b.id === users[userKey].buyerId);
      if (buyer) {
        buyer.status = 'suspended';
        buyer.suspensionReason = reason || 'Suspended by administrator.';
        buyer.suspendedAt = new Date().toISOString();
        await saveTemplateBuyers(buyers);
      }
    }

    res.json({ success: true, message: `User ${userKey} has been suspended.` });
  } catch (e) {
    console.error('Suspend user error:', e);
    res.status(500).json({ error: 'Failed to suspend user.' });
  }
});

app.post('/api/admin/unsuspend-user', requireAdmin, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username is required.' });

    const users = await loadUsers();
    const userKey = findUserKey(users, username);
    if (!userKey) return res.status(404).json({ error: 'User not found.' });

    users[userKey].active = true;
    delete users[userKey].suspendedAt;
    delete users[userKey].suspensionReason;
    const tenantId = users[userKey].tenantId || null;
    await saveUsers(users);

    await setTenantServing(tenantId, true);

    if (users[userKey].buyerId) {
      const buyers = await loadTemplateBuyers();
      const buyer = buyers.find(b => b.id === users[userKey].buyerId);
      if (buyer) {
        buyer.status = 'active';
        delete buyer.suspensionReason;
        delete buyer.suspendedAt;
        await saveTemplateBuyers(buyers);
      }
    }

    res.json({ success: true, message: `User ${userKey} has been unsuspended.` });
  } catch (e) {
    console.error('Unsuspend user error:', e);
    res.status(500).json({ error: 'Failed to unsuspend user.' });
  }
});

// Get sensitive content keyword list (for frontend warning)
app.get('/api/content/sensitive-keywords', (req, res) => {
  res.json({ success: true, keywords: SENSITIVE_KEYWORDS });
});

// Error handler must be last middleware to catch errors from all routes
app.use(errorHandler);

// Long-running processes (not Vercel functions) expire stale pending domain
// claims, retry DNS verification and resume interrupted provisioning once an
// hour. On Vercel, call POST /api/tenant/domains/verify-pending and
// POST /api/admin/payments/provision-recovery from a cron job instead.
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  const TENANCY_JOB_INTERVAL_MS = 60 * 60 * 1000;
  const timer = setInterval(async () => {
    try {
      const expired = await tenancy.expireStalePendingDomains();
      if (expired.expired.length) {
        console.log('[tenancy] expired stale pending domains:', expired.expired.map(d => d.hostname));
      }
    } catch (e) {
      console.warn('[tenancy] stale domain job failed:', e.message);
    }
    try {
      const certificates = await tenancy.refreshDomainCertificates();
      if (certificates.updated.length) {
        console.log('[tenancy] certificate refresh:', certificates.updated);
      }
    } catch (e) {
      console.warn('[tenancy] certificate refresh job failed:', e.message);
    }
    try {
      const recovered = await recoverPendingProvisioning();
      if (recovered.provisioned || recovered.failed) {
        console.log('[tenancy] provisioning recovery:', recovered);
      }
    } catch (e) {
      console.warn('[tenancy] provisioning recovery job failed:', e.message);
    }
  }, TENANCY_JOB_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

// Tests import the app and bind their own ephemeral port (DISABLE_LISTEN=true)
if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_LISTEN !== 'true') {
  app.listen(PORT, () => console.log(`Auth server listening on http://localhost:${PORT}`));
}
