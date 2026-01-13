const fetch = require('node-fetch');

const BASE_URL = 'https://peronal-blog-4kr30kccz-juliusmwiti-solutechcos-projects.vercel.app';
const ADMIN_USERNAME = 'Mwitijulius7';
const ADMIN_PASSWORD = 'Mwitijulius7@Jm';

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

async function testProductionAuthorSettings() {
  console.log('Testing Production Author Settings API...\n');

  // Test public GET endpoint
  console.log('=== Testing Public GET /api/settings/author ===');
  await makeRequest('GET', '/api/settings/author');

  // Login for authenticated tests
  console.log('\n=== Logging in for Authenticated Tests ===');
  const loggedIn = await login();
  if (!loggedIn) {
    console.log('Failed to login, skipping authenticated tests');
    return;
  }

  console.log('\n=== Testing Authenticated POST /api/settings/author ===');

  // Test author settings with profilePicture
  await makeRequest('POST', '/api/settings/author', {
    name: 'Test Author Production',
    email: 'test@example.com',
    bio: 'Test bio for production',
    phone: '123-456-7890',
    whatsapp: '098-765-4321',
    profilePicture: 'https://example.com/production-profile.jpg',
    social: {
      twitter: 'testtwitter',
      facebook: 'testfb',
      linkedin: 'testlinkedin',
      instagram: 'testinsta',
      website: 'https://test.com'
    }
  }, true);

  // Test GET again to verify the profilePicture was stored
  console.log('\n=== Verifying Profile Picture Storage ===');
  await makeRequest('GET', '/api/settings/author');

  console.log('\nProduction author settings testing completed!');
}

// Run the tests
testProductionAuthorSettings().catch(console.error);
