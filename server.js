require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

const app = express();
const PORT = process.env.PORT || 3000;

// File upload middleware
const fileUpload = require('express-fileupload');
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 } })); // 5MB limit

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // must match client-side
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || ''; // exact email allowed (optional)
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || ''; // allowed domain (optional)

if (!CLIENT_ID) {
  console.warn('WARNING: GOOGLE_CLIENT_ID is not set in .env - server verification will fail');
}

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
  cookie: { secure: false } // secure: true requires HTTPS
}));

const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const USERS_FILE = path.join(__dirname, 'users.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');
const CATEGORIES_FILE = path.join(__dirname, 'categories.json');
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

function loadAnalytics() {
  try {
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8')) || { pageViews: [], postViews: [], interactions: [] };
  } catch (e) {
    return { pageViews: [], postViews: [], interactions: [] };
  }
}

function saveAnalytics(analytics) {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
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
    isDraft: !!body.isDraft,
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
    isDraft: 'isDraft' in body ? !!body.isDraft : posts[idx].isDraft,
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
app.get('/api/categories', (req, res) => {
  try {
    let categories = loadCategories();
    categories = categories.slice().sort((a, b) => ('' + a.name).localeCompare(b.name));
    return res.json({ categories });
  } catch (e) {
    console.error('Categories load error:', e);
    return res.json({ categories: [] });
  }
});

// POST /api/categories - create (admin only)
app.post('/api/categories', requireAuth, (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'missing name' });

    const cats = loadCategories();
    const existingByName = cats.find(c => (c.name || '').toLowerCase() === name.trim().toLowerCase());
    if (existingByName) {
      return res.json({ success: true, category: existingByName });
    }

    const id = Date.now();
    const category = { 
      id, 
      name: name.trim(), 
      description: (description || '').trim(),
      color: color || '#8b7355',
      createdAt: new Date().toISOString()
    };
    cats.push(category);
    saveCategories(cats);
    return res.json({ success: true, category });
  } catch (e) {
    console.error('Category create error:', e);
    return res.status(500).json({ error: 'failed to create category' });
  }
});

// PUT /api/categories/:id - update (admin only)
app.put('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description, color } = req.body;
    const cats = loadCategories();
    const idx = cats.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });

    cats[idx] = { 
      ...cats[idx], 
      name: name ? name.trim() : cats[idx].name,
      description: description !== undefined ? description.trim() : cats[idx].description,
      color: color || cats[idx].color
    };
    saveCategories(cats);
    return res.json({ success: true, category: cats[idx] });
  } catch (e) {
    console.error('Category update error:', e);
    return res.status(500).json({ error: 'failed to update category' });
  }
});

// DELETE /api/categories/:id - delete (admin only)
app.delete('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    let cats = loadCategories();
    const idx = cats.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });

    cats.splice(idx, 1);
    saveCategories(cats);

    const posts = loadPosts();
    posts.forEach(p => {
      if (p.categoryId === id) p.categoryId = null;
    });
    savePosts(posts);

    return res.json({ success: true });
  } catch (e) {
    console.error('Category delete error:', e);
    return res.status(500).json({ error: 'failed to delete category' });
  }
});

// POST /auth/google - verify Google ID token and create session
app.post('/auth/google', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'missing id_token' });

  try {
    // Verify with Google's tokeninfo endpoint
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
    const payload = await response.json();

    if (!response.ok || payload.error) {
      return res.status(401).json({ error: 'invalid token' });
    }

    // Check client ID matches
    if (payload.aud !== CLIENT_ID) {
      return res.status(401).json({ error: 'invalid client' });
    }

    // Check email restrictions if configured
    const email = payload.email;
    if (ALLOWED_EMAIL && email !== ALLOWED_EMAIL) {
      return res.status(403).json({ error: 'email not allowed' });
    }
    if (ALLOWED_DOMAIN && !email.endsWith('@' + ALLOWED_DOMAIN)) {
      return res.status(403).json({ error: 'domain not allowed' });
    }

    // Create session
    req.session.user = {
      email: payload.email,
      name: payload.name || 'Google User'
    };

    return res.json({ success: true, email: payload.email, name: payload.name });
  } catch (e) {
    console.error('Google auth error:', e);
    return res.status(500).json({ error: 'verification failed' });
  }
});

// Analytics API
// POST /api/analytics/pageview - track page view
app.post('/api/analytics/pageview', (req, res) => {
  try {
    const { page, referrer, userAgent } = req.body;
    const analytics = loadAnalytics();
    
    const pageView = {
      id: Date.now(),
      page: page || '/',
      referrer: referrer || '',
      userAgent: userAgent || req.get('User-Agent') || '',
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    };
    
    analytics.pageViews.push(pageView);
    saveAnalytics(analytics);
    
    return res.json({ success: true });
  } catch (e) {
    console.error('Analytics pageview error:', e);
    return res.status(500).json({ error: 'failed to track pageview' });
  }
});

// POST /api/analytics/postview - track post view
app.post('/api/analytics/postview', (req, res) => {
  try {
    const { postId, postTitle } = req.body;
    if (!postId) return res.status(400).json({ error: 'missing postId' });
    
    const analytics = loadAnalytics();
    
    const postView = {
      id: Date.now(),
      postId: parseInt(postId, 10),
      postTitle: postTitle || '',
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || '',
      timestamp: new Date().toISOString()
    };
    
    analytics.postViews.push(postView);
    saveAnalytics(analytics);
    
    return res.json({ success: true });
  } catch (e) {
    console.error('Analytics postview error:', e);
    return res.status(500).json({ error: 'failed to track postview' });
  }
});

// POST /api/analytics/interaction - track user interactions
app.post('/api/analytics/interaction', (req, res) => {
  try {
    const { type, target, value } = req.body;
    if (!type) return res.status(400).json({ error: 'missing type' });
    
    const analytics = loadAnalytics();
    
    const interaction = {
      id: Date.now(),
      type: type, // 'click', 'scroll', 'search', etc.
      target: target || '',
      value: value || '',
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || '',
      timestamp: new Date().toISOString()
    };
    
    analytics.interactions.push(interaction);
    saveAnalytics(analytics);
    
    return res.json({ success: true });
  } catch (e) {
    console.error('Analytics interaction error:', e);
    return res.status(500).json({ error: 'failed to track interaction' });
  }
});

// GET /api/analytics/stats - get analytics data (admin only)
app.get('/api/analytics/stats', requireAuth, (req, res) => {
  try {
    const analytics = loadAnalytics();
    const posts = loadPosts();
    
    // Calculate stats
    const totalPageViews = analytics.pageViews.length;
    const totalPostViews = analytics.postViews.length;
    const totalInteractions = analytics.interactions.length;
    
    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentPageViews = analytics.pageViews.filter(pv => new Date(pv.timestamp) > thirtyDaysAgo);
    const recentPostViews = analytics.postViews.filter(pv => new Date(pv.timestamp) > thirtyDaysAgo);
    
    // Top posts by views
    const postViewCounts = {};
    analytics.postViews.forEach(pv => {
      postViewCounts[pv.postId] = (postViewCounts[pv.postId] || 0) + 1;
    });
    
    const topPosts = Object.entries(postViewCounts)
      .map(([postId, views]) => {
        const post = posts.find(p => p.id === parseInt(postId, 10));
        return { postId: parseInt(postId, 10), title: post?.title || 'Unknown', views };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
    
    // Daily views for last 7 days
    const dailyViews = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayViews = analytics.pageViews.filter(pv => pv.timestamp.startsWith(dateStr)).length;
      dailyViews.push({ date: dateStr, views: dayViews });
    }
    
    return res.json({
      success: true,
      stats: {
        totalPageViews,
        totalPostViews,
        totalInteractions,
        recentPageViews: recentPageViews.length,
        recentPostViews: recentPostViews.length,
        topPosts,
        dailyViews
      }
    });
  } catch (e) {
    console.error('Analytics stats error:', e);
    return res.status(500).json({ error: 'failed to get analytics' });
  }
});

// GET /api/analytics/export - export analytics data (admin only)
app.get('/api/analytics/export', requireAuth, (req, res) => {
  try {
    const analytics = loadAnalytics();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-export.json"');
    return res.json(analytics);
  } catch (e) {
    console.error('Analytics export error:', e);
    return res.status(500).json({ error: 'failed to export analytics' });
  }
});

// Image optimization endpoint
app.get('/api/image/:filename', (req, res) => {
  const { filename } = req.params;
  const { w, h, q = 80 } = req.query;
  const imagePath = path.join(UPLOADS_DIR, filename);
  
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }
  
  // Set cache headers
  res.set({
    'Cache-Control': 'public, max-age=31536000',
    'ETag': `"${fs.statSync(imagePath).mtime.getTime()}"`
  });
  
  // For now, just serve the original image
  // In production, you'd use sharp or similar for actual optimization
  res.sendFile(imagePath);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Auth server listening on http://localhost:${PORT}`));
