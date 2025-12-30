const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function testDashboardButtons() {
  const baseUrl = 'http://localhost:3000';

  try {
    console.log('Testing dashboard action buttons...');

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
        password: 'Mwitijulius7'
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

    // Test 3: Check admin page loads and contains dashboard buttons
    console.log('3. Testing admin page load and button presence...');
    const adminResponse = await fetch(`${baseUrl}/admin.html`, {
      headers: { 'Cookie': sessionCookie }
    });

    if (!adminResponse.ok) {
      throw new Error(`Admin page failed to load: ${adminResponse.status}`);
    }

    const adminHtml = await adminResponse.text();
    console.log('   Admin page loaded successfully');

    // Test 4: Check if dashboard action buttons are present
    console.log('4. Checking dashboard action buttons...');
    const hasGoToPostsButton = adminHtml.includes('onclick="showPostsSection()"');
    const hasGoToSettingsButton = adminHtml.includes('onclick="showSettingsSection()"');
    const hasViewAnalyticsButton = adminHtml.includes('onclick="showAnalyticsSection()"');
    const hasCustomizeBlogButton = adminHtml.includes('onclick="showCustomizeSection()"');

    console.log('   "Go to Posts" button present:', hasGoToPostsButton);
    console.log('   "Go to Settings" button present:', hasGoToSettingsButton);
    console.log('   "View Analytics" button present:', hasViewAnalyticsButton);
    console.log('   "Customize Blog" button present:', hasCustomizeBlogButton);

    if (!hasGoToPostsButton || !hasGoToSettingsButton || !hasViewAnalyticsButton || !hasCustomizeBlogButton) {
      throw new Error('One or more dashboard action buttons are missing');
    }

    // Test 5: Check if modular JS files are loaded
    console.log('5. Testing modular JS file loading...');
    const hasMainJsScript = adminHtml.includes('<script type="module" src="/js/main.js"></script>');
    console.log('   main.js script tag present:', hasMainJsScript);

    if (!hasMainJsScript) {
      throw new Error('main.js module script not found in admin.html');
    }

    // Test 6: Test button functionality by simulating clicks
    console.log('6. Testing button functionality...');

    // Since we can't directly simulate DOM clicks in Node.js, we'll test the API endpoints
    // that the buttons would trigger

    // Test posts API (what "Go to Posts" would load)
    const postsResponse = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'Cookie': sessionCookie }
    });

    if (!postsResponse.ok) {
      throw new Error(`Posts API failed: ${postsResponse.status}`);
    }

    const postsData = await postsResponse.json();
    console.log('   Posts API accessible (for "Go to Posts" button): OK');

    // Test categories API (what settings section would load)
    const categoriesResponse = await fetch(`${baseUrl}/api/categories`, {
      headers: { 'Cookie': sessionCookie }
    });

    if (!categoriesResponse.ok) {
      throw new Error(`Categories API failed: ${categoriesResponse.status}`);
    }

    const categoriesData = await categoriesResponse.json();
    console.log('   Categories API accessible (for "Go to Settings" button): OK');

    // Test analytics API (what analytics section would load)
    const analyticsResponse = await fetch(`${baseUrl}/api/analytics`, {
      headers: { 'Cookie': sessionCookie }
    });

    if (!analyticsResponse.ok) {
      throw new Error(`Analytics API failed: ${analyticsResponse.status}`);
    }

    const analyticsData = await analyticsResponse.json();
    console.log('   Analytics API accessible (for "View Analytics" button): OK');

    console.log('\n✅ Dashboard button test completed successfully!');
    console.log('\nSummary:');
    console.log('- All dashboard action buttons are present in HTML');
    console.log('- Modular JavaScript is properly loaded');
    console.log('- All related APIs are accessible');
    console.log('- Button functionality should work correctly');

    console.log('\nIf buttons are still not clickable in the browser, the issue may be:');
    console.log('1. CSS z-index or pointer-events issues');
    console.log('2. JavaScript loading timing issues');
    console.log('3. Browser console errors preventing execution');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testDashboardButtons();
