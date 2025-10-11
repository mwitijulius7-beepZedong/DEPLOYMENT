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

// Serve static files (client)
app.use(express.static(path.join(__dirname)));

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

app.listen(PORT, () => console.log(`Auth server listening on http://localhost:${PORT}`));
