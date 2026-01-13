// Settings module
export function showSettingsSection() {
    // Hide other sections
    const sections = ['dashboard', 'posts-section', 'analytics-section', 'customize-section', 'create-post-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const settingsSection = document.getElementById('settings-section');
    settingsSection.style.display = 'block';
    settingsSection.scrollIntoView({ behavior: 'smooth' });

    // Initialize navigation and password toggle when settings section is shown
    if (typeof initSettingsNavigation === 'function') {
        initSettingsNavigation();
    }
    if (typeof initPasswordToggle === 'function') {
        initPasswordToggle();
    }
}

export function toggleCategoriesList() {
    const categoriesListContainer = document.getElementById('categories-list-container');
    if (categoriesListContainer.style.display === 'none') {
        categoriesListContainer.style.display = 'block';
        loadCategories(); // Load categories when showing
    } else {
        categoriesListContainer.style.display = 'none';
    }
}

export async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        const categoriesList = document.getElementById('categories-list');

        if (data.categories && data.categories.length > 0) {
            categoriesList.innerHTML = data.categories.map(category => `
                <div class="category-item" style="padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 8px; background: #f9f9f9;">
                    <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                        <input type="checkbox" class="category-checkbox" data-category-id="${category.id}" onchange="updateSelectedCategoriesCount()">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 8px 0; font-size: 16px;">${category.name}</h4>
                            <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">${category.description || 'No description'}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="action-btn" style="padding: 6px 12px; font-size: 12px;" onclick="editCategory('${category.id}')">Edit</button>
                        <button class="action-btn secondary" style="padding: 6px 12px; font-size: 12px;" onclick="deleteCategory('${category.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            categoriesList.innerHTML = '<p>No categories found.</p>';
        }
        // Reset select all checkbox and selected count
        document.getElementById('select-all-categories').checked = false;
        updateSelectedCategoriesCount();
    } catch (error) {
        console.error('Failed to load categories:', error);
        document.getElementById('categories-list').innerHTML = '<p>Error loading categories.</p>';
    }
}

export async function addCategory() {
    const categoryName = document.getElementById('category-name').value.trim();
    const categoryDescription = document.getElementById('category-description').value.trim();
    const addButton = document.querySelector('[onclick="addCategory()"]');

    if (!categoryName) {
        alert('Please enter a category name.');
        return;
    }

    // Disable button and show loading state
    if (addButton) {
        addButton.disabled = true;
        addButton.textContent = 'Adding...';
    }

    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: categoryName, description: categoryDescription })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Category added successfully!');
            document.getElementById('category-name').value = '';
            document.getElementById('category-description').value = '';
            await loadCategories(); // Refresh the list
        } else {
            const errorMessage = data.error || data.message || 'Failed to add category.';
            alert(`Error: ${errorMessage}`);
        }
    } catch (error) {
        console.error('Error adding category:', error);
        alert('Network error: Failed to add category. Please check your connection and try again.');
    } finally {
        // Re-enable button and restore text
        if (addButton) {
            addButton.disabled = false;
            addButton.textContent = 'Add Category';
        }
    }
}

export function editCategory(categoryId) {
    alert(`Edit category functionality - This would open a form to edit category with ID: ${categoryId}`);
}

export async function deleteCategory(categoryId) {
    if (confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
        const deleteButton = event?.target;
        const originalText = deleteButton?.textContent;

        // Disable button and show loading state
        if (deleteButton) {
            deleteButton.disabled = true;
            deleteButton.textContent = 'Deleting...';
        }

        try {
            const response = await fetch(`/api/categories/${categoryId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                alert('Category deleted successfully!');
                await loadCategories(); // Refresh the list
            } else {
                const errorMessage = data.error || data.message || 'Failed to delete category.';
                alert(`Error: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            alert('Network error: Failed to delete category. Please check your connection and try again.');
        } finally {
            // Re-enable button and restore text
            if (deleteButton) {
                deleteButton.disabled = false;
                deleteButton.textContent = originalText || 'Delete';
            }
        }
    }
}

export function toggleSelectAllCategories() {
    const selectAllCheckbox = document.getElementById('select-all-categories');
    const categoryCheckboxes = document.querySelectorAll('.category-checkbox');
    categoryCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    updateSelectedCategoriesCount();
}

export function updateSelectedCategoriesCount() {
    const categoryCheckboxes = document.querySelectorAll('.category-checkbox');
    const checkedCount = Array.from(categoryCheckboxes).filter(cb => cb.checked).length;
    const deleteButton = document.getElementById('delete-selected-categories');
    const countSpan = document.getElementById('selected-categories-count');

    countSpan.textContent = checkedCount;
    deleteButton.style.display = checkedCount > 0 ? 'inline-block' : 'none';
}

export async function deleteSelectedCategories() {
    const categoryCheckboxes = document.querySelectorAll('.category-checkbox:checked');
    const selectedIds = Array.from(categoryCheckboxes).map(cb => cb.getAttribute('data-category-id'));

    if (selectedIds.length === 0) {
        alert('No categories selected.');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected categor(y/ies)?`)) {
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const categoryId of selectedIds) {
        try {
            const response = await fetch(`/api/categories/${categoryId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            errorCount++;
        }
    }

    if (successCount > 0) {
        alert(`${successCount} categor(y/ies) deleted successfully!`);
        loadCategories(); // Refresh the list
    }

    if (errorCount > 0) {
        alert(`Failed to delete ${errorCount} categor(y/ies).`);
    }
}

export async function saveAuthorInfo() {
    const authorName = document.getElementById('author-name').value;
    const authorEmail = document.getElementById('author-email').value;
    const authorBio = document.getElementById('author-bio').value;
    const authorPhone = document.getElementById('author-phone').value;
    const authorWhatsapp = document.getElementById('author-whatsapp').value;
    const authorTwitter = document.getElementById('author-twitter').value;
    const authorFacebook = document.getElementById('author-facebook').value;
    const authorLinkedin = document.getElementById('author-linkedin').value;
    const authorInstagram = document.getElementById('author-instagram').value;
    const authorWebsite = document.getElementById('author-website').value;

    try {
        const response = await fetch('/api/settings/author', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name: authorName,
                email: authorEmail,
                bio: authorBio,
                phone: authorPhone,
                whatsapp: authorWhatsapp,
                twitter: authorTwitter,
                facebook: authorFacebook,
                linkedin: authorLinkedin,
                instagram: authorInstagram,
                website: authorWebsite
            })
        });

        if (response.ok) {
            alert('Author information saved successfully!');
        } else {
            alert('Failed to save author information.');
        }
    } catch (error) {
        console.error('Error saving author information:', error);
        alert('Error saving author information.');
    }
}

export async function saveSecuritySettings() {
    const adminEntryKey = document.getElementById('admin-entry-key').value;
    const sessionTimeout = document.getElementById('session-timeout').value;

    try {
        const response = await fetch('/api/settings/security', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ adminEntryKey, sessionTimeout: parseInt(sessionTimeout) })
        });

        if (response.ok) {
            alert('Security settings saved successfully!');
        } else {
            alert('Failed to save security settings.');
        }
    } catch (error) {
        console.error('Error saving security settings:', error);
        alert('Error saving security settings.');
    }
}

export async function viewCurrentKey() {
    const password = prompt('Enter your admin password to view the current key:');
    if (!password) return;

    try {
        const response = await fetch('/api/settings/security/key-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username: 'admin', password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert(`Current Admin Entry Key: ${data.key || '(empty)'}`);
        } else {
            alert('Failed to retrieve key: ' + (data.error || 'Authentication failed'));
        }
    } catch (error) {
        console.error('Error viewing current key:', error);
        alert('Error viewing current key.');
    }
}

export async function clearKey() {
    if (!confirm('Are you sure you want to clear the admin entry key? This will remove the current key.')) {
        return;
    }

    document.getElementById('admin-entry-key').value = '';
    await saveSecuritySettings();
}

export async function saveNotificationSettings() {
    const emailNotifications = document.getElementById('email-notifications').checked;
    const commentNotifications = document.getElementById('comment-notifications').checked;
    const systemAlerts = document.getElementById('system-alerts').checked;

    try {
        const response = await fetch('/api/settings/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ emailNotifications, commentNotifications, systemAlerts })
        });

        if (response.ok) {
            alert('Notification settings saved successfully!');
        } else {
            alert('Failed to save notification settings.');
        }
    } catch (error) {
        console.error('Error saving notification settings:', error);
        alert('Error saving notification settings.');
    }
}

export async function saveContentSettings() {
    const postsPerPage = document.getElementById('posts-per-page').value;
    const autoPublish = document.getElementById('auto-publish').checked;
    const enableComments = document.getElementById('enable-comments').checked;

    try {
        const response = await fetch('/api/settings/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ postsPerPage: parseInt(postsPerPage), autoPublish, enableComments })
        });

        if (response.ok) {
            alert('Content settings saved successfully!');
        } else {
            alert('Failed to save content settings.');
        }
    } catch (error) {
        console.error('Error saving content settings:', error);
        alert('Error saving content settings.');
    }
}

export async function handleProfilePictureUpload() {
    const fileInput = document.getElementById('profile-picture-file');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a file first.');
        return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB.');
        return;
    }

    const formData = new FormData();
    formData.append('profilePicture', file);

    try {
        const response = await fetch('/api/settings/author/profile-picture', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            alert('Profile picture uploaded successfully!');
            // Update the header logo if needed
            if (data.profilePictureUrl) {
                document.querySelector('.logo img').src = data.profilePictureUrl;
            }
        } else {
            alert('Failed to upload profile picture.');
        }
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        alert('Error uploading profile picture.');
    }
}

// Expose functions to window for HTML onclick handlers
window.showSettingsSection = showSettingsSection;
window.toggleCategoriesList = toggleCategoriesList;
window.loadCategories = loadCategories;
window.addCategory = addCategory;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.toggleSelectAllCategories = toggleSelectAllCategories;
window.updateSelectedCategoriesCount = updateSelectedCategoriesCount;
window.deleteSelectedCategories = deleteSelectedCategories;
window.saveAuthorInfo = saveAuthorInfo;
window.saveSecuritySettings = saveSecuritySettings;
window.viewCurrentKey = viewCurrentKey;
window.clearKey = clearKey;
window.saveNotificationSettings = saveNotificationSettings;
window.saveContentSettings = saveContentSettings;
window.handleProfilePictureUpload = handleProfilePictureUpload;
