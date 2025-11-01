const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Mwitijulius7';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password'; // Try default password first

let sessionCookie = '';

async function login() {
  try {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
    });

    const data = await response.json();
    console.log('Login response:', response.status, data);

    if (response.ok && data.success) {
      // Extract session cookie from response headers
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        const match = setCookie.match(/sessionId=([^;]+)/);
        if (match) sessionCookie = `sessionId=${match[1]}`;
      }
      return true;
    }
    return false;
  } catch (error) {
    console.log('Login failed:', error.message);
    return false;
  }
}

async function makeRequest(method, url, body = null, requireAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (requireAuth && sessionCookie) {
    headers.Cookie = sessionCookie;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${url}`, options);
    const data = await response.json();
    console.log(`${method} ${url}:`, response.status, data);
    return { response, data };
  } catch (error) {
    console.log(`${method} ${url} failed:`, error.message);
    return { response: null, data: null };
  }
}

async function testSettingsAPIs() {
  console.log('Testing Settings APIs...\n');

  // Test public GET endpoints
  console.log('=== Testing Public GET Endpoints ===');

  await makeRequest('GET', '/api/settings/background');
  await makeRequest('GET', '/api/settings/backgrounds');
  await makeRequest('GET', '/api/settings/theme');
  await makeRequest('GET', '/api/settings/author');
  await makeRequest('GET', '/api/settings/blog-info');
  await makeRequest('GET', '/api/settings/security');

  // Test verify-entry-key (public)
  console.log('\n=== Testing Verify Entry Key (Public) ===');
  await makeRequest('POST', '/api/settings/verify-entry-key', { adminEntryKey: 'test' });

  // Login for authenticated tests
  console.log('\n=== Logging in for Authenticated Tests ===');
  const loggedIn = await login();
  if (!loggedIn) {
    console.log('Failed to login, skipping authenticated tests');
    return;
  }

  console.log('\n=== Testing Authenticated POST Endpoints ===');

  // Test background settings
  await makeRequest('POST', '/api/settings/background', { backgroundUrl: 'https://example.com/bg.jpg' }, true);
  await makeRequest('POST', '/api/settings/backgrounds', { backgrounds: ['https://example.com/bg1.jpg', 'https://example.com/bg2.jpg'] }, true);

  // Test theme settings
  await makeRequest('POST', '/api/settings/theme', { primaryColor: '#FF0000', accentColor: '#00FF00' }, true);

  // Test author settings
  await makeRequest('POST', '/api/settings/author', {
    name: 'Test Author',
    email: 'test@example.com',
    phone: '123-456-7890',
    whatsapp: '098-765-4321',
    social: {
      twitter: 'testtwitter',
      facebook: 'testfb',
      linkedin: 'testlinkedin',
      instagram: 'testinsta',
      website: 'https://test.com'
    }
  }, true);

  // Test blog info settings
  await makeRequest('POST', '/api/settings/blog-info', {
    title: 'Test Blog',
    description: 'A test blog description'
  }, true);

  // Test security settings
  await makeRequest('POST', '/api/settings/security', { adminEntryKey: 'newkey123' }, true);

  // Test security logs (requires additional credentials)
  console.log('\n=== Testing Security Logs (Requires Credentials) ===');
  await makeRequest('POST', '/api/settings/security/logs', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }, true);

  // Test key view (requires additional credentials)
  await makeRequest('POST', '/api/settings/security/key-view', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }, true);

  console.log('\nSettings API testing completed!');
}

// Run the tests
testSettingsAPIs().catch(console.error);
