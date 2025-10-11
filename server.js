require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // must match client-side
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || ''; // exact email allowed (optional)
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || ''; // allowed domain (optional)

if (!CLIENT_ID) {
  console.warn('WARNING: GOOGLE_CLIENT_ID is not set in .env - server verification will fail');
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // secure: true requires HTTPS
}));

const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const fileUpload = require('express-fileupload');

const USERS_FILE = path.join(__dirname, 'users.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');
const CATEGORIES_FILE = path.join(__dirname, 'categories.json');

// Ensure uploads directory exists and serve it
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}
app.use('/uploads', express.static(UPLOADS_DIR));
// express-fileupload middleware (for simpler local uploads)
app.use(fileUpload({ createParentPath: true }));

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadPosts() {
  try {
    return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

function savePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function loadCategories() {
  try {
    return JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

function saveCategories(categories) {
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'not authenticated' });
}

// Create a basic transporter that logs to console if SMTP not configured
function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Fallback: fake transporter that prints message to console
  return {
    sendMail: async (opts) => {
      console.log('--- EMAIL (console fallback) ---');
      console.log('To:', opts.to);
      console.log('Subject:', opts.subject);
      console.log('Text:', opts.text);
      return Promise.resolve({ accepted: [opts.to] });
    }
  };
}

const transporter = createTransporter();

// Serve static files (client)
app.use(express.static(path.join(__dirname)));

// Simple request logger for debugging
app.use((req, res, next) => {
  try { console.log(new Date().toISOString(), req.method, req.url); } catch(e) {}
  next();
});

// Global exception handlers (log and continue)
process.on('uncaughtException', err => {
  console.error('uncaughtException', err && err.stack ? err.stack : err);
  try { fs.appendFileSync(path.join(__dirname, 'server.log'), JSON.stringify({ t: new Date().toISOString(), type: 'uncaughtException', error: String(err) }) + '\n'); } catch(e) {}
});
process.on('unhandledRejection', err => {
  console.error('unhandledRejection', err);
  try { fs.appendFileSync(path.join(__dirname, 'server.log'), JSON.stringify({ t: new Date().toISOString(), type: 'unhandledRejection', error: String(err) }) + '\n'); } catch(e) {}
});

// POST /auth/google - verify id_token and create session
app.post('/auth/google', async (req, res) => {
  const idToken = req.body.id_token;
  if (!idToken) return res.status(400).json({ error: 'missing id_token' });

  try {
    // Verify ID token using Google's official library (validates signature, issuer, audience)
    const client = new OAuth2Client(CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: idToken, audience: CLIENT_ID });
    const payload = ticket.getPayload();

    if (!payload) return res.status(401).json({ error: 'unable to verify token' });

    // Restrict by email or domain if configured
    if (ALLOWED_EMAIL && payload.email !== ALLOWED_EMAIL) {
      return res.status(403).json({ error: 'unauthorized email' });
    }
    if (ALLOWED_DOMAIN && !payload.email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return res.status(403).json({ error: 'unauthorized domain' });
    }

    // OK - create session
    req.session.user = { email: payload.email, name: payload.name };
    return res.json({ success: true, email: payload.email, name: payload.name });
  } catch (err) {
    console.error('verify error', err);
    return res.status(500).json({ error: 'internal error' });
  }
});

// POST /auth/login - normal username/password login (admin)
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing credentials' });

  const users = loadUsers();
  const user = users[username];
  if (!user) {
    // Fallback: allow DEV_ADMIN_PASSWORD from .env for local testing
    if (process.env.DEV_ADMIN_PASSWORD && username === 'admin' && password === process.env.DEV_ADMIN_PASSWORD) {
      req.session.user = { email: process.env.ALLOWED_EMAIL || 'admin@example.com', name: 'Admin' };
      return res.json({ success: true, email: req.session.user.email, name: req.session.user.name });
    }
    return res.status(401).json({ error: 'invalid credentials' });
  }


  // Allow DEV_ADMIN_PASSWORD to bypass stored password for quick local testing, even when user exists
  if (process.env.DEV_ADMIN_PASSWORD && username === 'admin' && password === process.env.DEV_ADMIN_PASSWORD) {
    req.session.user = { email: user.email || process.env.ALLOWED_EMAIL || 'admin@example.com', name: user.name || 'Admin' };
    return res.json({ success: true, email: req.session.user.email, name: req.session.user.name });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  req.session.user = { email: user.email, name: user.name };
  return res.json({ success: true, email: user.email, name: user.name });
});

// POST /auth/request-reset - generate reset token and email it
app.post('/auth/request-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'missing email' });

  const users = loadUsers();
  const username = Object.keys(users).find(u => users[u].email === email);
  if (!username) return res.status(200).json({ success: true }); // don't reveal

  const token = crypto.randomBytes(24).toString('hex');
  users[username].resetToken = token;
  users[username].resetExpires = Date.now() + 3600 * 1000; // 1 hour
  saveUsers(users);

  const resetUrl = `${req.protocol}://${req.get('host')}/reset.html?token=${token}`;

  await transporter.sendMail({
    to: email,
    subject: 'Password reset for your admin account',
    text: `Click this link to reset your admin password: ${resetUrl}`
  });

  return res.json({ success: true });
});

// POST /auth/reset - accept token and new password
app.post('/auth/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'missing' });

  const users = loadUsers();
  const username = Object.keys(users).find(u => users[u].resetToken === token && users[u].resetExpires > Date.now());
  if (!username) return res.status(400).json({ error: 'invalid or expired token' });

  const hash = await bcrypt.hash(password, 10);
  users[username].passwordHash = hash;
  delete users[username].resetToken;
  delete users[username].resetExpires;
  saveUsers(users);

  return res.json({ success: true });
});

// GET /auth/status - check session
app.get('/auth/status', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  return res.json({ loggedIn: false });
});

// POST /auth/logout - destroy session
app.post('/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'failed to logout' });
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// Simple posts API (file-backed)
// GET /api/posts - public
app.get('/api/posts', (req, res) => {
  const posts = loadPosts();
  return res.json({ posts });
});

// POST /api/posts - create (admin only)
app.post('/api/posts', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || !body.title || !body.content) return res.status(400).json({ error: 'missing title or content' });

  const posts = loadPosts();
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
    categoryId: null
  };

  // validate categoryId if provided
  if (body && ('categoryId' in body) && body.categoryId != null) {
    const cats = loadCategories();
    const exists = cats.some(c => c.id === body.categoryId);
    if (!exists) return res.status(400).json({ error: 'invalid categoryId' });
    post.categoryId = body.categoryId;
  }

  // ensure only one featured post
  if (post.featured) {
    posts.forEach(p => p.featured = false);
  }

  posts.unshift(post);
  savePosts(posts);
  return res.json({ success: true, post });
});

// POST /api/upload - upload image (admin only)
app.post('/api/upload', requireAuth, (req, res) => {
  if (!req.files || !req.files.image) return res.status(400).json({ error: 'no file uploaded' });
  const image = req.files.image;
  // Validate file size (<=5MB) and type
  const MAX_BYTES = 5 * 1024 * 1024;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(image.mimetype)) {
    return res.status(400).json({ error: 'invalid_file_type' });
  }
  if (image.size > MAX_BYTES) {
    return res.status(400).json({ error: 'file_too_large' });
  }
  // sanitize filename
  const safe = path.basename(image.name).replace(/[^a-z0-9.\-\_]/gi, '_');
  const filename = Date.now() + '_' + safe;
  const dest = path.join(UPLOADS_DIR, filename);
  try {
    image.mv(dest);
    const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
    return res.json({ success: true, url });
  } catch (e) {
    console.error('upload error', e);
    return res.status(500).json({ error: 'upload failed' });
  }
});

// PUT /api/posts/:id - update (admin only)
app.put('/api/posts/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body;
  const posts = loadPosts();
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
    categoryId: posts[idx].categoryId
  };

  // validate categoryId if provided in update
  if ('categoryId' in body) {
    if (body.categoryId == null) {
      updated.categoryId = null;
    } else {
      const cats = loadCategories();
      const exists = cats.some(c => c.id === body.categoryId);
      if (!exists) return res.status(400).json({ error: 'invalid categoryId' });
      updated.categoryId = body.categoryId;
    }
  }

  if (updated.featured) {
    posts.forEach(p => p.featured = false);
  }

  posts[idx] = updated;
  savePosts(posts);
  return res.json({ success: true, post: updated });
});

// DELETE /api/posts/:id - delete (admin only)
app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  let posts = loadPosts();
  const idx = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  posts.splice(idx, 1);
  savePosts(posts);
  return res.json({ success: true });
});

// Categories API
// GET /api/categories - public
app.get('/api/categories', (req, res) => {
  let categories = loadCategories();
  // Return categories sorted by name for stable UI ordering
  categories = categories.slice().sort((a, b) => ('' + a.name).localeCompare(b.name));
  return res.json({ categories });
});

// POST /api/categories - create (admin only)
app.post('/api/categories', requireAuth, (req, res) => {
  const { name, slug: providedSlug, description } = req.body;
  if (!name) return res.status(400).json({ error: 'missing name' });

  const cats = loadCategories();

  // If a category with the same name exists (case-insensitive), return it instead of creating a duplicate
  const existingByName = cats.find(c => (c.name || '').toLowerCase() === (name || '').toLowerCase());
  if (existingByName) {
    return res.json({ success: true, category: existingByName });
  }

  // Generate a slug and ensure it's unique
  const baseSlug = (providedSlug && String(providedSlug).trim())
    ? String(providedSlug).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-')
    : String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');

  let slug = baseSlug;
  let suffix = 1;
  while (cats.some(c => (c.slug || '') === slug)) {
    slug = `${baseSlug}-${suffix++}`;
  }

  const id = Date.now();
  const category = { id, name, slug, description: description || '' };
  cats.push(category);
  saveCategories(cats);
  return res.json({ success: true, category });
});

// PUT /api/categories/:id - update (admin only)
app.put('/api/categories/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, slug, description } = req.body;
  const cats = loadCategories();
  const idx = cats.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  cats[idx] = { ...cats[idx], name: name || cats[idx].name, slug: slug || cats[idx].slug, description: description || cats[idx].description };
  saveCategories(cats);
  return res.json({ success: true, category: cats[idx] });
});

// DELETE /api/categories/:id - delete (admin only)
app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  let cats = loadCategories();
  const idx = cats.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  // Remove category and unset from posts
  cats.splice(idx, 1);
  saveCategories(cats);

  const posts = loadPosts();
  posts.forEach(p => {
    if (p.categoryId === id) p.categoryId = null;
  });
  savePosts(posts);

  return res.json({ success: true });
});

app.listen(PORT, () => console.log(`Auth server listening on http://localhost:${PORT}`));
