const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function testAdminModular() {
  const baseUrl = 'http://localhost:3000';

  try {
    console.log('Testing admin panel with modular JavaScript...');

    // Test 1: Check if server is running
    console.log('1. Checking server status...');
    const response = await fetch(`${baseUrl}/auth/status`);
    if (!response.ok) {
      throw new Error(`Server not responding: ${response.status}`);
    }
    const status = await response.json();
    console.log('   Server status:', status.loggedIn ? 'Running' : 'Not logged in');

    // Test 2: Login with correct credentials
    console.log('2. Attempting login...');
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'password'
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    console.log('   Login successful:', loginData.success);

    // Extract session cookie for subsequent requests
    const cookie = loginResponse.headers.get('set-cookie');
    const sessionCookie = cookie ? cookie.split(';')[0] : null;

    if (!sessionCookie) {
      throw new Error('No session cookie received');
    }

    // Test 3: Check admin page loads
    console.log('3. Testing admin page load...');
    const adminResponse = await fetch(`${baseUrl}/admin.html`, {
      headers: { 'Cookie': sessionCookie }
    });

    if (!adminResponse.ok) {
      throw new Error(`Admin page failed to load: ${adminResponse.status}`);
    }

    const adminHtml = await adminResponse.text();
    console.log('   Admin page loaded successfully');

    // Test 4: Check if modular JS files are referenced
    console.log('4. Checking modular JS references...');
    const hasMainJs = adminHtml.includes('/js/main.js');
    const hasAuthJs = adminHtml.includes('/js/auth.js');
    const hasDashboardJs = adminHtml.includes('/js/dashboard.js');

    console.log('   main.js referenced:', hasMainJs);
    console.log('   auth.js referenced:', hasAuthJs);
    console.log('   dashboard.js referenced:', hasDashboardJs);

    if (!hasMainJs) {
      throw new Error('main.js not referenced in admin.html');
    }

    // Test 5: Check if modular JS files exist and are accessible
    console.log('5. Testing modular JS file accessibility...');
    const jsFiles = ['/js/main.js', '/js/auth.js', '/js/dashboard.js', '/js/posts.js', '/js/settings.js', '/js/analytics.js', '/js/customize.js', '/js/charts.js'];

    for (const jsFile of jsFiles) {
      const jsResponse = await fetch(`${baseUrl}${jsFile}`);
      if (!jsResponse.ok) {
        throw new Error(`JS file ${jsFile} not accessible: ${jsResponse.status}`);
      }
      console.log(`   ${jsFile}: OK`);
    }

    // Test 6: Test some API endpoints to ensure functionality works
    console.log('6. Testing API endpoints...');

    // Test posts API
    const postsResponse = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'Cookie': sessionCookie }
    });

    if (!postsResponse.ok) {
      throw new Error(`Posts API failed: ${postsResponse.status}`);
    }

    const postsData = await postsResponse.json();
    console.log('   Posts API: OK, found', postsData.posts?.length || 0, 'posts');

    // Test categories API
    const categoriesResponse = await fetch(`${baseUrl}/api/categories`, {
      headers: { 'Cookie': sessionCookie }
    });

    if (!categoriesResponse.ok) {
      throw new Error(`Categories API failed: ${categoriesResponse.status}`);
    }

    const categoriesData = await categoriesResponse.json();
    console.log('   Categories API: OK, found', categoriesData.categories?.length || 0, 'categories');

    console.log('\n✅ All tests passed! Admin panel with modular JavaScript is working correctly.');
    console.log('\nSummary:');
    console.log('- Server is running');
    console.log('- Authentication works');
    console.log('- Admin page loads');
    console.log('- Modular JS files are properly referenced and accessible');
    console.log('- API endpoints are functional');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAdminModular();
