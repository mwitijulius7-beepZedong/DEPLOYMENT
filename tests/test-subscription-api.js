const http = require('http');

// Test configuration
const HOST = 'localhost';
const PORT = 3000;
const BASE_URL = `http://${HOST}:${PORT}`;

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Test cases
async function runTests() {
  console.log('🧪 Starting thorough subscription API tests...\n');

  const tests = [
    {
      name: 'Test 1: Valid subscription with email only',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: 'test1@example.com'
      },
      expectedStatus: 200,
      expectedSuccess: true
    },
    {
      name: 'Test 2: Valid subscription with email and name',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: 'test2@example.com',
        name: 'John Doe'
      },
      expectedStatus: 200,
      expectedSuccess: true
    },
    {
      name: 'Test 3: Valid subscription with email, name, and postId',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: 'test3@example.com',
        name: 'Jane Smith',
        postId: 123
      },
      expectedStatus: 200,
      expectedSuccess: true
    },
    {
      name: 'Test 4: Duplicate subscription (same email)',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: 'test1@example.com'
      },
      expectedStatus: 200,
      expectedSuccess: true,
      expectedMessage: 'Already subscribed'
    },
    {
      name: 'Test 5: Duplicate subscription (same email and postId)',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: 'test3@example.com',
        postId: 123
      },
      expectedStatus: 200,
      expectedSuccess: true,
      expectedMessage: 'Already subscribed'
    },
    {
      name: 'Test 6: Invalid email (missing @)',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: 'invalidemail.com'
      },
      expectedStatus: 400,
      expectedError: 'Valid email required'
    },
    {
      name: 'Test 7: Invalid email (empty)',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: ''
      },
      expectedStatus: 400,
      expectedError: 'Valid email required'
    },
    {
      name: 'Test 8: Missing email field',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        name: 'Test User'
      },
      expectedStatus: 400,
      expectedError: 'Valid email required'
    },
    {
      name: 'Test 9: New subscription for same email but different postId',
      request: {
        method: 'POST',
        hostname: HOST,
        port: PORT,
        path: '/api/subscribe',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      data: {
        email: 'test1@example.com',
        name: 'Different Name',
        postId: 456
      },
      expectedStatus: 200,
      expectedSuccess: true
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`\n📋 ${test.name}`);
      const response = await makeRequest(test.request, test.data);

      console.log(`   Status: ${response.statusCode}`);
      console.log(`   Response:`, response.body);

      // Validate response
      let testPassed = true;
      let failureReason = '';

      if (response.statusCode !== test.expectedStatus) {
        testPassed = false;
        failureReason = `Expected status ${test.expectedStatus}, got ${response.statusCode}`;
      } else if (test.expectedSuccess && (!response.body || !response.body.success)) {
        testPassed = false;
        failureReason = 'Expected success=true in response';
      } else if (test.expectedError && (!response.body || !response.body.error || !response.body.error.includes(test.expectedError))) {
        testPassed = false;
        failureReason = `Expected error containing "${test.expectedError}"`;
      } else if (test.expectedMessage && (!response.body || !response.body.message || !response.body.message.includes(test.expectedMessage))) {
        testPassed = false;
        failureReason = `Expected message containing "${test.expectedMessage}"`;
      }

      if (testPassed) {
        console.log(`   ✅ PASSED`);
        passed++;
      } else {
        console.log(`   ❌ FAILED: ${failureReason}`);
        failed++;
      }

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Test Results:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}`);

  if (failed === 0) {
    console.log(`\n🎉 All tests passed!`);
  } else {
    console.log(`\n⚠️  Some tests failed. Please review the implementation.`);
  }

  // Additional verification: Check if subscriptions.json was created/updated
  console.log(`\n🔍 Verifying data persistence...`);
  try {
    const fs = require('fs');
    if (fs.existsSync('subscriptions.json')) {
      const subscriptions = JSON.parse(fs.readFileSync('subscriptions.json', 'utf8'));
      console.log(`   Found ${subscriptions.length} subscriptions in subscriptions.json`);
      console.log(`   Sample subscription:`, subscriptions[0]);
    } else {
      console.log(`   ⚠️  subscriptions.json not found`);
    }
  } catch (error) {
    console.log(`   ❌ Error checking subscriptions.json: ${error.message}`);
  }
}

// Run the tests
runTests().catch(console.error);
