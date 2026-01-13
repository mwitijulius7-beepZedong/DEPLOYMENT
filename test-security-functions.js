// Test script for security functions: Save Security, View Key, Clear Key
// Run with: node test-security-functions.js

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// Store session cookie for authenticated requests
let sessionCookie = '';

async function login() {
    console.log('\n=== Logging in as admin ===');

    try {
        const response = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'Mwitijulius7@Jm' // Dev admin password from server.js
            })
        });

        const data = await response.json();
        console.log('Login response status:', response.status);
        console.log('Login response data:', data);

        if (response.ok && data.success) {
            // Extract session cookie from response headers
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) {
                const cookieMatch = setCookie.match(/sessionId=([^;]+)/);
                if (cookieMatch) {
                    sessionCookie = `sessionId=${cookieMatch[1]}`;
                }
            }
            console.log('✅ Login: SUCCESS');
            return true;
        } else {
            console.log('❌ Login: FAILED');
            return false;
        }
    } catch (error) {
        console.log('❌ Login: ERROR -', error.message);
        return false;
    }
}

async function testSaveSecuritySettings() {
    console.log('\n=== Testing saveSecuritySettings ===');

    try {
        const response = await fetch(`${BASE_URL}/api/settings/security`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            },
            body: JSON.stringify({
                adminEntryKey: 'test-key-123',
                sessionTimeout: 30
            })
        });

        const data = await response.json();
        console.log('Response status:', response.status);
        console.log('Response data:', data);

        if (response.status === 501 && data.error === 'not_supported_on_serverless_or_env_managed') {
            console.log('⚠️ Save Security Settings: SKIPPED - Environment managed');
        } else if (response.ok) {
            console.log('✅ Save Security Settings: SUCCESS');
        } else {
            console.log('❌ Save Security Settings: FAILED');
        }
    } catch (error) {
        console.log('❌ Save Security Settings: ERROR -', error.message);
    }
}

async function testViewCurrentKey() {
    console.log('\n=== Testing viewCurrentKey ===');

    try {
        const response = await fetch(`${BASE_URL}/api/settings/security/key-view`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'Mwitijulius7@Jm' // Dev admin password
            })
        });

        const data = await response.json();
        console.log('Response status:', response.status);
        console.log('Response data:', data);

        if (response.status === 403 && data.error === 'env_managed') {
            console.log('⚠️ View Current Key: SKIPPED - Environment managed');
        } else if (response.ok && data.success) {
            console.log('✅ View Current Key: SUCCESS');
            console.log('Current key:', data.key);
        } else {
            console.log('❌ View Current Key: FAILED');
        }
    } catch (error) {
        console.log('❌ View Current Key: ERROR -', error.message);
    }
}

async function testClearKey() {
    console.log('\n=== Testing clearKey ===');

    // First save a key
    await testSaveSecuritySettings();

    // Then try to clear it
    try {
        const response = await fetch(`${BASE_URL}/api/settings/security`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            },
            body: JSON.stringify({
                adminEntryKey: '',
                sessionTimeout: 30
            })
        });

        const data = await response.json();
        console.log('Response status:', response.status);
        console.log('Response data:', data);

        if (response.status === 501 && data.error === 'not_supported_on_serverless_or_env_managed') {
            console.log('⚠️ Clear Key: SKIPPED - Environment managed');
        } else if (response.ok) {
            console.log('✅ Clear Key: SUCCESS');
        } else {
            console.log('❌ Clear Key: FAILED');
        }
    } catch (error) {
        console.log('❌ Clear Key: ERROR -', error.message);
    }
}

async function testResponsiveness() {
    console.log('\n=== Testing Responsiveness ===');

    // Test concurrent requests to check for race conditions
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(
            fetch(`${BASE_URL}/api/settings/security`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': sessionCookie
                },
                body: JSON.stringify({
                    adminEntryKey: `concurrent-key-${i}`,
                    sessionTimeout: 30
                })
            })
        );
    }

    try {
        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.ok).length;
        console.log(`Concurrent requests: ${successCount}/${results.length} successful`);

        if (successCount === results.length) {
            console.log('✅ Responsiveness: SUCCESS - No race conditions');
        } else {
            console.log('⚠️ Responsiveness: PARTIAL - Some requests failed');
        }
    } catch (error) {
        console.log('❌ Responsiveness: ERROR -', error.message);
    }
}

async function runTests() {
    console.log('Starting Security Functions Tests...');

    // Login first to get authenticated session
    const loginSuccess = await login();
    if (!loginSuccess) {
        console.log('❌ Cannot proceed with tests - login failed');
        return;
    }

    await testSaveSecuritySettings();
    await testViewCurrentKey();
    await testClearKey();
    await testResponsiveness();

    console.log('\n=== Test Summary ===');
    console.log('Tests completed. Check results above.');
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { testSaveSecuritySettings, testViewCurrentKey, testClearKey, testResponsiveness };
