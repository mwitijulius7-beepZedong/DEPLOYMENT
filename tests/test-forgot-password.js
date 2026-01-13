const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = 'mwitijulius7@gmail.com'; // Use the actual email from users.json

async function testForgotPassword() {
  console.log('Testing Forgot Password functionality...\n');

  try {
    console.log('=== Testing Forgot Password Request ===');
    const response = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL })
    });

    const data = await response.json();
    console.log(`POST /auth/forgot-password: ${response.status}`, data);

    if (response.ok && data.success) {
      console.log('✅ Forgot password request successful');
    } else {
      console.log('❌ Forgot password request failed');
    }

  } catch (error) {
    console.log('❌ Forgot password test failed:', error.message);
  }
}

// Run the test
testForgotPassword().catch(console.error);
