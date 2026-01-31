require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { put } = require('@vercel/blob');
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;
 const { kv } = require('@vercel/kv'); // For Vercel deployment data persistence
 const errorHandler = require('./middleware/errorHandler');

// Session store for Vercel KV with fallback
const { EventEmitter } = require('events');

class VercelKVStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.prefix = options.prefix || 'session:';
    this.kvAvailable = false;

    // Test KV availability
    try {
      if (kv && typeof kv.get === 'function') {
        this.kvAvailable = true;
      }
    } catch (e) {
      console.warn('Vercel KV not available, using memory store fallback');
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

// MongoDB connection - lazy loaded for serverless
let db;
async function getMongoDB() {
  if (db) return db;
  if (!process.env.MONGODB_URI) return null;

  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    db = client.db('blog');
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return null;
  }
}

// Cloudinary configuration
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'cloudinary') {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Security middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://apis.google.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use(errorHandler);

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
    const hash = await bcrypt.hash(seedPwd, 10);
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

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(__dirname, 'users.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');
const CATEGORIES_FILE = path.join(__dirname, 'categories.json');
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');
const SECURITY_LOGS_FILE = path.join(__dirname, 'security_logs.json');
const COMMENTS_FILE = path.join(__dirname, 'comments.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || '';
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

// Idle timeout configuration (in minutes)
const ADMIN_IDLE_TIMEOUT_MINUTES = parseInt(process.env.ADMIN_IDLE_TIMEOUT_MINUTES) || 10;
const ADMIN_IDLE_TIMEOUT_MS = ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000;
const ADMIN_IDLE_WARNING_MS = (ADMIN_IDLE_TIMEOUT_MINUTES - 1) * 60 * 1000; // Warning at 1 minute before timeout

// Set dev admin password for development
if (process.env.NODE_ENV !== 'production') {
  process.env.DEV_ADMIN_PASSWORD = 'Mwitijulius7@Jm';
}

if (!CLIENT_ID) {
  console.warn('WARNING: GOOGLE_CLIENT_ID is not set in .env - server verification will fail');
}

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// CORS configuration
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'https://zedong254personal-blog-aq9djywsi.vercel.app',
    'https://peronal-blog-hh0dt912e-juliusmwiti-solutechcos-projects.vercel.app'
  ];
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

app.use(express.json());
app.use(express.static(__dirname));
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
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Allow HTTP for production environments without HTTPS
    httpOnly: true,
    sameSite: 'lax', // Use 'lax' for better compatibility across environments
    maxAge: 24 * 60 * 60 * 1000
  },
  name: 'sessionId',
  store: createSessionStore()
}));

app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 },
  useTempFiles: false,
  createParentPath: true
}));

async function loadUsers() {
  try {
    // Try MongoDB first if available
    const db = await getMongoDB();
    if (db) {
      try {
        const users = await db.collection('users').find({}).toArray();
        if (users && users.length > 0) {
          const result = {};
          users.forEach(u => result[u.username] = u);
          console.log('Loaded users from MongoDB:', Object.keys(result).length, 'users');
          return result;
        }
      } catch (mongoErr) {
        console.warn('MongoDB query error:', mongoErr.message);
      }
    }
    
    // Try Vercel KV if available
    if (process.env.VERCEL && kv) {
      try {
        const data = await kv.get('users');
        if (data) {
          const parsed = JSON.parse(data);
          console.log('Loaded users from Vercel KV:', Object.keys(parsed).length, 'users');
          return parsed;
        }
      } catch (kvErr) {
        console.warn('Vercel KV error:', kvErr.message);
      }
    }
    
    // Fall back to local file
    try {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
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
  try {
    if (db) {
      await db.collection('users').deleteMany({});
      const userArray = Object.entries(users).map(([username, data]) => ({ username, ...data }));
      if (userArray.length > 0) {
        await db.collection('users').insertMany(userArray);
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
  }
}

async function loadPosts() {
  try {
    // Try MongoDB first if available
    const db = await getMongoDB();
    if (db) {
      try {
        const posts = await db.collection('posts').find({}).sort({ date: -1 }).toArray();
        if (posts && posts.length > 0) {
          console.log('Loaded posts from MongoDB:', posts.length, 'posts');
          return posts.map(p => ({ ...p, id: p._id || p.id }));
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
          return parsed;
        }
      } catch (kvErr) {
        console.warn('Vercel KV posts error:', kvErr.message);
      }
    }
    
    // Fall back to local file
    try {
      const data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')) || [];
      console.log('Loaded posts from local file:', data.length, 'posts');
      return data;
    } catch (fileErr) {
      console.warn('Local posts file error:', fileErr.message);
      return [];
    }
  } catch (e) {
    console.error('Fatal error in loadPosts:', e);
    return [];
  }
}

async function savePosts(posts) {
  try {
    if (db) {
      await db.collection('posts').deleteMany({});
      if (posts.length > 0) {
        await db.collection('posts').insertMany(posts.map(p => ({ ...p, _id: p.id })));
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('posts', JSON.stringify(posts));
      return;
    }
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
  } catch (e) {
    console.error('Save posts error:', e);
  }
}

async function loadCategories() {
  try {
    // Try MongoDB first if available
    const db = await getMongoDB();
    if (db) {
      try {
        const categories = await db.collection('categories').find({}).toArray();
        if (categories && Array.isArray(categories) && categories.length > 0) {
          console.log('Loaded categories from MongoDB:', categories.length);
          return categories.map(c => ({ ...c, id: String(c._id || c.id) }));
        }
      } catch (mongoErr) {
        console.warn('MongoDB categories query error:', mongoErr.message);
      }
    }
    
    // Try Vercel KV if available
    if (process.env.VERCEL && kv) {
      try {
        const data = await kv.get('categories');
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            console.log('Loaded categories from Vercel KV:', parsed.length);
            return parsed.map(c => ({ ...c, id: String(c.id) }));
          }
        }
      } catch (kvErr) {
        console.warn('Vercel KV categories error:', kvErr.message);
      }
    }
    
    // Fall back to local file
    try {
      const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
      const cats = JSON.parse(data) || [];
      if (Array.isArray(cats) && cats.length > 0) {
        console.log('Loaded categories from local file:', cats.length);
        return cats.map(c => ({ ...c, id: String(c.id) }));
      } else {
        console.log('No categories in local file');
        return [];
      }
    } catch (fileErr) {
      console.warn('Local categories file error:', fileErr.message);
      return [];
    }
  } catch (e) {
    console.error('Fatal error in loadCategories:', e);
    return [];
  }
}

async function saveCategories(categories) {
  try {
    if (!Array.isArray(categories)) {
      console.error('saveCategories: categories is not an array', typeof categories);
      throw new Error('categories must be an array');
    }
    
    if (db) {
      console.log('Saving to MongoDB:', categories.length);
      await db.collection('categories').deleteMany({});
      if (categories.length > 0) {
        const docsToInsert = categories.map(c => ({ ...c, _id: c.id }));
        const result = await db.collection('categories').insertMany(docsToInsert);
        console.log('MongoDB save result:', result.insertedCount);
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      console.log('Saving to Vercel KV:', categories.length);
      await kv.set('categories', JSON.stringify(categories));
      return;
    }
    console.log('Saving to file system:', categories.length);
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
  } catch (e) {
    console.error('Save categories error:', e);
    throw e;
  }
}

async function loadAnalytics() {
  try {
    const db = await getMongoDB();
    if (db) {
      const result = await db.collection('analytics').findOne({ type: 'data' });
      return result?.data || { pageViews: [], postViews: [], interactions: [] };
    }
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8')) || { pageViews: [], postViews: [], interactions: [] };
  } catch (e) {
    return { pageViews: [], postViews: [], interactions: [] };
  }
}

async function saveAnalytics(analytics) {
  try {
    if (db) {
      await db.collection('analytics').updateOne(
        { type: 'data' },
        { $set: { data: analytics, updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    }
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
  } catch (e) {
    console.error('Save analytics error:', e);
  }
}

async function loadSecurityLogs() {
  try {
    const db = await getMongoDB();
    if (db) {
      const result = await db.collection('security').findOne({ type: 'logs' });
      return result?.logs || [];
    }
    return JSON.parse(fs.readFileSync(SECURITY_LOGS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

async function saveSecurityLogs(logs) {
  try {
    if (db) {
      await db.collection('security').updateOne(
        { type: 'logs' },
        { $set: { logs, updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    }
    if (process.env.VERCEL) return;
    fs.writeFileSync(SECURITY_LOGS_FILE, JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error('Save security logs error:', e);
  }
}

async function loadComments() {
  try {
    const db = await getMongoDB();
    if (db) {
      const comments = await db.collection('comments').find({}).toArray();
      return comments.map(c => ({ ...c, id: c._id || c.id }));
    }
    return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

async function saveComments(comments) {
  try {
    if (db) {
      await db.collection('comments').deleteMany({});
      if (comments.length > 0) {
        await db.collection('comments').insertMany(comments.map(c => ({ ...c, _id: c.id })));
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('comments', JSON.stringify(comments));
      return;
    }
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2));
  } catch (e) {
    console.error('Save comments error:', e);
  }
}

async function loadSubscriptions() {
  try {
    const db = await getMongoDB();
    if (db) {
      const subscriptions = await db.collection('subscriptions').find({}).toArray();
      return subscriptions.map(s => ({ ...s, id: s._id || s.id }));
    }
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

async function saveSubscriptions(subscriptions) {
  try {
    if (db) {
      await db.collection('subscriptions').deleteMany({});
      if (subscriptions.length > 0) {
        await db.collection('subscriptions').insertMany(subscriptions.map(s => ({ ...s, _id: s.id })));
      }
      return;
    }
    if (process.env.VERCEL && kv) {
      await kv.set('subscriptions', JSON.stringify(subscriptions));
      return;
    }
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
  } catch (e) {
    console.error('Save subscriptions error:', e);
  }
}

// Simple AES-256-GCM encryption/decryption using SESSION_SECRET as key material
function getEncKey() {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}
function encryptText(plain) {
  try {
    const key = getEncKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  } catch (e) {
    return '';
  }
}
function decryptText(encStr) {
  try {
    if (!encStr) return '';
    const buf = Buffer.from(encStr, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const key = getEncKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    return '';
  }
}

function requireAuth(req, res, next) {
  console.log('Auth check - Session:', !!req.session, 'User:', !!req.session?.user);

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
        role: decoded.role
      };
      return next();
    } catch (e) {
      console.log('JWT verification failed in requireAuth:', e.message);
    }
  }

  return res.status(401).json({ error: 'not authenticated' });
}

// Middleware to check idle timeout for admin routes
function checkIdleTimeout(req, res, next) {
  // Auto-verify/refresh for localhost
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const host = req.get('host') || '';
  const isLocalhost = ip.includes('127.0.0.1') || ip === '::1' || host.includes('localhost') || host.includes('127.0.0.1') || host.includes('::1');
  if (isLocalhost) {
    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
    return next();
  }

  if (req.session && req.session.adminKeyVerified) {
    const now = Date.now();
    const verifiedAt = req.session.adminKeyVerifiedAt || 0;
    const timeSinceVerification = now - verifiedAt;

    if (timeSinceVerification > ADMIN_IDLE_TIMEOUT_MS) {
      // Clear verification on timeout
      req.session.adminKeyVerified = false;
      req.session.adminKeyVerifiedAt = null;
      return res.status(401).json({ error: 'session_expired', message: 'Your session has expired due to inactivity' });
    }
  }
  next();
}

// Middleware to update admin activity timestamp
function updateAdminActivity(req, res, next) {
  if (req.session && req.session.adminKeyVerified) {
    req.session.adminKeyVerifiedAt = Date.now();
  }
  next();
}

 const requireAdmin = [requireAuth, checkIdleTimeout, updateAdminActivity];

// Admin: Users API (admin-only)
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const users = await loadUsers();
    const list = Object.entries(users || {}).map(([username, data]) => ({
      username,
      name: data?.name || '',
      email: data?.email || '',
      role: data?.role || 'USER',
      active: data?.active ?? true
    }));
    res.json({ users: list });
  } catch (e) {
    console.error('Load users error:', e);
    res.status(500).json({ error: 'failed_to_load_users' });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing_username_or_password' });
    const users = await loadUsers();
    if (users && users[username]) return res.status(400).json({ error: 'user_exists' });
    const hash = await bcrypt.hash(password, 10);
    users[username] = { name: name || '', email: email || '', passwordHash: hash, active: true, role: role || 'USER' };
    await saveUsers(users);
    return res.json({ success: true, user: { username, name: users[username].name, email: users[username].email, role: users[username].role } });
  } catch (e) {
    console.error('Create user error:', e);
    return res.status(500).json({ error: 'failed_to_create_user' });
  }
});

// PUT /api/users/:username - Update user status (super admin only)
app.put('/api/users/:username', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    const { active, role } = req.body || {};
    
    // Check if requester is super admin (admin user)
    const requestUser = req.session?.user || req.user;
    if (!requestUser || requestUser.username !== 'admin') {
      return res.status(403).json({ error: 'only_super_admin_can_manage_users' });
    }
    
    // Prevent deactivating the only super admin
    if (username === 'admin' && active === false) {
      return res.status(400).json({ error: 'cannot_deactivate_super_admin' });
    }
    
    const users = await loadUsers();
    if (!users || !users[username]) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    
    // Update user properties
    if (active !== undefined) {
      users[username].active = active;
    }
    if (role !== undefined && role !== 'ADMIN') {
      // Only allow changing roles if not the super admin
      users[username].role = role;
    }
    
    await saveUsers(users);
    return res.json({ 
      success: true, 
      user: { 
        username, 
        name: users[username].name, 
        email: users[username].email, 
        role: users[username].role,
        active: users[username].active
      } 
    });
  } catch (e) {
    console.error('Update user error:', e);
    return res.status(500).json({ error: 'failed_to_update_user' });
  }
});

// POST /api/users/:username/admin-key - Set user's admin key (user can set their own or admin can set for others)
app.post('/api/users/:username/admin-key', async (req, res) => {
  try {
    const { username } = req.params;
    const { adminKey } = req.body || {};
    
    if (!adminKey || String(adminKey).length === 0) {
      return res.status(400).json({ error: 'admin_key_required' });
    }
    
    // Check if user is setting their own key or if requester is admin
    const requestUser = req.session?.user || req.user;
    if (!requestUser || (requestUser.username !== username && requestUser.username !== 'admin')) {
      return res.status(403).json({ error: 'cannot_set_other_users_admin_key' });
    }
    
    const users = await loadUsers();
    if (!users || !users[username]) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    
    // Hash the admin key
    const keyHash = await bcrypt.hash(String(adminKey), 10);
    users[username].adminKeyHash = keyHash;
    users[username].adminKeySet = true;
    
    await saveUsers(users);
    return res.json({ success: true, message: 'Admin key set successfully' });
  } catch (e) {
    console.error('Error setting admin key:', e);
    return res.status(500).json({ error: 'failed_to_set_admin_key' });
  }
});

// POST /api/users/:username/verify-admin-key - Verify user's admin key
app.post('/api/users/:username/verify-admin-key', async (req, res) => {
  try {
    const { username } = req.params;
    const { adminKey } = req.body || {};
    
    if (!adminKey) {
      return res.status(400).json({ error: 'admin_key_required' });
    }
    
    const users = await loadUsers();
    if (!users || !users[username]) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    
    const user = users[username];
    
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

// Temporary migration endpoint - REMOVE AFTER USE
app.post('/migrate-users', async (req, res) => {
  try {
    // Only allow in development or with admin auth
    if (process.env.NODE_ENV === 'production' && !req.session?.user?.role === 'ADMIN') {
      return res.status(403).json({ error: 'not authorized' });
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    await saveUsers(users);
    return res.json({ success: true, migrated: Object.keys(users) });
  } catch (e) {
    return res.status(500).json({ error: 'migration failed', details: e.message });
  }
});

// Auth routes
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing credentials' });

  const users = await loadUsers();
  const user = users[username];

  // Check for dev admin credentials (admin/password)
  // Allow if explicitly configured via env var, OR if running in non-production with default 'password'
  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV !== 'production';
  const devPwd = process.env.DEV_ADMIN_PASSWORD || 'password';
  const isDevAuth = (isDev && username === 'admin' && password === devPwd);
  const isEnvAuth = (process.env.DEV_ADMIN_PASSWORD && username === 'admin' && password === process.env.DEV_ADMIN_PASSWORD);

  // Temporary fallback: allow Mwitijulius7 login with Mwitijulius7@Jm if no users exist in production
  const isTempAuth = false;

  if (isDevAuth || isEnvAuth) {
    // Generate JWT token for dev admin
    const token = jwt.sign({
      username: 'admin',
      email: (user && user.email) || process.env.ALLOWED_EMAIL || 'admin@example.com',
      name: (user && user.name) || 'Admin',
      role: (user && user.role) || 'ADMIN'
    }, JWT_SECRET, { expiresIn: '24h' });

    console.log('Login successful for admin (dev password), JWT token generated');

    // Ensure session-based auth works without JWT header
    req.session.user = {
      username: 'admin',
      email: (user && user.email) || process.env.ALLOWED_EMAIL || 'admin@example.com',
      name: (user && user.name) || 'Admin',
      role: (user && user.role) || 'ADMIN'
    };

    // Auto-verify admin key for localhost
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const host = req.get('host') || '';
    if (ip === '127.0.0.1' || ip === '::1' || host.includes('localhost') || host.includes('127.0.0.1')) {
      req.session.adminKeyVerified = true;
      req.session.adminKeyVerifiedAt = Date.now();
    }

    return res.json({
      success: true,
      token,
      user: req.session.user
    });
  }

  // Temporary login path removed for security

  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  // Check if user is active
  if (user.active === false) return res.status(401).json({ error: 'account disabled' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  // Generate JWT token
  const token = jwt.sign({
    username: username,
    email: user.email,
    name: user.name,
    role: user.role || 'USER'
  }, JWT_SECRET, { expiresIn: '24h' });

  console.log('Login successful, JWT token generated for:', username, 'Role:', user.role || 'USER');

  // Ensure session-based auth works without JWT header
  req.session.user = {
    username: username,
    email: user.email,
    name: user.name,
    role: user.role || 'USER'
  };

  // Auto-verify admin key for localhost
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const host = req.get('host') || '';
  if (ip === '127.0.0.1' || ip === '::1' || host.includes('localhost') || host.includes('127.0.0.1')) {
    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
  }

  return res.json({
    success: true,
    token,
    user: req.session.user
  });
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
      console.log('JWT token verified for setup:', decoded.username);
    } catch (e) {
      console.error('JWT verification failed:', e.message);
    }
  }

  if (hasAny && !isAuthenticated) {
    return res.status(401).json({ error: 'not authenticated' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    users[username] = { name: name || 'Admin', email: email || '', passwordHash: hash };
    await saveUsers(users);
    return res.json({ success: true, user: { username, name: users[username].name, email: users[username].email } });
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
      console.log('JWT token verified for user:', decoded.username);
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
  console.log('Logout requested - Session before destroy:', !!req.session, 'User:', !!req.session?.user);
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'failed to logout' });
    }
    console.log('Session destroyed successfully');
    res.clearCookie('sessionId'); // Clear the correct cookie name
    return res.json({ success: true });
  });
});

app.post('/auth/google', async (req, res) => {
  const { credential, id_token } = req.body;
  const token = credential || id_token; // Support both new and old formats
  
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

    req.session.user = {
      email: payload.email,
      name: payload.name || 'Google User'
    };

    // For Vercel, also return a simple token
    let authToken = '';
    if (process.env.VERCEL) {
      const tokenData = `${payload.email}|${Date.now()}`;
      authToken = Buffer.from(tokenData).toString('base64');
    }

    return res.json({ 
      success: true, 
      email: payload.email, 
      name: payload.name,
      token: authToken
    });
  } catch (e) {
    console.error('Google auth error:', e);
    return res.status(500).json({ error: 'verification failed' });
  }
});

// Forgot password endpoint
app.post('/auth/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'missing email' });

  try {
    const users = await loadUsers();
    const targetUser = Object.values(users).find(u => u.email === email);

    // Resolve admin email: prefer admin user email, then settings.author.email, then ALLOWED_EMAIL, else requester email
    let adminEmail = '';
    try {
      adminEmail = (users['admin'] && users['admin'].email) ? users['admin'].email : '';
      if (!adminEmail) {
        const settings = readSettings();
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

    // Store token temporarily (in production, use Redis or database)
    if (!global.resetTokens) global.resetTokens = {};
    global.resetTokens[resetToken] = { username: targetUser.username, expires: Date.now() + 24 * 60 * 60 * 1000 }; // 24 hours

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
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'missing token or password' });

  try {
    // Verify token
    if (!global.resetTokens || !global.resetTokens[token]) {
      return res.status(400).json({ error: 'invalid or expired token' });
    }

    const tokenInfo = global.resetTokens[token];
    if (Date.now() > tokenInfo.expires) {
      delete global.resetTokens[token];
      return res.status(400).json({ error: 'token expired' });
    }

    // Update user password
    const users = await loadUsers();
    const user = users[tokenInfo.username];
    if (!user) return res.status(404).json({ error: 'user not found' });

    const hash = await bcrypt.hash(password, 10);
    user.passwordHash = hash;
    await saveUsers(users);

    // Clean up token
    delete global.resetTokens[token];

    return res.json({ success: true, message: 'password reset successfully' });
  } catch (e) {
    console.error('Reset password error:', e);
    return res.status(500).json({ error: 'failed to reset password' });
  }
});

// Posts API
app.get('/api/posts', async (req, res) => {
  const posts = await loadPosts();
  return res.json({ posts });
});

app.get('/api/posts/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const posts = await loadPosts();
  const post = posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  return res.json({ post });
});

app.post('/api/posts', requireAdmin, async (req, res) => {
  const body = req.body;
  if (!body || !body.title || !body.content) return res.status(400).json({ error: 'missing title or content' });

  const posts = await loadPosts();
  const id = Date.now();
  const post = {
    id,
    title: body.title,
    author: body.author || (req.session.user && req.session.user.name) || 'Admin',
    content: body.content,
    date: new Date().toISOString(),
    tags: Array.isArray(body.tags) ? body.tags : (body.tags || []).map ? body.tags : [],
    image: body.image || '',
    featured: !!body.featured,
    isDraft: !!body.isDraft,
    categoryId: null
  };

  if (body && ('categoryId' in body) && body.categoryId != null) {
    post.categoryId = body.categoryId;
  }

  if (post.featured) {
    posts.forEach(p => p.featured = false);
  }

  posts.unshift(post);
  await savePosts(posts);
  return res.json({ success: true, post });
});

// PUT /api/posts/:id - update (admin only)
app.put('/api/posts/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body;
  const posts = await loadPosts();
  const idx = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const updated = {
    ...posts[idx],
    title: body.title || posts[idx].title,
    author: body.author || posts[idx].author,
    content: body.content || posts[idx].content,
    tags: Array.isArray(body.tags) ? body.tags : posts[idx].tags,
    image: body.image || posts[idx].image,
    featured: !!body.featured,
    isDraft: 'isDraft' in body ? !!body.isDraft : posts[idx].isDraft,
    categoryId: posts[idx].categoryId
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
});

app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  let posts = await loadPosts();
  const idx = posts.findIndex(p => p.id.toString() === id || p.id === parseInt(id, 10));
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  posts.splice(idx, 1);
  await savePosts(posts);
  return res.json({ success: true });
});

// Upload API with Cloudinary
app.post('/api/upload', requireAdmin, async (req, res) => {
  try {
    if (!req.files || !req.files.image) return res.status(400).json({ error: 'no file uploaded' });
    const image = req.files.image;
    const MAX_BYTES = 5 * 1024 * 1024;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(image.mimetype)) {
      return res.status(400).json({ error: 'invalid_file_type', allowed });
    }
    if (image.size > MAX_BYTES) {
      return res.status(400).json({ error: 'file_too_large', maxBytes: MAX_BYTES });
    }
    
    // Use Cloudinary if configured and not the default 'cloudinary' value
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'cloudinary') {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'blog',
            public_id: `${Date.now()}_${path.parse(image.name).name}`,
            transformation: [{ quality: 'auto', fetch_format: 'auto' }]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(image.data);
      });
      console.log(`Uploaded to Cloudinary: ${result.secure_url}`);
      return res.json({ success: true, url: result.secure_url, filename: result.public_id, size: image.size });
    }
    
    // Fallback to Vercel Blob
    if (process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN) {
      const safe = path.basename(image.name).replace(/[^a-z0-9.\-\_]/gi, '_');
      const filename = Date.now() + '_' + safe;
      const blob = await put(filename, image.data, {
        access: 'public',
        contentType: image.mimetype
      });
      console.log(`Uploaded to Vercel Blob: ${blob.url}`);
      return res.json({ success: true, url: blob.url, filename, size: image.size });
    }
    
    // Local development fallback
    const safe = path.basename(image.name).replace(/[^a-z0-9.\-\_]/gi, '_');
    const filename = Date.now() + '_' + safe;
    const dest = path.join(UPLOADS_DIR, filename);
    if (image.data && Buffer.isBuffer(image.data)) {
      fs.writeFileSync(dest, image.data);
    } else if (typeof image.mv === 'function') {
      await new Promise((resolve, reject) => image.mv(dest, err => err ? reject(err) : resolve()));
    }
    const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
    console.log(`Uploaded locally: ${dest}`);
    return res.json({ success: true, url, filename, size: image.size });
  } catch (err) {
    console.error('upload error:', err);
    return res.status(500).json({ error: 'upload_failed', details: err.message });
  }
});

// Settings API
const settingsPath = path.join(__dirname, 'settings.json');

// Helper function to read settings
function readSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading settings:', error);
  }
  return {
    backgroundUrl: '',
    backgrounds: [],
    author: {
      name: '',
      email: '',
      bio: '',
      phone: '',
      whatsapp: '',
      profilePicture: '',
      social: { twitter: '', facebook: '', linkedin: '', instagram: '', website: '' }
    },
    security: {
      adminEntryKeyHash: '',
      adminEntryKeyEnc: ''
    }
  };
}

// Helper function to write settings
function writeSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error writing settings:', error);
  }
}

// Get current background image
app.get('/api/settings/background', (req, res) => {
  const settings = readSettings();
  return res.json({ backgroundUrl: settings.backgroundUrl || '' });
});

// Set background image
app.post('/api/settings/background', requireAdmin, (req, res) => {
  const { backgroundUrl } = req.body;
  if (!backgroundUrl) return res.status(400).json({ error: 'missing backgroundUrl' });

  const settings = readSettings();
  settings.backgroundUrl = backgroundUrl;
  // Keep backgrounds in sync if only a single URL is provided
  if (!Array.isArray(settings.backgrounds) || settings.backgrounds.length === 0) {
    settings.backgrounds = [backgroundUrl];
  }
  writeSettings(settings);

  return res.json({ success: true, backgroundUrl });
});

// Multiple backgrounds API
app.get('/api/settings/backgrounds', (req, res) => {
  const settings = readSettings();
  const arr = Array.isArray(settings.backgrounds) ? settings.backgrounds : (settings.backgroundUrl ? [settings.backgroundUrl] : []);
  return res.json({ backgrounds: arr });
});

app.post('/api/settings/backgrounds', requireAdmin, (req, res) => {
  try {
    const { backgrounds } = req.body || {};
    if (!Array.isArray(backgrounds)) return res.status(400).json({ error: 'backgrounds_must_be_array' });
    const urls = backgrounds.map(u => String(u)).filter(u => u.length > 0);
    const settings = readSettings();
    settings.backgrounds = urls;
    // Keep legacy single backgroundUrl aligned to first
    settings.backgroundUrl = urls[0] || '';
    writeSettings(settings);
    return res.json({ success: true, backgrounds: urls });
  } catch (e) {
    console.error('save backgrounds error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Theme settings API
app.get('/api/settings/theme', async (req, res) => {
  try {
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'theme' });
      const theme = result?.theme || { primaryColor: '#F4A191', accentColor: '#4A9B9B' };
      return res.json({ theme });
    }

    // Local development
    const settings = readSettings();
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
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const payload = req.body && req.body.theme ? req.body.theme : req.body;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

      const theme = {
        primaryColor: String(payload.primaryColor || '#F4A191'),
        accentColor: String(payload.accentColor || '#4A9B9B')
      };

      await db.collection('settings').updateOne(
        { type: 'theme' },
        { $set: { theme, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.json({ success: true, theme });
    }

    // Local development
    const payload = req.body && req.body.theme ? req.body.theme : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = readSettings();
    settings.theme = {
      primaryColor: String(payload.primaryColor || '#F4A191'),
      accentColor: String(payload.accentColor || '#4A9B9B')
    };
    writeSettings(settings);
    return res.json({ success: true, theme: settings.theme });
  } catch (e) {
    console.error('Error saving theme settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Author settings API
app.get('/api/settings/author', async (req, res) => {
  try {
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'author' });
      const author = result?.author || { name: '', email: '', bio: '', phone: '', whatsapp: '', profilePicture: '', social: { twitter: '', facebook: '', linkedin: '', instagram: '', website: '' } };
      return res.json({ author });
    }

    // Local development
    const settings = readSettings();
    const author = settings.author || { name: '', email: '', bio: '', phone: '', whatsapp: '', profilePicture: '', social: { twitter: '', facebook: '', linkedin: '', instagram: '', website: '' } };
    return res.json({ author });
  } catch (e) {
    console.error('Error reading author settings:', e);
    const author = { name: '', email: '', bio: '', phone: '', whatsapp: '', profilePicture: '', social: { twitter: '', facebook: '', linkedin: '', instagram: '', website: '' } };
    return res.json({ author });
  }
});

// Blog info settings API
app.get('/api/settings/blog-info', async (req, res) => {
  try {
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'blog-info' });
      const blogInfo = result?.blogInfo || { title: 'zedong254ke', description: 'Discover insights, tutorials, and thoughts on web development, programming, and technology.' };
      return res.json({ blogInfo });
    }

    // Local development
    const settings = readSettings();
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
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const payload = req.body && req.body.blogInfo ? req.body.blogInfo : req.body;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

      const blogInfo = {
        title: String(payload.title || 'zedong254ke'),
        description: String(payload.description || 'Discover insights, tutorials, and thoughts on web development, programming, and technology.')
      };

      await db.collection('settings').updateOne(
        { type: 'blog-info' },
        { $set: { blogInfo, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.json({ success: true, blogInfo });
    }

    // Local development
    const payload = req.body && req.body.blogInfo ? req.body.blogInfo : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = readSettings();
    settings.blogInfo = {
      title: String(payload.title || 'zedong254ke'),
      description: String(payload.description || 'Discover insights, tutorials, and thoughts on web development, programming, and technology.')
    };
    writeSettings(settings);
    return res.json({ success: true, blogInfo: settings.blogInfo });
  } catch (e) {
    console.error('Error saving blog info settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/settings/author', requireAdmin, async (req, res) => {
  try {
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const payload = req.body && req.body.author ? req.body.author : req.body;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

      const author = {
        name: String(payload.name || ''),
        email: String(payload.email || ''),
        bio: String(payload.bio || ''),
        phone: String(payload.phone || ''),
        whatsapp: String(payload.whatsapp || ''),
        profilePicture: String(payload.profilePicture || ''),
        social: {
          twitter: String(payload.social?.twitter || ''),
          facebook: String(payload.social?.facebook || ''),
          linkedin: String(payload.social?.linkedin || ''),
          instagram: String(payload.social?.instagram || ''),
          website: String(payload.social?.website || '')
        }
      };

      await db.collection('settings').updateOne(
        { type: 'author' },
        { $set: { author, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.json({ success: true, author });
    }

    // Local development
    const payload = req.body && req.body.author ? req.body.author : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = readSettings();
    settings.author = {
      name: String(payload.name || ''),
      email: String(payload.email || ''),
      bio: String(payload.bio || ''),
      phone: String(payload.phone || ''),
      whatsapp: String(payload.whatsapp || ''),
      social: {
        twitter: String(payload.social?.twitter || ''),
        facebook: String(payload.social?.facebook || ''),
        linkedin: String(payload.social?.linkedin || ''),
        instagram: String(payload.social?.instagram || ''),
        website: String(payload.social?.website || '')
      }
    };
    writeSettings(settings);
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
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const host = req.get('host') || '';
    if (ip === '127.0.0.1' || ip === '::1' || host.includes('localhost') || host.includes('127.0.0.1')) {
      return res.json({ hasEntryKey: false, mode: 'localhost' });
    }

    if (process.env.ADMIN_ENTRY_KEY) {
      return res.json({ hasEntryKey: true, mode: 'env' });
    }
    
    let hasEntryKey = false;
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'security' });
      hasEntryKey = !!(result?.adminEntryKeyHash);
    } else {
      const settings = readSettings();
      hasEntryKey = !!(settings.security && settings.security.adminEntryKeyHash);
    }
    
    return res.json({ hasEntryKey, mode: hasEntryKey ? 'local' : 'none' });
  } catch (e) {
    return res.json({ hasEntryKey: false, mode: 'none' });
  }
});

app.post('/api/settings/security', requireAdmin, async (req, res) => {
  try {
    // Admin entry keys are now managed per-user in the User Management section
    // Return informational response instead of error
    return res.json({ 
      success: true, 
      message: 'Admin keys are now managed per-user in the User Management section',
      info: 'Use the "🔑 Set Key" button in User List to assign admin keys to users'
    });
  } catch (e) {
    console.error('Error saving security settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/settings/verify-entry-key', async (req, res) => {
  try {
    const provided = String(req.body?.adminEntryKey || '');
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    const host = req.get('host') || '';

    // Skip admin key verification for localhost testing
    if (ip === '127.0.0.1' || ip === '::1' || host.includes('localhost') || host.includes('127.0.0.1')) {
      const logs = await loadSecurityLogs();
      const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        keyHash: crypto.createHash('sha256').update('localhost-skip').digest('hex'),
        ip: ip || '',
        userAgent: ua || '',
        result: 'localhost_skip',
        mode: 'localhost'
      };
      logs.push(entry);
      await saveSecurityLogs(logs);

      req.session.adminKeyVerified = true;
      req.session.adminKeyVerifiedAt = Date.now();
      return res.json({ success: true, mode: 'localhost' });
    }

    // 1) If ADMIN_ENTRY_KEY is set, use it exclusively (works on Vercel)
    if (process.env.ADMIN_ENTRY_KEY) {
      const ok = provided && provided === process.env.ADMIN_ENTRY_KEY;
      const logs = await loadSecurityLogs();
      const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        keyHash: crypto.createHash('sha256').update(provided).digest('hex'),
        ip: ip || '',
        userAgent: ua || '',
        result: ok ? 'success' : 'fail',
        mode: 'env'
      };
      logs.push(entry);
      await saveSecurityLogs(logs);

      if (ok) {
        req.session.adminKeyVerified = true;
        req.session.adminKeyVerifiedAt = Date.now();
        return res.json({ success: true, mode: 'env' });
      }
      return res.status(403).json({ success: false, mode: 'env' });
    }

    // 2) Get stored hash from MongoDB or file
    let hash = '';
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'security' });
      hash = result?.adminEntryKeyHash || '';
    } else {
      const settings = readSettings();
      hash = settings.security?.adminEntryKeyHash || '';
    }

    const logs = await loadSecurityLogs();
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      keyHash: crypto.createHash('sha256').update(provided).digest('hex'),
      ip: ip || '',
      userAgent: ua || '',
      result: '',
      mode: 'local'
    };

    // 3) If no local key set, allow by default
    if (!hash) {
      entry.result = 'allow_not_set';
      logs.push(entry);
      await saveSecurityLogs(logs);
      req.session.adminKeyVerified = true;
      req.session.adminKeyVerifiedAt = Date.now();
      return res.json({ success: true, mode: 'none' });
    }

    // 4) Verify against stored hash
    const ok = await bcrypt.compare(provided, hash);
    entry.result = ok ? 'success' : 'fail';
    logs.push(entry);
    await saveSecurityLogs(logs);

    if (ok) {
      req.session.adminKeyVerified = true;
      req.session.adminKeyVerifiedAt = Date.now();
      return res.json({ success: true, mode: 'local' });
    }
    return res.status(403).json({ success: false, mode: 'local' });
  } catch (e) {
    console.error('verify-entry-key error:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Check if admin entry key is verified in session
app.get('/api/settings/check-admin-key-verified', (req, res) => {
  res.set('Cache-Control', 'no-store');
  
  // Auto-verify for localhost
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const host = req.get('host') || '';
  if (!req.session.adminKeyVerified && (ip === '127.0.0.1' || ip === '::1' || host.includes('localhost') || host.includes('127.0.0.1'))) {
    req.session.adminKeyVerified = true;
    req.session.adminKeyVerifiedAt = Date.now();
  }

  const verified = req.session.adminKeyVerified === true;
  const verifiedAt = req.session.adminKeyVerifiedAt || null;
  return res.json({ verified, verifiedAt });
});

// Clear admin key verification (for idle timeout)
app.post('/api/settings/clear-admin-key-verification', (req, res) => {
  req.session.adminKeyVerified = false;
  req.session.adminKeyVerifiedAt = null;
  return res.json({ success: true });
});

// View security logs after verifying admin credentials
app.post('/api/settings/security/logs', requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing credentials' });
    const users = await loadUsers();
    const user = users[username];
    if (!user) return res.status(401).json({ error: 'invalid user' });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid password' });

    const logs = await loadSecurityLogs();
    // Return most recent first
    const ordered = logs.slice().sort((a,b)=>b.id-a.id).slice(0, 2000);
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
    const user = users[username];
    if (!user) return res.status(401).json({ error: 'invalid user' });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid password' });

    let enc = '';
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'security' });
      enc = result?.adminEntryKeyEnc || '';
    } else {
      const settings = readSettings();
      enc = settings.security?.adminEntryKeyEnc || '';
    }
    
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
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'notifications' });
      const notifications = result?.notifications || {
        emailNotifications: true,
        commentNotifications: true,
        subscriptionNotifications: true,
        adminEmail: ''
      };
      return res.json({ notifications });
    }

    // Local development
    const settings = readSettings();
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
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const payload = req.body && req.body.notifications ? req.body.notifications : req.body;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

      const notifications = {
        emailNotifications: Boolean(payload.emailNotifications !== false),
        commentNotifications: Boolean(payload.commentNotifications !== false),
        subscriptionNotifications: Boolean(payload.subscriptionNotifications !== false),
        adminEmail: String(payload.adminEmail || '')
      };

      await db.collection('settings').updateOne(
        { type: 'notifications' },
        { $set: { notifications, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.json({ success: true, notifications });
    }

    // Local development
    const payload = req.body && req.body.notifications ? req.body.notifications : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = readSettings();
    settings.notifications = {
      emailNotifications: Boolean(payload.emailNotifications !== false),
      commentNotifications: Boolean(payload.commentNotifications !== false),
      subscriptionNotifications: Boolean(payload.subscriptionNotifications !== false),
      adminEmail: String(payload.adminEmail || '')
    };
    writeSettings(settings);
    return res.json({ success: true, notifications: settings.notifications });
  } catch (e) {
    console.error('Error saving notifications settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Content settings API
app.get('/api/settings/content', async (req, res) => {
  try {
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const result = await db.collection('settings').findOne({ type: 'content' });
      const content = result?.content || {
        enableComments: true,
        enableSubscriptions: true,
        postsPerPage: 10,
        featuredPostsCount: 3,
        enableRichTextEditor: true
      };
      return res.json({ content });
    }

    // Local development
    const settings = readSettings();
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
    // For Vercel, use MongoDB if available
    if (process.env.VERCEL && db) {
      const payload = req.body && req.body.content ? req.body.content : req.body;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });

      const content = {
        enableComments: Boolean(payload.enableComments !== false),
        enableSubscriptions: Boolean(payload.enableSubscriptions !== false),
        postsPerPage: Math.max(1, Math.min(50, parseInt(payload.postsPerPage) || 10)),
        featuredPostsCount: Math.max(0, Math.min(10, parseInt(payload.featuredPostsCount) || 3)),
        enableRichTextEditor: Boolean(payload.enableRichTextEditor !== false)
      };

      await db.collection('settings').updateOne(
        { type: 'content' },
        { $set: { content, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.json({ success: true, content });
    }

    // Local development
    const payload = req.body && req.body.content ? req.body.content : req.body;
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid_payload' });
    const settings = readSettings();
    settings.content = {
      enableComments: Boolean(payload.enableComments !== false),
      enableSubscriptions: Boolean(payload.enableSubscriptions !== false),
      postsPerPage: Math.max(1, Math.min(50, parseInt(payload.postsPerPage) || 10)),
      featuredPostsCount: Math.max(0, Math.min(10, parseInt(payload.featuredPostsCount) || 3)),
      enableRichTextEditor: Boolean(payload.enableRichTextEditor !== false)
    };
    writeSettings(settings);
    return res.json({ success: true, content: settings.content });
  } catch (e) {
    console.error('Error saving content settings:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// Categories API
app.get('/api/categories', async (req, res) => {
  try {
    console.log('Loading categories - DB connected:', !!db);
    const categories = await loadCategories();
    console.log('Categories loaded:', categories.length);
    return res.json({ categories, debug: { dbConnected: !!db, count: categories.length } });
  } catch (error) {
    console.error('Categories load error:', error);
    return res.json({ categories: [], error: error.message });
  }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  try {
    console.log('Creating category - DB connected:', !!db, 'Body:', req.body);
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'missing name' });
    
    const categories = await loadCategories();
    if (!Array.isArray(categories)) {
      console.error('loadCategories did not return an array:', categories);
      return res.status(500).json({ error: 'invalid categories format' });
    }
    
    const id = String(Date.now());
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const category = {
      id,
      name: name.trim(),
      slug,
      description: description ? description.trim() : ''
    };
    
    categories.push(category);
    console.log('Saving categories:', categories.length, 'New category:', category);
    await saveCategories(categories);
    console.log('Category saved successfully');
    return res.json({ success: true, category, categories });
  } catch (error) {
    console.error('Category creation error:', error);
    return res.status(500).json({ error: error.message || 'failed to create category' });
  }
}

app.put('/api/categories/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'missing name' });

  const categories = await loadCategories();
  const idx = categories.findIndex(c => c.id.toString() === id || c.id === parseInt(id, 10));
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  categories[idx] = {
    ...categories[idx],
    name: name.trim(),
    slug,
    description: description ? description.trim() : ''
  };

  await saveCategories(categories);
  return res.json({ success: true, category: categories[idx] });
});

app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  let categories = await loadCategories();
  const idx = categories.findIndex(c => c.id.toString() === id || c.id === parseInt(id, 10));
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  categories.splice(idx, 1);
  await saveCategories(categories);
  return res.json({ success: true });
});

// Analytics API
app.post('/api/analytics/pageview', async (req, res) => {
  try {
    const { page, referrer, userAgent } = req.body;
    const analytics = await loadAnalytics();
    
    const pageView = {
      id: Date.now(),
      page: page || '/',
      referrer: referrer || '',
      userAgent: userAgent || req.get('User-Agent') || '',
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    };
    
    analytics.pageViews.push(pageView);
    await saveAnalytics(analytics);
    
    return res.json({ success: true });
  } catch (e) {
    console.error('Analytics pageview error:', e);
    return res.status(500).json({ error: 'failed to track pageview' });
  }
});

app.post('/api/analytics/interaction', async (req, res) => {
  try {
    const { type, target, value } = req.body;
    if (!type) return res.status(400).json({ error: 'missing type' });
    
    const analytics = await loadAnalytics();
    
    const interaction = {
      id: Date.now(),
      type: type,
      target: target || '',
      value: value || '',
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || '',
      timestamp: new Date().toISOString()
    };
    
    analytics.interactions.push(interaction);
    await saveAnalytics(analytics);
    
    return res.json({ success: true });
  } catch (e) {
    console.error('Analytics interaction error:', e);
    return res.status(500).json({ error: 'failed to track interaction' });
  }
});

// Get analytics data (protected)
app.get('/api/analytics', requireAdmin, async (req, res) => {
  const analytics = await loadAnalytics();
  return res.json(analytics);
});

// Newsletter subscription API
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, name, postId } = req.body;
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

    console.log('New newsletter subscription:', email);
    return res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error('Subscription error:', e);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Comments API
app.get('/api/comments/:postId', async (req, res) => {
  try {
    const postId = parseInt(req.params.postId, 10);
    const comments = await loadComments();
    const postComments = comments.filter(c => c.postId === postId && !c.parentId).map(comment => ({
      ...comment,
      replies: comments.filter(c => c.parentId === comment.id)
    }));
    return res.json({ comments: postComments });
  } catch (e) {
    console.error('Load comments error:', e);
    return res.status(500).json({ error: 'Failed to load comments' });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { postId, name, email, content, parentId, subscribe } = req.body;
    if (!postId || !name || !email || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const comments = await loadComments();
    const comment = {
      id: Date.now(),
      postId: parseInt(postId, 10),
      name: name.trim(),
      email: email.trim(),
      content: content.trim(),
      parentId: parentId ? parseInt(parentId, 10) : null,
      date: new Date().toISOString(),
      approved: false // Admin approval required
    };

    comments.push(comment);
    await saveComments(comments);

    // Handle subscription if requested
    if (subscribe) {
      const subscriptions = await loadSubscriptions();
      const existingSub = subscriptions.find(s => s.email === email && s.postId === comment.postId);
      if (!existingSub) {
        subscriptions.push({
          id: Date.now(),
          postId: comment.postId,
          email: email.trim(),
          name: name.trim(),
          subscribedAt: new Date().toISOString()
        });
        await saveSubscriptions(subscriptions);
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
    const commentId = parseInt(req.params.id, 10);
    const comments = await loadComments();
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    comment.approved = true;
    await saveComments(comments);

    // Send notification email if this is an admin reply
    if (comment.parentId) {
      const parentComment = comments.find(c => c.id === comment.parentId);
      if (parentComment) {
        const subscriptions = await loadSubscriptions();
        const subscriber = subscriptions.find(s => s.email === parentComment.email && s.postId === comment.postId);
        if (subscriber) {
          await sendNotificationEmail(parentComment.email, comment, parentComment);
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
    const commentId = parseInt(req.params.id, 10);
    const comments = await loadComments();
    const filteredComments = comments.filter(c => c.id !== commentId && c.parentId !== commentId);
    await saveComments(filteredComments);
    return res.json({ success: true });
  } catch (e) {
    console.error('Delete comment error:', e);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Helper function to send notification emails
async function sendNotificationEmail(toEmail, replyComment, originalComment) {
  try {
    const posts = await loadPosts();
    const post = posts.find(p => p.id === replyComment.postId);

    const mailOptions = {
      from: process.env.SMTP_USER || 'noreply@yourblog.com',
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
        <p><a href="${req.protocol}://${req.get('host')}/post.html?id=${replyComment.postId}">View the full discussion</a></p>
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
app.get('/api/analytics/export', requireAdmin, async (req, res) => {
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

// Temporary admin endpoint to delete all posts (for production cleanup)
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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

app.get('/post.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'post.html'));
});

app.get('/about.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'about.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Auth server listening on http://localhost:${PORT}`));
}
