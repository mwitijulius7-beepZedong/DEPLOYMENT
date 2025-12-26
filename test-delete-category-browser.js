// Browser-based test for delete category functionality
// Run this in the browser console when logged in to admin.html or admin_page.html

async function testDeleteCategory() {
    console.log('Testing Delete Category API...\n');

    try {
        // Get current categories
        console.log('=== Getting current categories ===');
        const categoriesResponse = await fetch('/api/categories', {
            credentials: 'include'
        });
        const categoriesData = await categoriesResponse.json();
        console.log('Categories response:', categoriesResponse.status, categoriesData);

        if (!categoriesData.categories || categoriesData.categories.length === 0) {
            console.log('No categories found to delete');
            return;
        }

        const categoryToDelete = categoriesData.categories[0];
        console.log('Will try to delete category:', categoryToDelete);

        // Try to delete the category
        console.log('\n=== Deleting category ===');
        const deleteResponse = await fetch(`/api/categories/${categoryToDelete.id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const deleteData = await deleteResponse.json();
        console.log('Delete response:', deleteResponse.status, deleteData);

        if (deleteResponse.ok) {
            console.log('✅ Category deleted successfully!');
        } else {
            console.log('❌ Failed to delete category');
        }

        // Verify deletion by getting categories again
        console.log('\n=== Verifying deletion ===');
        const verifyResponse = await fetch('/api/categories', {
            credentials: 'include'
        });
        const verifyData = await verifyResponse.json();
        console.log('Verification response:', verifyResponse.status, verifyData);

        const remainingCategories = verifyData.categories || [];
        const deleted = !remainingCategories.some(c => c.id === categoryToDelete.id);
        console.log(deleted ? '✅ Category successfully removed from list' : '❌ Category still exists in list');

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testDeleteCategory();
