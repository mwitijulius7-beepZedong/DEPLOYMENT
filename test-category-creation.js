const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testCategoryCreation() {
    console.log('🧪 Testing Category Creation and Management Functions...\n');

    try {
        // Step 1: Login to get token
        console.log('1. Logging in as admin...');
        const loginResponse = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' })
        });
        const loginData = await loginResponse.json();
        if (!loginData.token) {
            throw new Error('Login failed: ' + JSON.stringify(loginData));
        }
        const token = loginData.token;
        console.log('✅ Login successful, token received\n');

        // Step 2: Check initial categories
        console.log('2. Checking initial categories...');
        const initialCategoriesResponse = await fetch(`${BASE_URL}/api/categories`);
        const initialCategories = await initialCategoriesResponse.json();
        console.log(`✅ Initial categories: ${initialCategories.categories.length}\n`);

        // Step 3: Create a new category
        console.log('3. Creating a new category...');
        const createCategoryResponse = await fetch(`${BASE_URL}/api/categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: 'Test Category', description: 'A test category for verification' })
        });
        const createCategoryData = await createCategoryResponse.json();
        if (createCategoryData.error) {
            throw new Error('Category creation failed: ' + JSON.stringify(createCategoryData));
        }
        console.log('✅ Category created successfully\n');

        // Step 4: Verify category was created
        console.log('4. Verifying category creation...');
        const afterCreateCategoriesResponse = await fetch(`${BASE_URL}/api/categories`);
        const afterCreateCategories = await afterCreateCategoriesResponse.json();
        if (afterCreateCategories.categories.length !== initialCategories.categories.length + 1) {
            throw new Error('Category count did not increase after creation');
        }
        const newCategory = afterCreateCategories.categories.find(c => c.name === 'Test Category');
        if (!newCategory) {
            throw new Error('New category not found in list');
        }
        console.log('✅ Category verified in list\n');

        // Step 5: Create a post in the category
        console.log('5. Creating a post in the category...');
        const createPostResponse = await fetch(`${BASE_URL}/api/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: 'Test Post',
                content: 'This is a test post content',
                category: newCategory.id,
                excerpt: 'Test excerpt'
            })
        });
        const createPostData = await createPostResponse.json();
        if (createPostData.error) {
            throw new Error('Post creation failed: ' + JSON.stringify(createPostData));
        }
        console.log('✅ Post created successfully\n');

        // Step 6: Verify post was created
        console.log('6. Verifying post creation...');
        const postsResponse = await fetch(`${BASE_URL}/api/posts`);
        const postsData = await postsResponse.json();
        if (postsData.posts.length !== 1) {
            throw new Error('Post count should be 1 after creation');
        }
        console.log('✅ Post verified in list\n');

        // Step 7: Delete the category
        console.log('7. Deleting the test category...');
        const deleteCategoryResponse = await fetch(`${BASE_URL}/api/categories/${newCategory.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const deleteCategoryData = await deleteCategoryResponse.json();
        if (deleteCategoryData.error) {
            throw new Error('Category deletion failed: ' + JSON.stringify(deleteCategoryData));
        }
        console.log('✅ Category deleted successfully\n');

        // Step 8: Verify category was deleted
        console.log('8. Verifying category deletion...');
        const finalCategoriesResponse = await fetch(`${BASE_URL}/api/categories`);
        const finalCategories = await finalCategoriesResponse.json();
        if (finalCategories.categories.length !== initialCategories.categories.length) {
            throw new Error('Category count did not return to initial after deletion');
        }
        console.log('✅ Category deletion verified\n');

        console.log('🎉 All tests passed! Category creation, management, and show posts functions are working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testCategoryCreation();
