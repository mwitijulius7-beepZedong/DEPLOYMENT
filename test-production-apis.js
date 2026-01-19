const fetch = require('node-fetch');

const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.argv[2] || 'http://localhost:3000');

async function testEndpoint(endpoint, method = 'GET', body = null, headers = {}) {
  try {
    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
    }

    console.log(`Testing ${method} ${endpoint}...`);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();

    if (response.ok) {
      console.log(`✅ ${method} ${endpoint} - Status: ${response.status}`);
      return { success: true, data };
    } else {
      console.log(`❌ ${method} ${endpoint} - Status: ${response.status}, Error: ${data.error || 'Unknown'}`);
      return { success: false, data };
    }
  } catch (error) {
    console.log(`❌ ${method} ${endpoint} - Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting comprehensive API testing...\n');

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test basic endpoints
  const endpoints = [
    { path: '/', method: 'GET' },
    { path: '/api/welcome', method: 'GET' },
    { path: '/api/birthday', method: 'GET' },
    { path: '/api/posts', method: 'GET' },
    { path: '/api/categories', method: 'GET' },
    { path: '/api/analytics', method: 'GET' }, // This might fail without auth
    { path: '/api/settings/background', method: 'GET' },
    { path: '/api/settings/theme', method: 'GET' },
    { path: '/api/settings/author', method: 'GET' },
    { path: '/api/settings/blog-info', method: 'GET' },
    { path: '/api/settings/content', method: 'GET' },
    { path: '/api/settings/notifications', method: 'GET' },
    { path: '/api/settings/security', method: 'GET' },
    { path: '/api/auth/status', method: 'GET' },
    { path: '/api/auth/setup-status', method: 'GET' }
  ];

  for (const endpoint of endpoints) {
    results.total++;
    const result = await testEndpoint(endpoint.path, endpoint.method);
    if (result.success) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // Test POST endpoints
  const postEndpoints = [
    { path: '/api/subscribe', method: 'POST', body: { email: 'test@example.com', name: 'Test User' } },
    { path: '/api/analytics/pageview', method: 'POST', body: { page: '/', userAgent: 'Test' } },
    { path: '/api/analytics/interaction', method: 'POST', body: { type: 'click', target: 'button' } },
    { path: '/api/comments', method: 'POST', body: { postId: 1, name: 'Test', email: 'test@example.com', content: 'Test comment' } }
  ];

  for (const endpoint of postEndpoints) {
    results.total++;
    const result = await testEndpoint(endpoint.path, endpoint.method, endpoint.body);
    if (result.success) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  console.log('\n📊 Test Results:');
  console.log(`Total tests: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  if (results.failed === 0) {
    console.log('🎉 All tests passed! Serverless function appears to be working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }

  return results;
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testEndpoint };
