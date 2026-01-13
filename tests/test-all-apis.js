const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
let authToken = '';
let testPostId = '';
let testCategoryId = '';

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

async function testAuthAPIs() {
    console.log('\n=== Testing Auth APIs ===');

    // Test login
    console.log('Testing login...');
    const loginResult = await makeRequest('POST', '/auth/login', {
        username: 'admin',
        password: 'Mwitijulius7'
    });
    console.log(`Login: ${loginResult.status} - ${loginResult.ok ? 'SUCCESS' : 'FAILED'}`);
    if (loginResult.ok && loginResult.data.token) {
        authToken = loginResult.data.token;
        console.log('Got auth token for further tests');
    }

    // Test auth status
    console.log('Testing auth status...');
    const statusResult = await makeRequest('GET', '/auth/status', null, {
        'Authorization': `Bearer ${authToken}`
    });
    console.log(`Auth status: ${statusResult.status} - ${statusResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test setup status
    console.log('Testing setup status...');
    const setupStatusResult = await makeRequest('GET', '/auth/setup-status');
    console.log(`Setup status: ${setupStatusResult.status} - ${setupStatusResult.ok ? 'SUCCESS' : 'FAILED'}`);
}

async function testPostsAPIs() {
    console.log('\n=== Testing Posts APIs ===');

    // Get posts
    console.log('Testing get posts...');
    const getPostsResult = await makeRequest('GET', '/api/posts');
    console.log(`Get posts: ${getPostsResult.status} - ${getPostsResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Create post
    console.log('Testing create post...');
    const createPostResult = await makeRequest('POST', '/api/posts', {
        title: 'Test Post',
        content: 'This is a test post content',
        author: 'Test Author',
        tags: ['test', 'api']
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    console.log(`Create post: ${createPostResult.status} - ${createPostResult.ok ? 'SUCCESS' : 'FAILED'}`);
    if (createPostResult.ok && createPostResult.data.post) {
        testPostId = createPostResult.data.post.id;
        console.log(`Created test post with ID: ${testPostId}`);
    }

    // Get specific post
    if (testPostId) {
        console.log('Testing get specific post...');
        const getPostResult = await makeRequest('GET', `/api/posts/${testPostId}`);
        console.log(`Get post: ${getPostResult.status} - ${getPostResult.ok ? 'SUCCESS' : 'FAILED'}`);

        // Update post
        console.log('Testing update post...');
        const updatePostResult = await makeRequest('PUT', `/api/posts/${testPostId}`, {
            title: 'Updated Test Post',
            content: 'This is updated test post content'
        }, {
            'Authorization': `Bearer ${authToken}`
        });
        console.log(`Update post: ${updatePostResult.status} - ${updatePostResult.ok ? 'SUCCESS' : 'FAILED'}`);
    }
}

async function testCategoriesAPIs() {
    console.log('\n=== Testing Categories APIs ===');

    // Get categories
    console.log('Testing get categories...');
    const getCategoriesResult = await makeRequest('GET', '/api/categories');
    console.log(`Get categories: ${getCategoriesResult.status} - ${getCategoriesResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Create category
    console.log('Testing create category...');
    const createCategoryResult = await makeRequest('POST', '/api/categories', {
        name: 'Test Category',
        description: 'This is a test category'
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    console.log(`Create category: ${createCategoryResult.status} - ${createCategoryResult.ok ? 'SUCCESS' : 'FAILED'}`);
    if (createCategoryResult.ok && createCategoryResult.data.category) {
        testCategoryId = createCategoryResult.data.category.id;
        console.log(`Created test category with ID: ${testCategoryId}`);
    }

    // Update category
    if (testCategoryId) {
        console.log('Testing update category...');
        const updateCategoryResult = await makeRequest('PUT', `/api/categories/${testCategoryId}`, {
            name: 'Updated Test Category',
            description: 'This is an updated test category'
        }, {
            'Authorization': `Bearer ${authToken}`
        });
        console.log(`Update category: ${updateCategoryResult.status} - ${updateCategoryResult.ok ? 'SUCCESS' : 'FAILED'}`);
    }
}

async function testSettingsAPIs() {
    console.log('\n=== Testing Settings APIs ===');

    // Test theme settings
    console.log('Testing get theme settings...');
    const getThemeResult = await makeRequest('GET', '/api/settings/theme');
    console.log(`Get theme: ${getThemeResult.status} - ${getThemeResult.ok ? 'SUCCESS' : 'FAILED'}`);

    console.log('Testing update theme settings...');
    const updateThemeResult = await makeRequest('POST', '/api/settings/theme', {
        theme: {
            primaryColor: '#F4A191',
            accentColor: '#4A9B9B'
        }
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    console.log(`Update theme: ${updateThemeResult.status} - ${updateThemeResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test author settings
    console.log('Testing get author settings...');
    const getAuthorResult = await makeRequest('GET', '/api/settings/author');
    console.log(`Get author: ${getAuthorResult.status} - ${getAuthorResult.ok ? 'SUCCESS' : 'FAILED'}`);

    console.log('Testing update author settings...');
    const updateAuthorResult = await makeRequest('POST', '/api/settings/author', {
        author: {
            name: 'Test Admin',
            email: 'admin@test.com',
            bio: 'Test bio'
        }
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    console.log(`Update author: ${updateAuthorResult.status} - ${updateAuthorResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test blog info settings
    console.log('Testing get blog info settings...');
    const getBlogInfoResult = await makeRequest('GET', '/api/settings/blog-info');
    console.log(`Get blog info: ${getBlogInfoResult.status} - ${getBlogInfoResult.ok ? 'SUCCESS' : 'FAILED'}`);

    console.log('Testing update blog info settings...');
    const updateBlogInfoResult = await makeRequest('POST', '/api/settings/blog-info', {
        blogInfo: {
            title: 'Test Blog',
            description: 'Test blog description'
        }
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    console.log(`Update blog info: ${updateBlogInfoResult.status} - ${updateBlogInfoResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test security settings
    console.log('Testing get security settings...');
    const getSecurityResult = await makeRequest('GET', '/api/settings/security');
    console.log(`Get security: ${getSecurityResult.status} - ${getSecurityResult.ok ? 'SUCCESS' : 'FAILED'}`);
}

async function testAnalyticsAPIs() {
    console.log('\n=== Testing Analytics APIs ===');

    // Test pageview tracking
    console.log('Testing pageview tracking...');
    const pageviewResult = await makeRequest('POST', '/api/analytics/pageview', {
        page: '/test-page',
        referrer: 'http://localhost:3000/',
        userAgent: 'Test User Agent'
    });
    console.log(`Pageview: ${pageviewResult.status} - ${pageviewResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test interaction tracking
    console.log('Testing interaction tracking...');
    const interactionResult = await makeRequest('POST', '/api/analytics/interaction', {
        type: 'click',
        target: 'test-button',
        value: 'test-value'
    });
    console.log(`Interaction: ${interactionResult.status} - ${interactionResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test get analytics (requires auth)
    console.log('Testing get analytics...');
    const getAnalyticsResult = await makeRequest('GET', '/api/analytics', null, {
        'Authorization': `Bearer ${authToken}`
    });
    console.log(`Get analytics: ${getAnalyticsResult.status} - ${getAnalyticsResult.ok ? 'SUCCESS' : 'FAILED'}`);
}

async function testOtherAPIs() {
    console.log('\n=== Testing Other APIs ===');

    // Test welcome endpoint
    console.log('Testing welcome endpoint...');
    const welcomeResult = await makeRequest('GET', '/api/welcome');
    console.log(`Welcome: ${welcomeResult.status} - ${welcomeResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test birthday endpoint
    console.log('Testing birthday endpoint...');
    const birthdayResult = await makeRequest('GET', '/api/birthday');
    console.log(`Birthday: ${birthdayResult.status} - ${birthdayResult.ok ? 'SUCCESS' : 'FAILED'}`);

    // Test newsletter subscription
    console.log('Testing newsletter subscription...');
    const subscribeResult = await makeRequest('POST', '/api/subscribe', {
        email: 'test@example.com'
    });
    console.log(`Subscribe: ${subscribeResult.status} - ${subscribeResult.ok ? 'SUCCESS' : 'FAILED'}`);
}

async function cleanupTestData() {
    console.log('\n=== Cleaning up test data ===');

    // Delete test post
    if (testPostId) {
        console.log('Deleting test post...');
        const deletePostResult = await makeRequest('DELETE', `/api/posts/${testPostId}`, null, {
            'Authorization': `Bearer ${authToken}`
        });
        console.log(`Delete post: ${deletePostResult.status} - ${deletePostResult.ok ? 'SUCCESS' : 'FAILED'}`);
    }

    // Delete test category
    if (testCategoryId) {
        console.log('Deleting test category...');
        const deleteCategoryResult = await makeRequest('DELETE', `/api/categories/${testCategoryId}`, null, {
            'Authorization': `Bearer ${authToken}`
        });
        console.log(`Delete category: ${deleteCategoryResult.status} - ${deleteCategoryResult.ok ? 'SUCCESS' : 'FAILED'}`);
    }

    // Test logout
    console.log('Testing logout...');
    const logoutResult = await makeRequest('POST', '/auth/logout');
    console.log(`Logout: ${logoutResult.status} - ${logoutResult.ok ? 'SUCCESS' : 'FAILED'}`);
}

async function runAllTests() {
    console.log('🚀 Starting comprehensive API testing...');
    console.log(`Base URL: ${BASE_URL}`);

    try {
        await testAuthAPIs();
        await testPostsAPIs();
        await testCategoriesAPIs();
        await testSettingsAPIs();
        await testAnalyticsAPIs();
        await testOtherAPIs();
        await cleanupTestData();

        console.log('\n✅ API testing completed!');
        console.log('Check the results above for any failures.');
    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
    }
}

runAllTests();
