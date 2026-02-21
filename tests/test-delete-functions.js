const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function makeRequest(method, url, body = null, authToken = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}${url}`, options);
        const data = await response.json().catch(() => ({}));
        return { status: response.status, ok: response.ok, data };
    } catch (error) {
        return { status: 0, ok: false, data: { error: error.message } };
    }
}

async function testDeleteFunctions() {
    console.log('=== Testing Delete Functions ===\n');

    // First, try to login
    console.log('1. Testing Login...');
    const loginResult = await makeRequest('POST', '/auth/login', {
        username: 'admin',
        password: 'Mwitijulius7@Jm'
    });
    console.log(`   Login: ${loginResult.status} - ${loginResult.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Response: ${JSON.stringify(loginResult.data)}\n`);

    if (!loginResult.ok || !loginResult.data.token) {
        console.log('Cannot proceed with authenticated tests without login');
        return;
    }

    const authToken = loginResult.data.token;
    console.log(`   Got auth token: ${authToken.substring(0, 20)}...\n`);

    // Test 1: Get categories first
    console.log('2. Testing GET Categories...');
    const getCategoriesResult = await makeRequest('GET', '/api/categories');
    console.log(`   Get Categories: ${getCategoriesResult.status} - ${getCategoriesResult.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Categories: ${JSON.stringify(getCategoriesResult.data)}\n`);

    // Test 2: Create a test category to delete
    console.log('3. Testing CREATE Category (for deletion test)...');
    const createCategoryResult = await makeRequest('POST', '/api/categories', {
        name: 'Test Category for Deletion',
        description: 'This category will be deleted'
    }, authToken);
    console.log(`   Create Category: ${createCategoryResult.status} - ${createCategoryResult.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Response: ${JSON.stringify(createCategoryResult.data)}\n`);

    if (createCategoryResult.ok && createCategoryResult.data.category) {
        const categoryId = createCategoryResult.data.category.id;

        // Test 3: Delete the category
        console.log(`4. Testing DELETE Category (ID: ${categoryId})...`);
        const deleteCategoryResult = await makeRequest('DELETE', `/api/categories/${categoryId}`, null, authToken);
        console.log(`   Delete Category: ${deleteCategoryResult.status} - ${deleteCategoryResult.ok ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   Response: ${JSON.stringify(deleteCategoryResult.data)}\n`);
    }

    // Test 4: Get posts
    console.log('5. Testing GET Posts...');
    const getPostsResult = await makeRequest('GET', '/api/posts');
    console.log(`   Get Posts: ${getPostsResult.status} - ${getPostsResult.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Posts count: ${getPostsResult.data.posts?.length || 0}\n`);

    // Test 5: Create a test post to delete
    console.log('6. Testing CREATE Post (for deletion test)...');
    const createPostResult = await makeRequest('POST', '/api/posts', {
        title: 'Test Post for Deletion',
        content: 'This post will be deleted',
        author: 'Test Author',
        tags: ['test', 'deletion']
    }, authToken);
    console.log(`   Create Post: ${createPostResult.status} - ${createPostResult.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Response: ${JSON.stringify(createPostResult.data)}\n`);

    if (createPostResult.ok && createPostResult.data.post) {
        const postId = createPostResult.data.post.id;

        // Test 6: Delete the post
        console.log(`7. Testing DELETE Post (ID: ${postId})...`);
        const deletePostResult = await makeRequest('DELETE', `/api/posts/${postId}`, null, authToken);
        console.log(`   Delete Post: ${deletePostResult.status} - ${deletePostResult.ok ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   Response: ${JSON.stringify(deletePostResult.data)}\n`);
    }

    // Test 7: Test Logout
    console.log('8. Testing Logout...');
    const logoutResult = await makeRequest('POST', '/auth/logout');
    console.log(`   Logout: ${logoutResult.status} - ${logoutResult.ok ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Response: ${JSON.stringify(logoutResult.data)}\n`);

    console.log('=== Delete Functions Testing Complete ===');
}

testDeleteFunctions().catch(console.error);
