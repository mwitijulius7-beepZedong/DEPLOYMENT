const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Mwitijulius7';

let authToken = '';

async function login() {
  try {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
    });

    const data = await response.json();
    console.log('Login response:', response.status, data);

    if (response.ok && data.success) {
      authToken = data.token;
      return true;
    }
    return false;
  } catch (error) {
    console.log('Login failed:', error.message);
    return false;
  }
}

async function makeRequest(method, url, body = null, requireAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (requireAuth && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${url}`, options);
    const data = await response.json();
    console.log(`${method} ${url}:`, response.status, data);
    return { response, data };
  } catch (error) {
    console.log(`${method} ${url} failed:`, error.message);
    return { response: null, data: null };
  }
}

async function testDeleteCategory() {
  console.log('Testing Delete Category API...\n');

  // Login first
  console.log('=== Logging in ===');
  const loggedIn = await login();
  if (!loggedIn) {
    console.log('Failed to login, cannot test delete category');
    return;
  }

  // Get current categories
  console.log('\n=== Getting current categories ===');
  const { data: categoriesData } = await makeRequest('GET', '/api/categories');
  if (!categoriesData || !categoriesData.categories || categoriesData.categories.length === 0) {
    console.log('No categories found to delete');
    return;
  }

  const categoryToDelete = categoriesData.categories[0];
  console.log('Will try to delete category:', categoryToDelete);

  // Try to delete the category
  console.log('\n=== Deleting category ===');
  const deleteResult = await makeRequest('DELETE', `/api/categories/${categoryToDelete.id}`, null, true);

  if (deleteResult.response && deleteResult.response.ok) {
    console.log('Category deleted successfully!');
  } else {
    console.log('Failed to delete category');
  }

  // Verify deletion by getting categories again
  console.log('\n=== Verifying deletion ===');
  await makeRequest('GET', '/api/categories');
}

// Run the test
testDeleteCategory().catch(console.error);
