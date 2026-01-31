#!/usr/bin/env node
/**
 * Comprehensive Category CRUD Testing Script
 * Tests creating, reading, updating, and deleting categories
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
let jwtToken = null;

// Helper function for API requests
async function makeRequest(method, path, body = null, headers = {}) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            credentials: 'include'
        };

        if (jwtToken) {
            options.headers['Authorization'] = `Bearer ${jwtToken}`;
        }

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${BASE_URL}${path}`, options);
        const data = await response.json();

        return { status: response.status, ok: response.ok, data };
    } catch (error) {
        console.error(`Error ${method} ${path}:`, error.message);
        return { status: 0, ok: false, error: error.message };
    }
}

// Login with admin credentials
async function login() {
    console.log('\n=== LOGGING IN ===');
    const result = await makeRequest('POST', '/auth/login', {
        username: 'admin',
        password: 'Mwitijulius7@Jm'
    });

    if (result.ok && result.data.token) {
        jwtToken = result.data.token;
        console.log('✓ Login successful');
        console.log('Token:', jwtToken.substring(0, 20) + '...');
        return true;
    } else {
        console.log('✗ Login failed:', result.data);
        return false;
    }
}

// Get all categories
async function getAllCategories() {
    console.log('\n=== GETTING ALL CATEGORIES ===');
    const result = await makeRequest('GET', '/api/categories');

    if (result.ok) {
        console.log(`✓ Retrieved ${result.data.categories?.length || 0} categories`);
        result.data.categories?.forEach(cat => {
            console.log(`  - ${cat.name} (ID: ${cat.id})`);
        });
        return result.data.categories || [];
    } else {
        console.log('✗ Failed to get categories:', result.data);
        return [];
    }
}

// Create a category
async function createCategory(name, description) {
    console.log(`\n=== CREATING CATEGORY: "${name}" ===`);
    const result = await makeRequest('POST', '/api/categories', {
        name,
        description
    });

    if (result.ok && result.data.success) {
        console.log('✓ Category created successfully');
        console.log(`  ID: ${result.data.category?.id}`);
        console.log(`  Name: ${result.data.category?.name}`);
        return result.data.category;
    } else {
        console.log('✗ Failed to create category:', result.data);
        return null;
    }
}

// Update a category
async function updateCategory(id, name, description) {
    console.log(`\n=== UPDATING CATEGORY ${id}: "${name}" ===`);
    const result = await makeRequest('PUT', `/api/categories/${id}`, {
        name,
        description
    });

    if (result.ok && result.data.success) {
        console.log('✓ Category updated successfully');
        return result.data.category;
    } else {
        console.log('✗ Failed to update category:', result.data);
        return null;
    }
}

// Delete a category
async function deleteCategory(id) {
    console.log(`\n=== DELETING CATEGORY ${id} ===`);
    const result = await makeRequest('DELETE', `/api/categories/${id}`);

    if (result.ok && result.data.success) {
        console.log('✓ Category deleted successfully');
        return true;
    } else {
        console.log('✗ Failed to delete category:', result.data);
        return false;
    }
}

// Main test sequence
async function runTests() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  COMPREHENSIVE CATEGORY CRUD TEST                      ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    // 1. Login
    const loginOk = await login();
    if (!loginOk) {
        console.log('\n✗ TESTS FAILED: Could not login');
        process.exit(1);
    }

    // 2. Get initial categories
    let categories = await getAllCategories();
    const initialCount = categories.length;

    // 3. Create multiple test categories
    console.log('\n--- Creating Test Categories ---');
    const testCat1 = await createCategory('Technology', 'Tech news and updates');
    const testCat2 = await createCategory('Design', 'Design trends and tutorials');
    const testCat3 = await createCategory('Business', 'Business insights and tips');

    // 4. Get categories again to verify creation
    categories = await getAllCategories();
    const afterCreateCount = categories.length;
    console.log(`\nCreated: ${afterCreateCount - initialCount} new categories`);

    // 5. Update a category
    if (testCat1) {
        await updateCategory(testCat1.id, 'Technology (Updated)', 'Updated tech content');
    }

    // 6. Get categories after update
    categories = await getAllCategories();

    // 7. Delete one category
    if (testCat2) {
        await deleteCategory(testCat2.id);
    }

    // 8. Get categories after deletion
    categories = await getAllCategories();
    const afterDeleteCount = categories.length;

    // 9. Delete multiple categories in sequence
    if (testCat1) {
        await deleteCategory(testCat1.id);
    }
    if (testCat3) {
        await deleteCategory(testCat3.id);
    }

    // 10. Final category check
    categories = await getAllCategories();
    const finalCount = categories.length;

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  TEST SUMMARY                                           ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`Initial categories: ${initialCount}`);
    console.log(`After creation: ${afterCreateCount} (+${afterCreateCount - initialCount})`);
    console.log(`After update: ${afterDeleteCount}`);
    console.log(`Final categories: ${finalCount}`);
    console.log('\n✓ ALL TESTS COMPLETED');
}

runTests().catch(error => {
    console.error('FATAL ERROR:', error);
    process.exit(1);
});
