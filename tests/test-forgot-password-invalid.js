const fetch = require('node-fetch');

async function testInvalidEmail() {
  try {
    console.log('Testing forgot password with invalid email...');

    const response = await fetch('http://localhost:3000/auth/forgot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'nonexistent@example.com'
      })
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', result);

    if (response.status === 200 && result.success) {
      console.log('✅ Test passed: Invalid email handled securely (returned success to prevent enumeration)');
    } else {
      console.log('❌ Test failed: Unexpected response for invalid email');
    }
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

async function testMissingEmail() {
  try {
    console.log('Testing forgot password with missing email...');

    const response = await fetch('http://localhost:3000/auth/forgot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', result);

    if (response.status === 400 && result.error === 'missing email') {
      console.log('✅ Test passed: Missing email handled correctly (Server returned 400)');
    } else {
      console.log('❌ Test failed: Unexpected response for missing email');
    }
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

async function runTests() {
  await testInvalidEmail();
  await testMissingEmail();
}

runTests();
