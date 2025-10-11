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
const USERS_FILE = path.join(__dirname, 'users.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');

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



function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'not authenticated' });
}

// Create a basic transporter that logs to console if SMTP not configured
const transporter = (process.env.SMTP_HOST && process.env.SMTP_USER)
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  : { sendMail: async (opts) => { console.log('Mock email:', opts); } };
// POST /auth/login - normal username/password login (admin)
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing credentials' });

  const users = loadUsers();
  const user = users[username];
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  if (process.env.DEV_ADMIN_PASSWORD && username === 'admin' && password === process.env.DEV_ADMIN_PASSWORD) {
    req.session.user = { email: user.email || process.env.ALLOWED_EMAIL || 'admin@example.com', name: user.name || 'Admin' };
    return res.json({ success: true, email: req.session.user.email, name: req.session.user.name });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  req.session.user = { email: user.email, name: user.name };
  return res.json({ success: true, email: user.email, name: user.name });
});

// GET /auth/setup-status - returns whether any admin user exists
app.get('/auth/setup-status', (req, res) => {
  try {
    const users = loadUsers();
    const hasAny = Object.keys(users || {}).length > 0;
    return res.json({ setup: hasAny });
  } catch (e) {
    return res.json({ setup: false });
  }
});

// POST /auth/setup - create the first admin user (no auth required when no users exist).
// If users already exist, this endpoint requires an authenticated admin session.
app.post('/auth/setup', async (req, res) => {
  const { username, password, name, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing username or password' });

  const users = loadUsers();
  const hasAny = Object.keys(users || {}).length > 0;

  if (hasAny && !(req.session && req.session.user)) {
    return res.status(401).json({ error: 'not authenticated' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    users[username] = { name: name || 'Admin', email: email || '', passwordHash: hash };
    saveUsers(users);
    return res.json({ success: true, user: { username, name: users[username].name, email: users[username].email } });
  } catch (e) {
    console.error('setup error', e);
    return res.status(500).json({ error: 'internal' });
  }
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

  // For now, accept categoryId without validation (categories temporarily disabled)
  if (body && ('categoryId' in body) && body.categoryId != null) {
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
  try {
    if (!req.files || !req.files.image) return res.status(400).json({ error: 'no file uploaded' });
    const image = req.files.image;
    // Validate file size (<=5MB) and type
    const MAX_BYTES = 5 * 1024 * 1024;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(image.mimetype)) {
      return res.status(400).json({ error: 'invalid_file_type', allowed });
    }
    if (image.size > MAX_BYTES) {
      return res.status(400).json({ error: 'file_too_large', maxBytes: MAX_BYTES });
    }
    // sanitize filename
    const safe = path.basename(image.name).replace(/[^a-z0-9.\-\_]/gi, '_');
    const filename = Date.now() + '_' + safe;
    const dest = path.join(UPLOADS_DIR, filename);
    try {
      // Some versions of express-fileupload provide image.data as Buffer
      if (image.data && Buffer.isBuffer(image.data)) {
        fs.writeFileSync(dest, image.data);
      } else if (typeof image.mv === 'function') {
        // fallback to mv if available
        image.mv(dest, (err) => { if (err) throw err; });
      } else {
        return res.status(500).json({ error: 'no_write_method' });
      }
      const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
      console.log(`Uploaded file saved to ${dest} by ${req.session && req.session.user ? req.session.user.email : 'unknown'}`);
      return res.json({ success: true, url, filename, size: image.size });
    } catch (e) {
      console.error('upload error', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'upload_failed' });
    }
  } catch (err) {
    console.error('upload handler error', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal' });
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
  // Accept categoryId without validation while categories are disabled
  if ('categoryId' in body) {
    updated.categoryId = body.categoryId == null ? null : body.categoryId;
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
// Categories API temporarily disabled due to stability issues. Return 501 for now.
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

  // If slug is being updated, ensure uniqueness
  let newSlug = cats[idx].slug;
  if (slug && slug !== cats[idx].slug) {
    const baseSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');
    newSlug = baseSlug;
    let s = 1;
    while (cats.some((c, i) => i !== idx && (c.slug || '') === newSlug)) {
      newSlug = `${baseSlug}-${s++}`;
    }
  }

  cats[idx] = { ...cats[idx], name: name || cats[idx].name, slug: newSlug, description: description || cats[idx].description };
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
