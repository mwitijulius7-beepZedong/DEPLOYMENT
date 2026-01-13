const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function makeRequest(method, url, body = null, headers = {}) {
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}${url}`, config);
        const data = await response.json().catch(() => ({}));
        return { status: response.status, data, ok: response.ok };
    } catch (error) {
        return { status: 0, data: { error: error.message }, ok: false };
    }
}

async function testAdminRoutes() {
    console.log('🛡️ Testing Admin Routes Enforcement');

    // Test 1: Login with admin credentials (should work)
    console.log('\n1. Testing login with admin credentials...');
    const adminLoginResult = await makeRequest('POST', '/auth/login', {
        username: 'admin',
        password: 'Mwitijulius7'
    });
    console.log(`Admin login: ${adminLoginResult.status} - ${adminLoginResult.ok ? 'SUCCESS' : 'FAILED'}`);
    const adminToken = adminLoginResult.ok ? adminLoginResult.data.token : '';

    // Test 2: Try to access admin routes without admin key (should fail)
    console.log('\n2. Testing admin routes without admin key...');

    // Create a mock token without admin privileges
    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InVzZXIiLCJpYXQiOjE2NzI1MzYwMDAsImV4cCI6MTY3MjYyMjQwMH0.mock';

    const adminRoutes = [
        { method: 'POST', url: '/api/posts', body: { title: 'Test', content: 'Test' } },
        { method: 'PUT', url: '/api/posts/123', body: { title: 'Updated' } },
        { method: 'DELETE', url: '/api/posts/123' },
        { method: 'POST', url: '/api/upload', body: {} },
        { method: 'POST', url: '/api/settings/theme', body: { theme: {} } },
        { method: 'POST', url: '/api/categories', body: { name: 'Test' } },
        { method: 'GET', url: '/api/analytics' }
    ];

    for (const route of adminRoutes) {
        const result = await makeRequest(route.method, route.url, route.body, {
            'Authorization': `Bearer ${mockToken}`
        });
        console.log(`${route.method} ${route.url}: ${result.status} - ${result.status === 401 ? 'CORRECTLY BLOCKED' : 'UNEXPECTED'}`);
        if (result.status !== 401) {
            console.log('  Response:', result.data);
        }
    }

    // Test 3: Access admin routes with proper admin token (should work)
    console.log('\n3. Testing admin routes with proper admin token...');
    if (adminToken) {
        const adminTestRoutes = [
            { method: 'GET', url: '/api/analytics' },
            { method: 'GET', url: '/api/settings/theme' }
        ];

        for (const route of adminTestRoutes) {
            const result = await makeRequest(route.method, route.url, null, {
                'Authorization': `Bearer ${adminToken}`
            });
            console.log(`${route.method} ${route.url}: ${result.status} - ${result.ok ? 'SUCCESS' : 'FAILED'}`);
        }
    } else {
        console.log('Skipping admin route tests - no admin token available');
    }

    // Test 4: Test non-admin routes still work without admin key
    console.log('\n4. Testing non-admin routes still work...');
    const nonAdminRoutes = [
        { method: 'GET', url: '/api/posts' },
        { method: 'GET', url: '/api/posts/123' },
        { method: 'POST', url: '/api/analytics/pageview', body: { page: '/test' } },
        { method: 'POST', url: '/api/subscribe', body: { email: 'test@example.com' } }
    ];

    for (const route of nonAdminRoutes) {
        const result = await makeRequest(route.method, route.url, route.body);
        console.log(`${route.method} ${route.url}: ${result.status} - ${result.ok ? 'SUCCESS' : 'FAILED'}`);
    }

    console.log('\n✅ Admin routes testing completed!');
}

testAdminRoutes();
