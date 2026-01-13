const fetch = require('node-fetch');

async function testForgotPassword() {
  try {
    console.log('Testing forgot password with mock email...');

    const response = await fetch('http://localhost:3000/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'mwitijulius7@gmail.com'
      })
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', result);

    if (response.ok && result.success) {
      console.log('✅ Test passed: Forgot password endpoint works with mock email');
    } else {
      console.log('❌ Test failed: Unexpected response');
    }
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testForgotPassword();
