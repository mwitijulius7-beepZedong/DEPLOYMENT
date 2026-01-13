const fetch = require('node-fetch');

async function testLocalhostBypass() {
    console.log('🧪 Testing Localhost Admin Key Bypass...');
    const baseUrl = 'http://localhost:3000';
    let cookie = '';

    // Helper for requests with session persistence
    const request = async (method, path, body = null) => {
        const headers = { 'Content-Type': 'application/json' };
        if (cookie) headers['Cookie'] = cookie;
        
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);
        
        const res = await fetch(`${baseUrl}${path}`, opts);
        
        // Capture cookie
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        
        return res;
    };
    
    try {
        // 1. Login
        console.log('1. Logging in...');
        let res = await request('POST', '/auth/login', { username: 'admin', password: 'Mwitijulius7@Jm' });
        let data = await res.json();
        
        if (!data.success) {
            console.error('❌ Login failed:', data);
            return;
        }
        console.log('   Login successful.');

        // 2. Set Admin Key (to ensure restriction is active)
        console.log('2. Setting temporary Admin Key...');
        res = await request('POST', '/api/settings/security', { adminEntryKey: 'temp-test-key' });
        data = await res.json();
        if (!data.success) throw new Error('Failed to set admin key');

        // 3. Check Verification (Should be true due to localhost bypass)
        console.log('3. Checking verification status...');
        // Force a check - the server should auto-verify because of localhost IP/Host
        res = await request('GET', '/api/settings/check-admin-key-verified');
        data = await res.json();
        
        console.log('   Response:', data);
        
        if (data.verified === true) {
            console.log('✅ SUCCESS: Admin key is auto-verified on localhost.');
        } else {
            console.log('❌ FAILURE: Admin key is NOT verified.');
        }

        // 4. Cleanup (Remove Admin Key)
        console.log('4. Cleaning up...');
        await request('POST', '/api/settings/security', { adminEntryKey: '' });
        console.log('✅ Cleanup complete.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testLocalhostBypass();
