const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
let authToken = '';
let testData = {
    postId: null,
    categoryId: null,
    commentId: null,
    userId: null
};

const RESULTS = {
    success: [],
    failed: [],
    skipped: []
};

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
        const contentType = response.headers.get('content-type');
        let data = {};
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json().catch(() => ({}));
        }
        
        return { 
            status: response.status, 
            data, 
            ok: response.ok,
            statusText: response.statusText
        };
    } catch (error) {
        return { 
            status: 0, 
            data: { error: error.message }, 
            ok: false,
            error: error.message
        };
    }
}

function logTest(name, passed, details = '') {
    const icon = passed ? '✅' : '❌';
    const message = `${icon} ${name}`;
    console.log(message + (details ? ` (${details})` : ''));
    
    if (passed) {
        RESULTS.success.push(name);
    } else {
        RESULTS.failed.push(name);
    }
}

async function testAuthEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         AUTHENTICATION ENDPOINTS       ║');
    console.log('╚════════════════════════════════════════╝');

    // Check setup status
    console.log('\n[GET] /auth/setup-status');
    const setupStatus = await makeRequest('GET', '/auth/setup-status');
    logTest('Get setup status', setupStatus.ok, `Status: ${setupStatus.status}`);

    // Check auth status (without auth token)
    console.log('\n[GET] /auth/status (public)');
    const authStatus = await makeRequest('GET', '/auth/status');
    logTest('Get auth status (public)', authStatus.ok, `Status: ${authStatus.status}`);

    // Try login with actual credentials
    console.log('\n[POST] /auth/login');
    const loginRes = await makeRequest('POST', '/auth/login', {
        username: 'Mwitijulius7',
        password: 'Mwitijulius7@Jm'
    });
    logTest('Login with admin credentials', loginRes.ok, `Status: ${loginRes.status}`);
    
    if (loginRes.ok && loginRes.data.token) {
        authToken = loginRes.data.token;
        console.log(`  ✓ Got auth token: ${authToken.substring(0, 20)}...`);
    } else {
        console.log(`  ℹ Response: ${JSON.stringify(loginRes.data).substring(0, 150)}`);
    }

    // Test logout
    console.log('\n[POST] /auth/logout');
    const logoutRes = await makeRequest('POST', '/auth/logout');
    logTest('Logout', logoutRes.ok, `Status: ${logoutRes.status}`);
}

async function testPostsEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║            POSTS ENDPOINTS             ║');
    console.log('╚════════════════════════════════════════╝');

    // Get all posts
    console.log('\n[GET] /api/posts');
    const getPosts = await makeRequest('GET', '/api/posts');
    logTest('GET all posts', getPosts.ok, `Status: ${getPosts.status}`);
    if (getPosts.ok && getPosts.data.posts) {
        console.log(`  ✓ Found ${getPosts.data.posts.length} posts`);
    }

    // Get single post (if posts exist)
    if (getPosts.ok && getPosts.data.posts && getPosts.data.posts.length > 0) {
        const postId = getPosts.data.posts[0].id;
        console.log(`\n[GET] /api/posts/${postId}`);
        const getPost = await makeRequest('GET', `/api/posts/${postId}`);
        logTest('GET single post', getPost.ok, `Status: ${getPost.status}`);
    }

    // Create post (requires auth)
    if (authToken) {
        console.log('\n[POST] /api/posts (create)');
        const createPost = await makeRequest('POST', '/api/posts', {
            title: 'Test Post - ' + Date.now(),
            content: 'This is a test post created by automated testing',
            author: 'Test Admin',
            tags: ['test', 'automated'],
            isDraft: true
        }, {
            'Authorization': `Bearer ${authToken}`
        });
        logTest('POST create post', createPost.ok, `Status: ${createPost.status}`);
        if (createPost.ok && createPost.data.post) {
            testData.postId = createPost.data.post.id;
            console.log(`  ✓ Created post ID: ${testData.postId}`);
        } else {
            console.log(`  ℹ Response: ${JSON.stringify(createPost.data).substring(0, 100)}`);
        }

        // Update post
        if (testData.postId) {
            console.log(`\n[PUT] /api/posts/${testData.postId}`);
            const updatePost = await makeRequest('PUT', `/api/posts/${testData.postId}`, {
                title: 'Updated Test Post - ' + Date.now(),
                content: 'This post was updated by automated testing'
            }, {
                'Authorization': `Bearer ${authToken}`
            });
            logTest('PUT update post', updatePost.ok, `Status: ${updatePost.status}`);
        }
    }
}

async function testCategoriesEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         CATEGORIES ENDPOINTS           ║');
    console.log('╚════════════════════════════════════════╝');

    // Get all categories
    console.log('\n[GET] /api/categories');
    const getCategories = await makeRequest('GET', '/api/categories');
    logTest('GET all categories', getCategories.ok, `Status: ${getCategories.status}`);
    if (getCategories.ok && getCategories.data.categories) {
        console.log(`  ✓ Found ${getCategories.data.categories.length} categories`);
    }

    // Create category (requires auth)
    if (authToken) {
        console.log('\n[POST] /api/categories');
        const createCat = await makeRequest('POST', '/api/categories', {
            name: 'Test Category - ' + Date.now(),
            description: 'Automated test category'
        }, {
            'Authorization': `Bearer ${authToken}`
        });
        logTest('POST create category', createCat.ok, `Status: ${createCat.status}`);
        if (createCat.ok && createCat.data.category) {
            testData.categoryId = createCat.data.category.id;
            console.log(`  ✓ Created category ID: ${testData.categoryId}`);
        } else {
            console.log(`  ℹ Response: ${JSON.stringify(createCat.data).substring(0, 100)}`);
        }

        // Update category
        if (testData.categoryId) {
            console.log(`\n[PUT] /api/categories/${testData.categoryId}`);
            const updateCat = await makeRequest('PUT', `/api/categories/${testData.categoryId}`, {
                name: 'Updated Category - ' + Date.now(),
                description: 'Updated by automated testing'
            }, {
                'Authorization': `Bearer ${authToken}`
            });
            logTest('PUT update category', updateCat.ok, `Status: ${updateCat.status}`);
        }
    }
}

async function testSettingsEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║           SETTINGS ENDPOINTS           ║');
    console.log('╚════════════════════════════════════════╝');

    const endpoints = [
        { method: 'GET', path: '/api/settings/theme', name: 'Theme (GET)' },
        { method: 'GET', path: '/api/settings/author', name: 'Author (GET)' },
        { method: 'GET', path: '/api/settings/blog-info', name: 'Blog Info (GET)' },
        { method: 'GET', path: '/api/settings/security', name: 'Security (GET)' },
        { method: 'GET', path: '/api/settings/notifications', name: 'Notifications (GET)' },
        { method: 'GET', path: '/api/settings/content', name: 'Content (GET)' },
        { method: 'GET', path: '/api/settings/background', name: 'Background (GET)' },
        { method: 'GET', path: '/api/settings/backgrounds', name: 'Backgrounds (GET)' }
    ];

    for (const endpoint of endpoints) {
        console.log(`\n[${endpoint.method}] ${endpoint.path}`);
        const result = await makeRequest(endpoint.method, endpoint.path);
        logTest(endpoint.name, result.ok, `Status: ${result.status}`);
    }

    // Test settings updates (with auth)
    if (authToken) {
        console.log('\n[POST] /api/settings/theme (update)');
        const updateTheme = await makeRequest('POST', '/api/settings/theme', {
            theme: { primaryColor: '#FF5733' }
        }, {
            'Authorization': `Bearer ${authToken}`
        });
        logTest('Theme update', updateTheme.ok, `Status: ${updateTheme.status}`);
    }
}

async function testAnalyticsEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║          ANALYTICS ENDPOINTS           ║');
    console.log('╚════════════════════════════════════════╝');

    // Pageview tracking
    console.log('\n[POST] /api/analytics/pageview');
    const pageview = await makeRequest('POST', '/api/analytics/pageview', {
        page: '/test',
        referrer: 'http://localhost',
        userAgent: 'Test Agent'
    });
    logTest('POST pageview', pageview.ok, `Status: ${pageview.status}`);

    // Interaction tracking
    console.log('\n[POST] /api/analytics/interaction');
    const interaction = await makeRequest('POST', '/api/analytics/interaction', {
        type: 'click',
        target: 'test-button'
    });
    logTest('POST interaction', interaction.ok, `Status: ${interaction.status}`);

    // Get analytics (requires auth)
    if (authToken) {
        console.log('\n[GET] /api/analytics');
        const analytics = await makeRequest('GET', '/api/analytics', null, {
            'Authorization': `Bearer ${authToken}`
        });
        logTest('GET analytics', analytics.ok, `Status: ${analytics.status}`);

        console.log('\n[GET] /api/analytics/export');
        const export_report = await makeRequest('GET', '/api/analytics/export', null, {
            'Authorization': `Bearer ${authToken}`
        });
        logTest('GET analytics export', export_report.ok, `Status: ${export_report.status}`);
    }
}

async function testCommentsEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║          COMMENTS ENDPOINTS            ║');
    console.log('╚════════════════════════════════════════╝');

    // Get comments for a post
    console.log('\n[GET] /api/comments/:postId');
    const getComments = await makeRequest('GET', '/api/comments/test');
    logTest('GET comments for post', getComments.ok, `Status: ${getComments.status}`);

    // Post a comment - FIXED: use "name" instead of "author"
    console.log('\n[POST] /api/comments');
    const postComment = await makeRequest('POST', '/api/comments', {
        postId: '123',
        name: 'Test User',
        email: 'test@example.com',
        content: 'This is a test comment'
    });
    logTest('POST new comment', postComment.ok, `Status: ${postComment.status}`);
    if (postComment.ok && postComment.data.comment) {
        testData.commentId = postComment.data.comment.id;
        console.log(`  ✓ Created comment ID: ${testData.commentId}`);
    } else {
        console.log(`  ℹ Response: ${JSON.stringify(postComment.data).substring(0, 100)}`);
    }
}

async function testOtherEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║            OTHER ENDPOINTS             ║');
    console.log('╚════════════════════════════════════════╝');

    const endpoints = [
        { method: 'GET', path: '/api/welcome', name: 'Welcome' },
        { method: 'GET', path: '/api/birthday', name: 'Birthday' },
        { method: 'POST', path: '/api/subscribe', name: 'Subscribe', body: { email: 'test@example.com' } },
        { method: 'GET', path: '/', name: 'Home Page' },
        { method: 'GET', path: '/admin', name: 'Admin Page' },
        { method: 'GET', path: '/admin.html', name: 'Admin HTML' },
        { method: 'GET', path: '/login.html', name: 'Login HTML' },
        { method: 'GET', path: '/post.html', name: 'Post HTML' },
        { method: 'GET', path: '/about.html', name: 'About HTML' }
    ];

    for (const endpoint of endpoints) {
        console.log(`\n[${endpoint.method}] ${endpoint.path}`);
        const result = await makeRequest(endpoint.method, endpoint.path, endpoint.body);
        logTest(endpoint.name, result.ok, `Status: ${result.status}`);
    }
}

async function testUserEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║             USER ENDPOINTS             ║');
    console.log('╚════════════════════════════════════════╝');

    if (authToken) {
        // Get users
        console.log('\n[GET] /api/users');
        const getUsers = await makeRequest('GET', '/api/users', null, {
            'Authorization': `Bearer ${authToken}`
        });
        logTest('GET users', getUsers.ok, `Status: ${getUsers.status}`);
    } else {
        console.log('⏭️  Skipped (no auth token)');
    }
}

async function testSubscriptionsEndpoints() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║       SUBSCRIPTIONS ENDPOINTS          ║');
    console.log('╚════════════════════════════════════════╝');

    if (authToken) {
        console.log('\n[GET] /api/subscriptions');
        const getSubscriptions = await makeRequest('GET', '/api/subscriptions', null, {
            'Authorization': `Bearer ${authToken}`
        });
        logTest('GET subscriptions', getSubscriptions.ok, `Status: ${getSubscriptions.status}`);
    } else {
        console.log('⏭️  Skipped (no auth token)');
    }
}

async function cleanupTestData() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║           CLEANUP TEST DATA            ║');
    console.log('╚════════════════════════════════════════╝');

    if (authToken) {
        if (testData.postId) {
            console.log(`\n[DELETE] /api/posts/${testData.postId}`);
            const deletePost = await makeRequest('DELETE', `/api/posts/${testData.postId}`, null, {
                'Authorization': `Bearer ${authToken}`
            });
            logTest('DELETE post', deletePost.ok, `Status: ${deletePost.status}`);
        }

        if (testData.categoryId) {
            console.log(`\n[DELETE] /api/categories/${testData.categoryId}`);
            const deleteCat = await makeRequest('DELETE', `/api/categories/${testData.categoryId}`, null, {
                'Authorization': `Bearer ${authToken}`
            });
            logTest('DELETE category', deleteCat.ok, `Status: ${deleteCat.status}`);
        }

        if (testData.commentId) {
            console.log(`\n[DELETE] /api/comments/${testData.commentId}`);
            const deleteComment = await makeRequest('DELETE', `/api/comments/${testData.commentId}`, null, {
                'Authorization': `Bearer ${authToken}`
            });
            logTest('DELETE comment', deleteComment.ok, `Status: ${deleteComment.status}`);
        }
    }
}

function printSummary() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║           TEST SUMMARY REPORT          ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log(`✅ Passed: ${RESULTS.success.length}`);
    console.log(`❌ Failed: ${RESULTS.failed.length}`);
    console.log(`⏭️  Skipped: ${RESULTS.skipped.length}`);
    console.log(`📊 Total: ${RESULTS.success.length + RESULTS.failed.length}`);

    const totalTests = RESULTS.success.length + RESULTS.failed.length;
    const successRate = totalTests > 0 ? ((RESULTS.success.length / totalTests) * 100).toFixed(1) : '0';
    console.log(`\n📈 Success Rate: ${successRate}%`);

    if (RESULTS.failed.length > 0) {
        console.log('\n❌ Failed Endpoints:');
        RESULTS.failed.forEach(name => console.log(`   - ${name}`));
    } else {
        console.log('\n🎉 All tests passed!');
    }
}

async function runAllTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   COMPREHENSIVE API ENDPOINT TEST      ║');
    console.log('║      ' + new Date().toLocaleString() + '          ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`Base URL: ${BASE_URL}\n`);

    try {
        await testAuthEndpoints();
        await testPostsEndpoints();
        await testCategoriesEndpoints();
        await testSettingsEndpoints();
        await testAnalyticsEndpoints();
        await testCommentsEndpoints();
        await testUserEndpoints();
        await testSubscriptionsEndpoints();
        await testOtherEndpoints();
        await cleanupTestData();
        
        printSummary();
        console.log('\n✨ Testing complete!\n');
        process.exit(RESULTS.failed.length > 0 ? 1 : 0);
    } catch (error) {
        console.error('\n❌ Test suite encountered an error:', error.message);
        process.exit(1);
    }
}

runAllTests();
