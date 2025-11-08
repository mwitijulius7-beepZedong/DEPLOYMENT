require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { put } = require('@vercel/blob');
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;
// const { kv } = require('@vercel/kv'); // Only for Vercel deployment

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
let db;
if (process.env.MONGODB_URI) {
  MongoClient.connect(process.env.MONGODB_URI)
    .then(client => {
      console.log('Connected to MongoDB');
      db = client.db('blog');
    })
    .catch(error => console.error('MongoDB connection error:', error));
}

// Cloudinary configuration
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'cloudinary') {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Vercel serverless function export
module.exports = app;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(__dirname, 'users.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');
const CATEGORIES_FILE = path.join(__dirname, 'categories.json');
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');
const SECURITY_LOGS_FILE = path.join(__dirname, 'security_logs.json');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || '';
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || '';

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
  name: 'sessionId'
}));

app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 },
  useTempFiles: false,
  createParentPath: true
}));

async function loadUsers() {
  try {
    if (db) {
      const users = await db.collection('users').find({}).toArray();
      const result = {};
      users.forEach(u => result[u.username] = u);
      return result;
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
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
    if (process.env.VERCEL) return;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Save users error:', e);
  }
}

async function loadPosts() {
  try {
    if (db) {
      const posts = await db.collection('posts').find({}).sort({ date: -1 }).toArray();
      return posts.map(p => ({ ...p, id: p._id || p.id }));
    }
    return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')) || [];
  } catch (e) {
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
    if (process.env.VERCEL) return;
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
  } catch (e) {
    console.error('Save posts error:', e);
  }
}

async function loadCategories() {
  try {
    if (db) {
      console.log('Loading from MongoDB');
      const categories = await db.collection('categories').find({}).toArray();
      console.log('MongoDB categories:', categories.length);
      return categories.map(c => ({ ...c, id: String(c._id || c.id) }));
    }
    console.log('Loading from file system');
    const cats = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8')) || [];
    return cats.map(c => ({ ...c, id: String(c.id) }));
  } catch (e) {
    console.error('Load categories error:', e);
    return [];
  }
}

async function saveCategories(categories) {
  try {
    if (db) {
      console.log('Saving to MongoDB:', categories.length);
      await db.collection('categories').deleteMany({});
      if (categories.length > 0) {
        const result = await db.collection('categories').insertMany(categories.map(c => ({ ...c, _id: c.id })));
        console.log('MongoDB save result:', result.insertedCount);
      }
      return;
    }
    console.log('Saving to file system');
    if (process.env.VERCEL) return;
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
  } catch (e) {
    console.error('Save categories error:', e);
    throw e;
  }
}

async function loadAnalytics() {
  try {
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
    if (process.env.VERCEL) return;
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
  } catch (e) {
    console.error('Save analytics error:', e);
  }
}

async function loadSecurityLogs() {
  try {
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

  // Check Authorization header as fallback
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      // Simple token validation - in production, use JWT or similar
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [email, timestamp] = decoded.split('|');
      const tokenAge = Date.now() - parseInt(timestamp);

      console.log('Token validation:', { email, tokenAge, valid: tokenAge < 24 * 60 * 60 * 1000 });

      // Token valid for 24 hours
      if (tokenAge < 24 * 60 * 60 * 1000 && email) {
        req.user = { email, name: 'Admin' };
        return next();
      }
    } catch (e) {
      console.error('Token validation error:', e);
    }
  }

  return res.status(401).json({ error: 'not authenticated' });
}

const transporter = process.env.SENDGRID_API_KEY
  ? nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    })
  : {
      sendMail: async (opts) => {
        console.log('Mock email:', opts);
        return { messageId: 'mock-' + Date.now() };
      }
    };

// Auth routes
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing credentials' });

  const users = await loadUsers();
  const user = users[username];
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  if (process.env.DEV_ADMIN_PASSWORD && username === 'admin' && password === process.env.DEV_ADMIN_PASSWORD) {
    req.session.user = { email: user.email || process.env.ALLOWED_EMAIL || 'admin@example.com', name: user.name || 'Admin' };
    console.log('Login successful for admin (dev password), session set:', req.session.user);
    return res.json({ success: true, email: req.session.user.email, name: req.session.user.name });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  req.session.user = { email: user.email, name: user.name };
  console.log('Login successful, session set:', req.session.user);
  return res.json({ success: true, email: user.email, name: user.name });
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

  if (hasAny && !(req.session && req.session.user)) {
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
  console.log('Auth status check - Session exists:', !!req.session, 'User exists:', !!req.session?.user, 'Session ID:', req.sessionID);
  if (req.session && req.session.user) {
    console.log('User authenticated:', req.session.user);
    return res.json({ loggedIn: true, user: req.session.user });
  }
  console.log('User not authenticated');
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

app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const users = await loadUsers();
  const user = Object.values(users).find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'user not found' });

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Store reset token (in production, use Redis or database)
  // For now, we'll store it in memory - this is not production-ready
  if (!global.resetTokens) global.resetTokens = {};
  global.resetTokens[resetTokenHash] = {
    email: user.email,
    expires: Date.now() + 60 * 60 * 1000 // 1 hour
  };

  // Send reset email
  const resetUrl = `${req.protocol}://${req.get('host')}/reset.html?token=${resetToken}`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER, // Use authenticated SMTP user as from address
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset for your blog admin account.</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background: #F4A191; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    return res.json({ success: true, message: 'reset email sent' });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: 'failed to send email' });
  }
});

app.post('/auth/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'missing token or password' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const resetData = global.resetTokens?.[tokenHash];

  if (!resetData || resetData.expires < Date.now()) {
    return res.status(400).json({ error: 'invalid or expired token' });
  }

  const users = await loadUsers();
  const user = Object.values(users).find(u => u.email === resetData.email);
  if (!user) return res.status(404).json({ error: 'user not found' });

  // Update password
  const hashedPassword = await bcrypt.hash(password, 10);
  user.passwordHash = hashedPassword;

  // Save updated users
  await fs.promises.writeFile(USERS_FILE, JSON.stringify(users, null, 2));

  // Remove used token
  delete global.resetTokens[tokenHash];

  return res.json({ success: true });
});

app.post('/auth/google', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'missing id_token' });

  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
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

app.post('/api/posts', requireAuth, async (req, res) => {
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
app.put('/api/posts/:id', requireAuth, async (req, res) => {
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

app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  let posts = await loadPosts();
  const idx = posts.findIndex(p => p.id.toString() === id || p.id === parseInt(id, 10));
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  posts.splice(idx, 1);
  await savePosts(posts);
  return res.json({ success: true });
});

// Upload API with Cloudinary
app.post('/api/upload', requireAuth, async (req, res) => {
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
    if (process.env.VERCEL) return; // skip writes on Vercel
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
app.post('/api/settings/background', requireAuth, (req, res) => {
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

app.post('/api/settings/backgrounds', requireAuth, (req, res) => {
  try {
    if (process.env.VERCEL) return res.status(501).json({ error: 'not_supported_on_serverless' });
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

app.post('/api/settings/theme', requireAuth, async (req, res) => {
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

app.post('/api/settings/blog-info', requireAuth, async (req, res) => {
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

app.post('/api/settings/author', requireAuth, async (req, res) => {
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

app.post('/api/settings/security', requireAuth, async (req, res) => {
  try {
    if (process.env.VERCEL || process.env.ADMIN_ENTRY_KEY) {
      return res.status(501).json({ error: 'not_supported_on_serverless_or_env_managed' });
    }
    
    const { adminEntryKey } = req.body || {};
    const settings = readSettings();
    settings.security = settings.security || {};
    
    if (!adminEntryKey || String(adminEntryKey).length === 0) {
      settings.security.adminEntryKeyHash = '';
      settings.security.adminEntryKeyEnc = '';
      writeSettings(settings);
      return res.json({ success: true, hasEntryKey: false });
    }
    
    const plain = String(adminEntryKey);
    const hash = await bcrypt.hash(plain, 10);
    settings.security.adminEntryKeyHash = hash;
    settings.security.adminEntryKeyEnc = encryptText(plain);
    writeSettings(settings);
    
    return res.json({ success: true, hasEntryKey: true });
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
app.post('/api/settings/security/logs', requireAuth, async (req, res) => {
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
app.post('/api/settings/security/key-view', requireAuth, async (req, res) => {
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

app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    console.log('Creating category - DB connected:', !!db, 'Body:', req.body);
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'missing name' });
    
    const categories = await loadCategories();
    const id = Date.now();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const category = {
      id,
      name: name.trim(),
      slug,
      description: description ? description.trim() : ''
    };
    
    categories.push(category);
    console.log('Saving categories:', categories.length);
    await saveCategories(categories);
    console.log('Category saved successfully');
    return res.json({ success: true, category, debug: { dbConnected: !!db } });
  } catch (error) {
    console.error('Category creation error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
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

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
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
app.get('/api/analytics', requireAuth, async (req, res) => {
  const analytics = await loadAnalytics();
  return res.json(analytics);
});

// Newsletter subscription API
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // Store subscription (in production, you'd want to use a proper database)
    // For now, we'll just log it and return success
    console.log('New newsletter subscription:', email);

    // You could store this in a file or database
    // For this demo, we'll just return success
    return res.json({ success: true, message: 'Subscribed successfully' });
  } catch (e) {
    console.error('Subscription error:', e);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Export analytics data with optional date filters
// Query params: dataset=pageViews|interactions|all (default=all), format=json|csv (default=json), from=ISO, to=ISO
app.get('/api/analytics/export', requireAuth, async (req, res) => {
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
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
