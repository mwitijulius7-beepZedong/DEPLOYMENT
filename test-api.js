const fetch = require('node-fetch');

const BASE_URL = 'https://maozedong254.vercel.app';

async function testAPI() {
  console.log('Testing Birthday Blog API...\n');

  // Test 1: Check if server is responding
  try {
    const response = await fetch(`${BASE_URL}/api/posts`);
    const data = await response.json();
    console.log('✅ Posts API:', response.status, `(${data.posts?.length || 0} posts)`);
  } catch (error) {
    console.log('❌ Posts API failed:', error.message);
  }

  // Test 2: Check auth status
  try {
    const response = await fetch(`${BASE_URL}/auth/status`);
    const data = await response.json();
    console.log('✅ Auth Status:', response.status, data.loggedIn ? 'Logged in' : 'Not logged in');
  } catch (error) {
    console.log('❌ Auth Status failed:', error.message);
  }

  // Test 3: Check categories
  try {
    const response = await fetch(`${BASE_URL}/api/categories`);
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Categories API:', response.status, `(${data.categories?.length || 0} categories)`);
    } else {
      console.log('⚠️ Categories API:', response.status, 'Not found or error');
    }
  } catch (error) {
    console.log('❌ Categories API failed:', error.message);
  }

  // Test 4: Upload API (requires auth - will fail with 401)
  try {
    const response = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST'
    });
    console.log('✅ Upload API responds:', response.status, response.status === 401 ? '(Auth required)' : '');
  } catch (error) {
    console.log('❌ Upload API failed:', error.message);
  }

  // Test 5: Analytics API (requires auth - will fail with 401)
  try {
    const response = await fetch(`${BASE_URL}/api/analytics`);
    console.log('✅ Analytics API responds:', response.status, response.status === 401 ? '(Auth required)' : '');
  } catch (error) {
    console.log('❌ Analytics API failed:', error.message);
  }

  console.log('\nTest completed!');
}

testAPI().catch(console.error);