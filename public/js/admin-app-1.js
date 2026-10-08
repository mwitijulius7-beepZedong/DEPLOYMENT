
        // Define navigation functions IMMEDIATELY in <head> so inline onclick handlers can find them
        let isSaving = false; // Flag to prevent duplicate saves across all admin actions

        // ── Theme: apply saved blog theme before render ──
        (function () {
            try {
                var t = localStorage.getItem('blog_theme');
                if (t === 'glass' || t === 'minimal') t = 'light';
                document.documentElement.setAttribute('data-theme', t || 'light');
            } catch (e) {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        })();

        // ── Security: active logout when the admin tab closes ──────────────────
        // The session cookie is browser-session scoped, but closing just a tab does
        // not clear it. Fire a logout beacon as the tab is torn down so the server
        // session is destroyed and reopening admin.html requires a fresh login.
        // Suppressed on reload: during a reload document.visibilityState stays
        // 'visible', so the session is preserved for an in-place refresh.
        let adminTabLogoutBeaconSent = false;
        window.addEventListener('pagehide', () => {
            if (adminTabLogoutBeaconSent) return;
            if (document.visibilityState === 'hidden') {
                adminTabLogoutBeaconSent = true;
                try {
                    navigator.sendBeacon('/auth/logout', new Blob([], { type: 'application/json' }));
                } catch (_) {
                    fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
                }
            }
        });

        /**
         * Generic wrapper for handling button loading states and preventing duplicate submissions.
         */
        async function withLoading(buttonEl, asyncFn, loadingText = 'Saving...') {
            if (isSaving) return;
            
            const originalHtml = buttonEl.innerHTML;
            const originalDisabled = buttonEl.disabled;
            
            try {
                isSaving = true;
                buttonEl.disabled = true;
                buttonEl.innerHTML = `<i>⏳</i> ${loadingText}`;
                
                await asyncFn();
            } finally {
                isSaving = false;
                buttonEl.disabled = originalDisabled;
                buttonEl.innerHTML = originalHtml;
            }
        }

        function hideAllSections() {
            const sections = ['dashboard', 'posts-section', 'users-section', 'analytics-section', 'create-post-section', 'settings-section', 'buyers-section'];
            sections.forEach(sectionId => {
                const section = document.getElementById(sectionId);
                if (section) section.style.display = 'none';
            });
            document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => link.classList.remove('active'));
        }

        function showSection(sectionId, title, linkOnClick) {
            hideAllSections();
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
                section.scrollIntoView({ behavior: 'smooth' });
            }
            const link = document.querySelector(`[onclick="${linkOnClick}()"]`);
            if (link) link.classList.add('active');
            const titleEl = document.getElementById('page-title');
            if (titleEl) titleEl.textContent = title;
        }

        function showDashboard() {
            showSection('dashboard', 'Dashboard', 'showDashboard');
            if (typeof loadPostsList === 'function') loadPostsList();
            if (typeof loadDeletedPostsList === 'function') loadDeletedPostsList();
        }

        function showCreatePostSection() {
            showSection('create-post-section', 'Create New Post', 'showCreatePostSection');
            // Populate category dropdown when navigating to create post
            if (typeof populatePostCategoryDropdown === 'function') {
                populatePostCategoryDropdown().catch(err => console.error('Failed to load categories:', err));
            }
        }

        function showPostsSection() {
            showSection('posts-section', 'Manage Posts', 'showPostsSection');
            if (window.loadPostsList) {
                window.loadPostsList();
            } else if (typeof loadAndRenderPosts === 'function') {
                loadAndRenderPosts();
            }
        }

        function showAnalyticsSection() {
            showSection('analytics-section', 'Analytics', 'showAnalyticsSection');
            if (typeof initAnalyticsCharts === 'function') initAnalyticsCharts();
        }

        function showUsersSection() {
            showSection('users-section', 'User Management', 'showUsersSection');
            if (typeof loadUsers === 'function') loadUsers();
        }

        function showSettingsSection() {
            showSection('settings-section', 'Settings', 'showSettingsSection');
        }

        function showBuyersSection() {
            showSection('buyers-section', 'Template Buyers', 'showBuyersSection');
            if (typeof loadBuyers === 'function') loadBuyers();
        }

        async function loadBuyers() {
            const listEl = document.getElementById('buyers-list');
            if (!listEl) return;
            try {
                const response = await apiFetch('/api/admin/buyers');
                const data = await response.json();
                if (data.success && data.buyers.length > 0) {
                    listEl.innerHTML = data.buyers.map(b => `
                        <div style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; background: #fff;">
                            <div>
                                <strong style="color: var(--text-dark);">${b.name}</strong> <span style="font-size: 12px; color: var(--text-medium);">(${b.email})</span><br>
                                <span style="font-size: 11px; background: #e0e7ff; color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-family: monospace;">Key: ${b.licenseKey}</span>
                                <span style="font-size: 11px; color: var(--text-light); margin-left: 8px;">Purchased: ${new Date(b.purchaseDate).toLocaleDateString()}</span>
                            </div>
                            <button onclick="deleteBuyer('${b.id}')" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;">Remove</button>
                        </div>
                    `).join('');
                } else {
                    listEl.innerHTML = '<div style="padding:12px;color:var(--text-medium);font-size:13px;">No buyers found.</div>';
                }
            } catch (err) {
                listEl.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:13px;">Error loading buyers.</div>';
            }
        }

        async function addBuyer() {
            const name = document.getElementById('new-buyer-name').value.trim();
            const email = document.getElementById('new-buyer-email').value.trim();
            const btn = document.querySelector('#create-buyer-form .um-create-btn');
            
            await withLoading(btn, async () => {
                try {
                    const response = await apiFetch('/api/admin/buyers', {
                        method: 'POST',
                        body: JSON.stringify({ name, email })
                    });
                    const data = await response.json();
                    if (data.success) {
                        alert(`Buyer added! License Key: ${data.buyer.licenseKey}`);
                        document.getElementById('new-buyer-name').value = '';
                        document.getElementById('new-buyer-email').value = '';
                        loadBuyers();
                    } else {
                        alert(data.error || 'Failed to add buyer');
                    }
                } catch (err) {
                    alert('Network error adding buyer');
                }
            }, 'Adding...');
        }

        async function deleteBuyer(id) {
            if (!confirm('Remove this buyer and revoke their license key?')) return;
            try {
                const response = await apiFetch(`/api/admin/buyers/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    loadBuyers();
                } else {
                    alert('Failed to remove buyer');
                }
            } catch (err) {
                alert('Network error removing buyer');
            }
        }

        function switchSettingsPanel(panelName) {
            console.log('switchSettingsPanel called with:', panelName);

            const settingsSection = document.getElementById('settings-section');
            if (!settingsSection) {
                console.error('Settings section not found');
                return;
            }

            const allButtons = settingsSection.querySelectorAll('.settings-nav-btn');
            const allPanels = settingsSection.querySelectorAll('.settings-panel');

            console.log('Found', allButtons.length, 'buttons and', allPanels.length, 'panels');

            // Remove active class from all buttons and panels
            allButtons.forEach(btn => btn.classList.remove('active'));
            allPanels.forEach(panel => panel.classList.remove('active'));

            // Find and activate the clicked button
            const targetButton = settingsSection.querySelector(`[data-panel="${panelName}"]`);
            if (targetButton) {
                targetButton.classList.add('active');
                console.log('Activated button for:', panelName);
            }

            // Show corresponding panel
            const targetPanelElement = document.getElementById(`${panelName}-panel`);
            if (targetPanelElement) {
                targetPanelElement.classList.add('active');
                console.log('Activated panel:', panelName);
            } else {
                console.error('Panel not found:', `${panelName}-panel`);
            }

            // Auto-load based on panel
            if (panelName === 'categories' && typeof window.loadCategories === 'function') {
                window.loadCategories();
            } else if (panelName === 'about' && typeof window.loadAboutSettings === 'function') {
                window.loadAboutSettings();
            } else if (panelName === 'themes' && typeof window.loadThemesList === 'function') {
                window.loadThemesList();
            } else if (panelName === 'appearance') {
                if (typeof window.loadBackgroundGallery === 'function') window.loadBackgroundGallery();
            } else if (panelName === 'comments') {
                if (typeof window.loadAllCommentsForAdmin === 'function') loadAllCommentsForAdmin();
            } else if (panelName === 'social-autopost') {
                if (typeof window.loadSocialCredentials === 'function') loadSocialCredentials();
            }
        }


        // Helper function to get auth headers
        function getAuthHeaders() {
            const token = sessionStorage.getItem('authToken');
            const headers = {
                'Content-Type': 'application/json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            return headers;
        }

        /**
         * Centralized fetch wrapper that handles admin_key_required 401 errors.
         * When the server returns {error: 'admin_key_required'}, shows the key modal
         * and automatically retries the request once the key is verified.
         */
        async function apiFetch(url, options = {}) {
            // Always merge auth headers and credentials
            const mergedOptions = {
                credentials: 'include',
                ...options,
                headers: {
                    ...getAuthHeaders(),
                    ...(options.headers || {})
                }
            };

            const response = await fetch(url, mergedOptions);

            if (response.status === 401) {
                let errData = {};
                try { errData = await response.clone().json(); } catch (_) { }

                const err = errData.error || '';
                if (err === 'admin_key_required' || err === 'session_expired') {
                    // Show the admin key modal and wait for verification
                    const verified = await showAdminKeyModalAndWait();
                    if (verified) {
                        // Retry original request (this one will now have the cookie/token)
                        return fetch(url, mergedOptions);
                    }
                } else if (err === 'not authenticated') {
                    console.warn('API returned 401: not authenticated. Redirecting to login.');
                    // For localhost, we might want to try auto-logging in one last time? 
                    // No, usually it means the token is truly dead or credentials changed.
                    window.location.href = '/login.html';
                    return response;
                }
            }

            return response;
        }

        /**
         * Shows the admin key modal and returns a Promise that resolves to
         * true when the key is verified, or false if dismissed.
         */
        function showAdminKeyModalAndWait() {
            if (typeof enforceSecurityGate === 'function') {
                return enforceSecurityGate();
            }
            return Promise.resolve(true);
        }

        // Category management functions - defined directly in head for immediate availability
        async function addCategory() {
            const categoryName = document.getElementById('category-name').value.trim();
            const categoryDescription = document.getElementById('category-description').value.trim();
            const addButton = document.getElementById('btn-add-category');

            if (!categoryName) {
                alert('Please enter a category name.');
                return;
            }

            await withLoading(addButton, async () => {
                try {
                    const response = await apiFetch('/api/categories', {
                        method: 'POST',
                        body: JSON.stringify({ name: categoryName, description: categoryDescription })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        alert('Category added successfully!');
                        document.getElementById('category-name').value = '';
                        document.getElementById('category-description').value = '';
                        if (typeof loadCategories === 'function') {
                            await loadCategories();
                        }
                    } else {
                        const errorMessage = data.error || data.message || 'Failed to add category.';
                        alert(`Error: ${errorMessage}`);
                    }
                } catch (error) {
                    console.error('Error adding category:', error);
                    alert('Network error: Failed to add category.');
                }
            }, 'Adding...');
        }

        async function loadCategories() {
            console.log('loadCategories called');
            try {
                const headers = getAuthHeaders();
                const response = await fetch('/api/categories', {
                    headers: headers,
                    credentials: 'include'
                });

                console.log('loadCategories response status:', response.status);
                const data = await response.json();
                console.log('Categories data:', data);

                const categoriesList = document.getElementById('categories-list');
                if (!categoriesList) {
                    console.error('categories-list element not found!');
                    return;
                }

                if (data.categories && data.categories.length > 0) {
                    console.log('Rendering', data.categories.length, 'categories');
                    categoriesList.innerHTML = data.categories.map(category => `
                        <div class="category-item" style="padding: 10px; border: 1px solid var(--border-color); border-radius: 10px; background: #fff; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; transition: all 0.2s ease;">
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                                <input type="checkbox" class="category-checkbox" data-category-id="${category.id}" onchange="updateSelectedCategoriesCount()" style="width: 14px; height: 14px; cursor: pointer;">
                                <div style="display: flex; flex-direction: column; min-width: 0;">
                                    <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${category.name}</h4>
                                    <p style="margin: 0; font-size: 11px; color: var(--text-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${category.description || 'No description provided'}</p>
                                </div>
                            </div>
                            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                                <button class="btn-modern sm secondary" style="padding: 4px 8px; font-size: 11px;" onclick="editCategory('${category.id}')">Edit</button>
                                <button class="btn-modern sm" style="padding: 4px 8px; font-size: 11px; background: #fee2e2; color: #dc2626; border-color: #fecaca;" onclick="deleteCategory('${category.id}', this)">Delete</button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    console.log('No categories found');
                    categoriesList.innerHTML = '<p>No categories found.</p>';
                }
                const selectAllCheckbox = document.getElementById('select-all-categories');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
                updateSelectedCategoriesCount();
            } catch (error) {
                console.error('Failed to load categories:', error);
                document.getElementById('categories-list').innerHTML = '<p>Error loading categories.</p>';
            }
        }

        async function populatePostCategoryDropdown() {
            try {
                const response = await apiFetch('/api/categories');
                const data = await response.json();

                const selectElement = document.getElementById('post-category');
                if (!selectElement) return;

                if (data.categories && Array.isArray(data.categories) && data.categories.length > 0) {
                    selectElement.innerHTML = '<option value="">Select a category</option>' +
                        data.categories.map(cat =>
                            `<option value="${cat.id}">${cat.name}</option>`
                        ).join('');
                } else {
                    selectElement.innerHTML = '<option value="">No categories available</option>';
                }
            } catch (error) {
                console.error('Failed to populate category dropdown:', error);
                const selectElement = document.getElementById('post-category');
                if (selectElement) {
                    selectElement.innerHTML = '<option value="">Error loading categories</option>';
                }
            }
        }

        async function editCategory(categoryId) {
            alert(`Edit category functionality - This would open a form to edit category with ID: ${categoryId}`);
        }

        async function deleteCategory(categoryId, deleteButton) {
            if (confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
                await withLoading(deleteButton, async () => {
                    try {
                        const response = await apiFetch(`/api/categories/${categoryId}`, {
                            method: 'DELETE'
                        });

                        const data = await response.json();

                        if (response.ok) {
                            alert('Category deleted successfully!');
                            await loadCategories();
                        } else {
                            const errorMessage = data.details || data.error || data.message || 'Failed to delete category.';
                            alert(`Error: ${errorMessage}`);
                        }
                    } catch (error) {
                        console.error('Error deleting category:', error);
                        alert('Network error: Failed to delete category.');
                    }
                }, 'Deleting...');
            }
        }

        function updateSelectedCategoriesCount() {
            const categoryCheckboxes = document.querySelectorAll('.category-checkbox');
            const checkedCount = Array.from(categoryCheckboxes).filter(cb => cb.checked).length;
            const deleteButton = document.getElementById('delete-selected-categories');
            const countSpan = document.getElementById('selected-categories-count');

            if (deleteButton) deleteButton.style.display = checkedCount > 0 ? 'inline-block' : 'none';
            if (countSpan) countSpan.textContent = checkedCount;
        }

        function toggleSelectAllCategories() {
            console.log('toggleSelectAllCategories called');
            const selectAllCheckbox = document.getElementById('select-all-categories');
            const categoryCheckboxes = document.querySelectorAll('.category-checkbox');

            if (selectAllCheckbox) {
                const isChecked = selectAllCheckbox.checked;
                console.log('Select all checked:', isChecked);

                categoryCheckboxes.forEach(checkbox => {
                    checkbox.checked = isChecked;
                });

                console.log('Updated', categoryCheckboxes.length, 'checkboxes to', isChecked);
            }

            updateSelectedCategoriesCount();
        }

        async function deleteSelectedCategories() {
            console.log('deleteSelectedCategories called');
            const categoryCheckboxes = document.querySelectorAll('.category-checkbox:checked');
            const selectedIds = Array.from(categoryCheckboxes).map(cb => cb.getAttribute('data-category-id'));

            console.log('Selected category IDs:', selectedIds);

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
                    const headers = getAuthHeaders();
                    console.log(`Deleting category ${categoryId}...`);

                    const response = await fetch(`/api/categories/${categoryId}`, {
                        method: 'DELETE',
                        headers: headers,
                        credentials: 'include'
                    });

                    console.log(`Delete response for ${categoryId}:`, response.status);

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
                await loadCategories();
            }

            if (errorCount > 0) {
                alert(`Failed to delete ${errorCount} categor(y/ies).`);
            }
        }

        // Post Management Functions
        function togglePostsList() {
            console.log('togglePostsList called');
            const postsListContainer = document.getElementById('posts-list-container');
            if (postsListContainer.style.display === 'none') {
                postsListContainer.style.display = 'block';
                loadPostsList();
            } else {
                postsListContainer.style.display = 'none';
            }
        }

        function updateMetricDisplay(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        async function loadPostsList() {
            console.log('loadPostsList called');
            const postsList = document.getElementById('posts-list');
            if (postsList) postsList.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-medium);">Loading posts...</div>';

            try {
                const response = await apiFetch('/api/posts?include_drafts=true');
                const data = await response.json();
                
                console.log('Posts data:', data);

                const posts = data.posts || [];
                const publishedCount = posts.filter(p => !p.isDraft).length;
                const draftsCount = posts.filter(p => p.isDraft).length;

                // Update Dashboard Metrics
                updateMetricDisplay('posts-count', posts.length);
                updateMetricDisplay('views-count', publishedCount); // Using views-count as "Published" for now
                updateMetricDisplay('drafts-count', draftsCount);

                // Update Posts Section Metrics
                updateMetricDisplay('posts-count-alt', posts.length);
                updateMetricDisplay('published-count', publishedCount);
                updateMetricDisplay('drafts-count-alt', draftsCount);
                updateMetricDisplay('total-posts', posts.length); // Legacy support

                const dashboardList = document.getElementById('posts-list-dashboard');
                if (dashboardList) {
                    if (posts.length > 0) {
                        dashboardList.innerHTML = `<div style="width:100%;"><table style="width:100%; border-collapse:collapse; font-size:13px;">
                            ${posts.slice(0, 5).map(post => `
                                <tr style="border-bottom:1px solid var(--border-color);">
                                    <td style="padding:10px 0; font-weight:500;">${post.title}</td>
                                    <td style="padding:10px 0; text-align:right; color:var(--text-medium);">${new Date(post.date).toLocaleDateString()}</td>
                                </tr>
                            `).join('')}
                        </table></div>`;
                        dashboardList.style.border = 'none';
                        dashboardList.style.display = 'block';
                    } else {
                        dashboardList.innerHTML = 'No posts yet — create your first one';
                    }
                }

                if (posts.length > 0) {
                    postsList.innerHTML = posts.map(post => `
                        <div class="post-item" onclick="editPost('${post.id}')" style="cursor: pointer;">
                            <div class="post-item-header">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <input type="checkbox" class="post-checkbox" data-post-id="${post.id}" onchange="updateSelectedCount()" onclick="event.stopPropagation()">
                                    <h4 class="post-item-title" style="margin: 0;">${post.title}</h4>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <button class="compact-btn" title="Share to social" onclick="event.stopPropagation(); sharePost('${post.id}', '${post.title}')">📤</button>
                                    <button class="compact-btn" onclick="event.stopPropagation(); editPost('${post.id}')">Edit</button>
                                    <button class="compact-btn" style="color: #dc2626;" onclick="event.stopPropagation(); deletePost('${post.id}')">Delete</button>
                                </div>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                                <p style="color: var(--text-medium); font-size: 13px; margin: 0;">
                                    ${new Date(post.date).toLocaleDateString()} · ${post.author || 'Admin'}
                                </p>
                                <span style="font-size:11px; font-weight:600; padding:2px 8px; background:${post.isDraft ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color:${post.isDraft ? '#d97706' : '#059669'}; border-radius:6px; border: 1px solid currentColor;">
                                    ${post.isDraft ? 'DRAFT' : 'PUBLISHED'}
                                </span>
                            </div>
                        </div>
                    `).join('');
                } else {
                    postsList.innerHTML = '<p style="text-align: center; color: var(--text-medium); padding: 20px;">No posts found.</p>';
                }

                const selectAll = document.getElementById('select-all-posts');
                if (selectAll) selectAll.checked = false;
                updateSelectedCount();
            } catch (error) {
                console.error('Failed to load posts:', error);
                if (postsList) postsList.innerHTML = '<p style="text-align: center; color: #dc2626; padding: 20px;">Error loading posts.</p>';
            }
        }

        async function editPost(postId) {
            console.log('editPost called with ID:', postId);
            try {
                // Fetch the post data
                const response = await apiFetch(`/api/posts/${postId}`);
                const data = await response.json();

                if (!response.ok || !data.post) {
                    alert('Failed to load post data for editing.');
                    return;
                }

                const post = data.post;

                // Populate the form fields
                document.getElementById('edit-post-id').value = post.id;
                document.getElementById('post-title').value = post.title;
                document.getElementById('post-subtitle').value = post.subtitle || '';
                document.getElementById('post-content').value = post.content;
                document.getElementById('post-status').value = post.isDraft ? 'draft' : 'published';
                document.getElementById('post-pullquote').value = post.pullQuote || '';
                document.getElementById('post-scenecard').value = post.sceneCard || '';
                document.getElementById('post-closingbox').value = post.closingBox || '';
                document.getElementById('post-font-family').value = post.fontFamily || '';

                if (post.categoryId) {
                    document.getElementById('post-category').value = post.categoryId;
                }

                if (post.tags && Array.isArray(post.tags)) {
                    document.getElementById('post-tags').value = post.tags.join(', ');
                }

                // Handle image and gallery preview
                const previewContainer = document.getElementById('image-preview');
                const previewImg = document.getElementById('preview-img');
                const galleryPreviewContainer = document.getElementById('gallery-preview');
                const galleryContainer = document.getElementById('gallery-images');
                galleryContainer.innerHTML = '';

                // Featured image
                if (post.image) {
                    previewImg.src = post.image;
                    previewImg.onerror = function () { this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="%23ddd"><rect width="200" height="200"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="14" fill="%23999">Broken Image</text></svg>'; };
                    previewContainer.style.display = 'block';
                } else {
                    previewContainer.style.display = 'none';
                    previewImg.src = '';
                }

                // Gallery images (post.images array)
                if (post.images && post.images.length > 0) {
                    post.images.forEach(imgUrl => {
                        const imgWrapper = document.createElement('div');
                        imgWrapper.style.position = 'relative';
                        imgWrapper.style.width = '80px';
                        imgWrapper.style.height = '80px';
                        imgWrapper.style.cursor = 'pointer';
                        imgWrapper.title = 'Click to remove';
                        imgWrapper.onclick = function() {
                            if (confirm('Remove this image from gallery?')) {
                                this.remove();
                            }
                        };
                        const img = document.createElement('img');
                        img.src = imgUrl;
                        img.onerror = function () { this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%23ddd"><rect width="80" height="80"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="%23999">Broken</text></svg>'; };
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.borderRadius = '8px';
                        img.style.border = '1px solid #ddd';
                        imgWrapper.appendChild(img);
                        galleryContainer.appendChild(imgWrapper);
                    });
                    galleryPreviewContainer.style.display = 'block';
                } else {
                    galleryPreviewContainer.style.display = 'none';
                }

                // Change section title and button text
                document.querySelector('#create-post-section .section-title').innerHTML = '✏️ Edit Post';
                document.querySelector('#create-post-section .section-description').textContent = 'Update your blog post content and settings.';
                const saveBtn = document.querySelector('#create-post-section .form-actions .btn-modern');
                saveBtn.innerHTML = '<i>📝</i> Update Post';

                // Switch to the create/edit post section
                showCreatePostSection();

                // Scroll to top of form
                window.scrollTo(0, 0);
            } catch (error) {
                console.error('Error loading post for edit:', error);
                alert('An error occurred while loading the post.');
            }
        }

        async function deletePost(postId) {
            console.log('deletePost called with ID:', postId);
            if (confirm('Are you sure you want to delete this post?')) {
                try {
                    const response = await apiFetch(`/api/posts/${postId}`, {
                        method: 'DELETE'
                    });

                    console.log('Delete post response status:', response.status);

                    if (response.ok) {
                        alert('Post deleted successfully!');
                        await loadPostsList();
                    } else {
                        let errMsg = `Failed to delete post (HTTP ${response.status})`;
                        try {
                            const errData = await response.json();
                            if (errData.details) errMsg += `: ${errData.details}`;
                            else if (errData.error) errMsg += `: ${errData.error}`;
                        } catch (_) { }
                        console.error('Delete post failed:', errMsg);
                        alert(errMsg);
                    }
                } catch (error) {
                    console.error('Error deleting post:', error);
                    alert('Network error deleting post: ' + error.message);
                }
            }
        }

        async function sharePost(postId, postTitle) {
            const platforms = ['linkedin', 'twitter', 'facebook'];

            try {
                const response = await apiFetch('/api/share', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postId, platforms })
                });
                const data = await response.json();

                if (data.success) {
                    // Open all share windows at once
                    for (const r of data.results) {
                        if (r.success && r.twitterUrl) window.open(r.twitterUrl, '_blank');
                        if (r.success && r.facebookUrl) window.open(r.facebookUrl, '_blank');
                        if (r.success && r.linkedinUrl) window.open(r.linkedinUrl, '_blank');
                    }
                    alert(`"${postTitle}" shared to all platforms!`);
                } else {
                    alert('Failed: ' + data.error);
                }
            } catch (e) {
                alert('Error: ' + e.message);
            }
        }

        // --- NEW: Post Restoration and Perma-Delete Functions ---

        /**
         * Loads the list of soft-deleted posts into the Recycle Bin.
         */
        async function loadDeletedPostsList() {
            console.log('loadDeletedPostsList called');
            const deletedPostsList = document.getElementById('deleted-posts-list');
            if (deletedPostsList) deletedPostsList.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-medium);">Loading...</div>';

            try {
                const response = await apiFetch('/api/admin/posts/deleted');
                const data = await response.json();
                const posts = data.posts || [];

                // Update Deleted Metrics in both sections
                updateMetricDisplay('deleted-count', posts.length);
                updateMetricDisplay('deleted-count-alt', posts.length);

                if (posts.length > 0) {
                    deletedPostsList.innerHTML = posts.map(post => `
                        <div class="post-item" style="border-color: #cbd5e1; background: #f8fafc;">
                            <div class="post-item-header">
                                <h4 class="post-item-title" style="margin: 0;">${post.title}</h4>
                                <div style="display:flex; gap:8px;">
                                    <button class="compact-btn" onclick="restorePost('${post.id}')">Restore</button>
                                    <button class="compact-btn" style="color: #dc2626;" onclick="permanentlyDeletePost('${post.id}')">Delete Forever</button>
                                </div>
                            </div>
                            <p style="color: var(--text-medium); font-size: 13px; margin: 8px 0 0 0;">
                                Deleted on ${new Date(post.deletedAt || post.updatedAt).toLocaleDateString()}
                            </p>
                        </div>
                    `).join('');
                } else {
                    deletedPostsList.innerHTML = '<p style="text-align: center; color: var(--text-medium); padding: 12px;">Recycle bin is empty.</p>';
                }
            } catch (error) {
                console.error('Failed to load deleted posts:', error);
                if (deletedPostsList) deletedPostsList.innerHTML = '<p style="text-align: center; color: #dc2626; padding: 12px;">Error loading bin.</p>';
            }
        }

        /**
         * Restores a soft-deleted post.
         */
        async function restorePost(postId) {
            if (!confirm('Restore this post to published/draft status?')) return;
            try {
                const response = await apiFetch(`/api/posts/${postId}/restore`, { method: 'POST' });
                if (response.ok) {
                    alert('Post restored successfully!');
                    loadDeletedPostsList();
                    if (typeof loadPostsList === 'function') loadPostsList();
                } else {
                    const data = await response.json();
                    alert('Failed to restore post: ' + (data.error || 'Unknown error'));
                }
            } catch (err) {
                console.error('Error restoring post:', err);
                alert('Network error restoring post.');
            }
        }

        /**
         * Permanently deletes a post from the database.
         */
        async function permanentlyDeletePost(postId) {
            if (!confirm('PERMANENTLY DELETE this post? This action cannot be undone and will remove the file from storage.')) return;
            try {
                const response = await apiFetch(`/api/posts/${postId}/perma`, { method: 'DELETE' });
                if (response.ok) {
                    alert('Post permanently deleted.');
                    loadDeletedPostsList();
                } else {
                    const data = await response.json();
                    alert('Failed to permanently delete post: ' + (data.error || 'Unknown error'));
                }
            } catch (err) {
                console.error('Error perma-deleting post:', err);
                alert('Network error perma-deleting post.');
            }
        }

        function toggleSelectAllPosts() {
            console.log('toggleSelectAllPosts called');
            const selectAllCheckbox = document.getElementById('select-all-posts');
            const postCheckboxes = document.querySelectorAll('.post-checkbox');

            if (selectAllCheckbox) {
                const isChecked = selectAllCheckbox.checked;
                console.log('Select all posts checked:', isChecked);

                postCheckboxes.forEach(checkbox => {
                    checkbox.checked = isChecked;
                });

                console.log('Updated', postCheckboxes.length, 'post checkboxes to', isChecked);
            }

            updateSelectedCount();
        }

        function updateSelectedCount() {
            const postCheckboxes = document.querySelectorAll('.post-checkbox');
            const checkedCount = Array.from(postCheckboxes).filter(cb => cb.checked).length;
            const deleteButton = document.getElementById('delete-selected-posts');
            const countSpan = document.getElementById('selected-posts-count');

            if (deleteButton) deleteButton.style.display = checkedCount > 0 ? 'inline-block' : 'none';
            if (countSpan) countSpan.textContent = checkedCount;
        }

        async function deleteSelectedPosts() {
            console.log('deleteSelectedPosts called');
            const postCheckboxes = document.querySelectorAll('.post-checkbox:checked');
            const selectedIds = Array.from(postCheckboxes).map(cb => cb.getAttribute('data-post-id'));

            console.log('Selected post IDs:', selectedIds);

            if (selectedIds.length === 0) {
                alert('No posts selected.');
                return;
            }

            if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected post(s)?`)) {
                return;
            }

            let successCount = 0;
            let errorCount = 0;

            for (const postId of selectedIds) {
                try {
                    const headers = getAuthHeaders();
                    console.log(`Deleting post ${postId}...`);

                    const response = await fetch(`/api/posts/${postId}`, {
                        method: 'DELETE',
                        headers: headers,
                        credentials: 'include'
                    });

                    console.log(`Delete response for ${postId}:`, response.status);

                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error('Error deleting post:', error);
                    errorCount++;
                }
            }

            if (successCount > 0) {
                alert(`${successCount} post(s) deleted successfully!`);
                await loadPostsList();
            }

            if (errorCount > 0) {
                alert(`Failed to delete ${errorCount} post(s).`);
            }
        }

        async function saveNewPost() {
            const saveBtn = document.querySelector('#create-post-section .form-actions .btn-modern:first-child');
            await withLoading(saveBtn, async () => {
                const postId = document.getElementById('edit-post-id').value;
                const title = document.getElementById('post-title').value.trim();
                const subtitle = document.getElementById('post-subtitle').value.trim();
                const content = document.getElementById('post-content').value.trim();
                const category = document.getElementById('post-category').value;
                const tags = document.getElementById('post-tags').value.trim();
                const status = document.getElementById('post-status').value;
                const pullQuote = document.getElementById('post-pullquote').value.trim();
                const sceneCard = document.getElementById('post-scenecard').value.trim();
                const closingBox = document.getElementById('post-closingbox').value.trim();
                const imageFiles = document.getElementById('post-image-file').files;
                const videoFile = document.getElementById('post-video-file').files[0];

                if (!title || !content) {
                    alert('Please enter both a title and content for the post.');
                    return;
                }

                // Content sensitivity warning
                try {
                    const checkResp = await fetch('/api/content/check-sensitive', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, content })
                    });
                    const checkData = await checkResp.json();
                    if (checkData.sensitive) {
                        const kwList = (checkData.keywords || []).join(', ');
                        const proceed = confirm(
                            `⚠️ Sensitive Content Warning\n\n` +
                            `Your post contains potentially sensitive language: ${kwList}\n\n` +
                            `Posts with violent, hateful, or extremely sensitive content may result in ` +
                            `account suspension without notice.\n\n` +
                            `Do you want to proceed with publishing?`
                        );
                        if (!proceed) return;
                    }
                } catch (e) {
                    // Continue if check fails — don't block posting
                }

                try {
                    let imageUrl = document.getElementById('preview-img').src || '';
                    let videoUrl = document.getElementById('preview-video').src || '';
                    let galleryImages = [];

                    // Get existing gallery URLs from preview (for edit mode)
                    const galleryContainer = document.getElementById('gallery-images');
                    if (galleryContainer && galleryContainer.children.length > 0) {
                        Array.from(galleryContainer.children).forEach(wrapper => {
                            const img = wrapper.querySelector('img');
                            if (img && img.src && !img.src.startsWith('data:')) {
                                galleryImages.push(img.src);
                            }
                        });
                    }

                    if (imageUrl.startsWith('data:image')) imageUrl = '';
                    if (videoUrl.startsWith('blob:')) videoUrl = '';

                    // Upload first image as featured, all to gallery
                    if (imageFiles && imageFiles.length > 0) {
                        const uploadedUrls = [];
                        for (const file of imageFiles) {
                            const formData = new FormData();
                            formData.append('image', file);
                            const uploadResponse = await fetch('/api/upload', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Authorization': `Bearer ${sessionStorage.getItem('authToken')}` },
                                body: formData
                            });
                            const uploadData = await uploadResponse.json();
                            if (uploadResponse.ok && uploadData.url) {
                                uploadedUrls.push(uploadData.url);
                            } else {
                                throw new Error(uploadData.error || 'Failed to upload image');
                            }
                        }
                        // First uploaded image is featured
                        imageUrl = uploadedUrls[0];
                        // All uploaded images go to gallery
                        galleryImages = [...uploadedUrls, ...galleryImages];
                    }

                    if (videoFile) {
                        const formData = new FormData();
                        formData.append('video', videoFile);
                        const uploadResponse = await fetch('/api/upload', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('authToken')}` },
                            body: formData
                        });
                        const uploadData = await uploadResponse.json();
                        if (uploadResponse.ok && uploadData.url) videoUrl = uploadData.url;
                        else throw new Error(uploadData.error || 'Failed to upload video');
                    }

                    // Upload gallery images
                    const fontFamily = document.getElementById('post-font-family').value;

                    const postData = {
                        title, subtitle, content,
                        tags: tags.split(',').map(t => t.trim()).filter(t => t),
                        image: imageUrl, video: videoUrl, images: galleryImages,
                        isDraft: status === 'draft',
                        categoryId: category || null,
                        fontFamily: fontFamily || '',
                        pullQuote: pullQuote || '',
                        sceneCard: sceneCard || '',
                        closingBox: closingBox || ''
                    };

                    const url = postId ? `/api/posts/${postId}` : '/api/posts';
                    const method = postId ? 'PUT' : 'POST';
                    const response = await apiFetch(url, { method, body: JSON.stringify(postData) });
                    const data = await response.json();

                    if (response.ok) {
                        const isPublishing = status === 'published' && !postId;
                        alert(postId ? 'Post updated successfully!' : 'Post saved successfully!');
                        
                        // Auto-share if publishing new post
                        if (isPublishing) {
                            const shareNow = confirm('Post published! Share to social media now?');
                            if (shareNow) {
                                const newId = data.post?.id || postId;
                                if (newId) sharePost(newId, title);
                            }
                        }
                        
                        resetPostForm();
                        if (typeof loadPostsList === 'function') await loadPostsList();
                        showPostsSection();
                    } else {
                        alert('Failed to save post: ' + (data.error || 'Unknown error'));
                    }
                } catch (e) {
                    console.error('Error saving post:', e);
                    alert('Error saving post: ' + e.message);
                }
            }, '<i>⏳</i> Saving...');
        }

        function previewPost() {
            const title = document.getElementById('post-title').value.trim();
            const content = document.getElementById('post-content').value.trim();
            const imagePreview = document.getElementById('preview-img').src;

            if (!title || !content) {
                alert('Please enter both a title and content to preview.');
                return;
            }

            // Open preview in new window or modal
            const previewWindow = window.open('', 'postPreview', 'width=900,height=700');
            previewWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Post Preview - ${title}</title>
                    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Merriweather:wght@400;700&family=Playfair+Display:wght@400;700&family=Roboto:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: ${document.getElementById('post-font-family').value || "'Lora', Georgia, serif"}; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
                        .preview { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                        h1 { color: #333; margin-bottom: 20px; }
                        .featured-image { max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 20px; }
                        .content { color: #666; line-height: 1.8; }
                    </style>
                </head>
                <body>
                    <div class="preview">
                        <h1>${title}</h1>
                        ${imagePreview ? `<img src="${imagePreview}" class="featured-image" alt="Featured image" onerror="this.onerror=null;this.style.display='none'">` : ''}
                        <div class="content">${content}</div>
                    </div>
                </body>
                </html>
            `);
            previewWindow.document.close();
        }

        function resetPostForm() {
            // Silently resets form after a successful save/cancel — no confirm dialog
            document.getElementById('edit-post-id').value = '';
            document.getElementById('post-title').value = '';
            document.getElementById('post-subtitle').value = '';
            document.getElementById('post-content').value = '';
            document.getElementById('post-tags').value = '';
            document.getElementById('post-category').value = '';
            document.getElementById('post-status').value = 'draft';
            document.getElementById('post-font-family').value = '';
            document.getElementById('post-pullquote').value = '';
            document.getElementById('post-scenecard').value = '';
            document.getElementById('post-closingbox').value = '';

            const fileInput = document.getElementById('post-image-file');
            if (fileInput) fileInput.value = '';
            const videoInput = document.getElementById('post-video-file');
            if (videoInput) videoInput.value = '';

            const previewContainer = document.getElementById('image-preview');
            const previewImg = document.getElementById('preview-img');
            if (previewContainer) previewContainer.style.display = 'none';
            if (previewImg) previewImg.src = '';

            const videoPreviewContainer = document.getElementById('video-preview');
            const previewVideo = document.getElementById('preview-video');
            if (videoPreviewContainer) videoPreviewContainer.style.display = 'none';
            if (previewVideo) previewVideo.src = '';

            // Reset wording back to Create
            const sectionTitle = document.querySelector('#create-post-section .section-title');
            if (sectionTitle) sectionTitle.innerHTML = '✏️ Create New Post';

            const sectionDesc = document.querySelector('#create-post-section .section-description');
            if (sectionDesc) sectionDesc.textContent = 'Write and publish a new blog post with images, videos and rich content.';

            const saveBtn = document.querySelector('#create-post-section .form-actions .btn-modern');
            if (saveBtn) saveBtn.innerHTML = '<i>📝</i> Save Post';
        }

        function clearPostForm() {
            if (!confirm('Clear all post form fields?')) return;
            resetPostForm();
        }


        async function saveAuthorInfo() {
            const getVal = id => document.getElementById(id)?.value || '';
            const blogTitle = getVal('blog-title');
            const blogDescription = getVal('blog-description');
            const authorName = getVal('author-name');
            const authorEmail = getVal('author-email');
            const authorBio = getVal('author-bio');
            const authorPhone = getVal('author-phone');
            const authorWhatsapp = getVal('author-whatsapp');
            const authorTwitter = getVal('author-twitter');
            const authorFacebook = getVal('author-facebook');
            const authorLinkedin = getVal('author-linkedin');
            const authorInstagram = getVal('author-instagram');
            const authorSocialEmail = getVal('author-social-email');
            const authorWebsite = getVal('author-website');
            const saveButton = event?.target || document.querySelector('#general-panel .btn-modern');

            await withLoading(saveButton, async () => {
                try {
                    // Save blog info (title and description) to /api/settings/blog-info
                    const blogResponse = await apiFetch('/api/settings/blog-info', {
                        method: 'POST',
                        body: JSON.stringify({
                            title: blogTitle,
                            description: blogDescription
                        })
                    });

                    if (!blogResponse.ok) {
                        throw new Error(`Blog settings error: ${blogResponse.status}`);
                    }
                    const blogData = await blogResponse.json();

                    // Save author info to /api/settings/author
                    const authorResponse = await apiFetch('/api/settings/author', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: authorName,
                            email: authorEmail,
                            bio: authorBio,
                            phone: authorPhone,
                            whatsapp: authorWhatsapp,
                            profilePicture: window.uploadedProfilePictureUrl,
                            social: {
                                email: authorSocialEmail,
                                twitter: authorTwitter,
                                facebook: authorFacebook,
                                linkedin: authorLinkedin,
                                instagram: authorInstagram,
                                website: authorWebsite
                            }
                        })
                    });

                    if (!authorResponse.ok) {
                        throw new Error(`Author settings error: ${authorResponse.status}`);
                    }
                    const authorData = await authorResponse.json();

                    if (blogResponse.ok && authorResponse.ok) {
                        alert('General settings saved successfully!');
                        const sidebarTitle = document.querySelector('.sidebar-logo .sidebar-logo-title');
                        if (sidebarTitle) sidebarTitle.textContent = blogTitle;
                        document.title = `Admin Panel - ${blogTitle}`;
                        if (window.uploadedProfilePictureUrl) {
                            updateTopbarAvatar(window.uploadedProfilePictureUrl);
                        }
window.uploadedProfilePictureUrl = '';
                    } else {
                        let errorMsg = 'Failed to save some general settings.\n\n';
                        if (!blogResponse.ok) errorMsg += `Blog Info: ${blogData.error || 'Unknown error'}\n`;
                        if (!authorResponse.ok) errorMsg += `Author Info: ${authorData.error || 'Unknown error'}`;
                        alert(errorMsg);
                    }
                } catch (error) {
                    console.error('Error saving general settings:', error);
                    alert('Error saving general settings.');
                }
            });
        }

        async function loadAboutSettings() {
            console.log('loadAboutSettings called');
            try {
                const response = await fetch('/api/about');
                const about = await response.json();

                if (about) {
                    if (document.getElementById('about-hero-title')) document.getElementById('about-hero-title').value = about.hero?.title || '';
                    if (document.getElementById('about-hero-subtitle')) document.getElementById('about-hero-subtitle').value = about.hero?.subtitle || '';
                    if (document.getElementById('about-who-content')) document.getElementById('about-who-content').value = about.sections?.find(s => s.id === 'who-i-am')?.content || '';
                    if (document.getElementById('about-mission-content')) document.getElementById('about-mission-content').value = about.sections?.find(s => s.id === 'mission')?.content || '';

                    if (document.getElementById('about-contact-email')) document.getElementById('about-contact-email').value = about.contact?.email || '';
                    if (document.getElementById('about-contact-twitter')) document.getElementById('about-contact-twitter').value = about.contact?.twitter || '';
                    if (document.getElementById('about-contact-linkedin')) document.getElementById('about-contact-linkedin').value = about.contact?.linkedin || '';
                    if (document.getElementById('about-contact-github')) document.getElementById('about-contact-github').value = about.contact?.github || '';

                    // Load snapshots
                    window._aboutPhotos = Array.isArray(about.photos) ? about.photos.slice() : [];
                    renderAboutPhotos();
                }
            } catch (error) {
                console.error('Error loading about settings:', error);
            }
        }

        async function saveAboutSettings() {
            const aboutData = {
                hero: {
                    title: document.getElementById('about-hero-title').value,
                    subtitle: document.getElementById('about-hero-subtitle').value
                },
                sections: [
                    {
                        id: 'who-i-am',
                        title: 'Who I Am',
                        content: document.getElementById('about-who-content').value
                    },
                    {
                        id: 'mission',
                        title: 'My Mission',
                        content: document.getElementById('about-mission-content').value
                    }
                ],
                photos: Array.isArray(window._aboutPhotos) ? window._aboutPhotos : [],
                contact: {
                    email: document.getElementById('about-contact-email').value,
                    twitter: document.getElementById('about-contact-twitter').value,
                    linkedin: document.getElementById('about-contact-linkedin').value,
                    github: document.getElementById('about-contact-github').value
                }
            };
            const saveButton = event?.target || document.querySelector('#about-panel .btn-modern');

            await withLoading(saveButton, async () => {
                try {
                    const response = await apiFetch('/api/about', {
                        method: 'POST',
                        body: JSON.stringify(aboutData)
                    });

                    if (response.ok) {
                        alert('About Me settings saved successfully!');
                    } else {
                        const data = await response.json();
                        alert('Failed to save settings: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Error saving about settings:', error);
                    alert('Connection error. Failed to save settings.');
                }
            });
        }

        window.loadAboutSettings = loadAboutSettings;
        window.saveAboutSettings = saveAboutSettings;

        // --- About Snapshots Logic ---
        window._aboutPhotos = [];

        function renderAboutPhotos() {
            const grid = document.getElementById('about-photos-grid');
            if (!grid) return;
            const photos = window._aboutPhotos || [];
            if (photos.length === 0) {
                grid.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; width: 100%; text-align: center; padding: 20px 0;">No photos yet. Upload photos to display on your About Me page.</p>';
                return;
            }
            grid.innerHTML = photos.map((url, idx) => `
                <div style="position: relative; width: 96px; height: 96px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd; background: #fff;">
                    <img src="${url}" alt="About photo ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                    <button type="button" onclick="removeAboutPhoto(${idx})" title="Remove photo" style="position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; border: none; cursor: pointer; font-size: 12px; line-height: 1; display: flex; align-items: center; justify-content: center;">&times;</button>
                </div>
            `).join('');
        }

        window.removeAboutPhoto = function (idx) {
            if (!confirm('Remove this photo from the gallery?')) return;
            const photos = window._aboutPhotos || [];
            if (idx < 0 || idx >= photos.length) return;
            photos.splice(idx, 1);
            window._aboutPhotos = photos;
            renderAboutPhotos();
                    document.getElementById('about-photos-status').textContent = 'Snapshot removed. Remember to click "Update Profile" to save changes.';
        };

        window.handleAboutPhotoUpload = async function (input) {
            const files = input.files;
            if (!files || files.length === 0) return;
            const statusEl = document.getElementById('about-photos-status');
            let uploaded = 0;
            for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) {
                    statusEl.textContent = 'Skipped non-image file: ' + file.name;
                    continue;
                }
                const formData = new FormData();
                formData.append('image', file);
                try {
                    // Use direct fetch (not apiFetch) so the browser sets the
                    // multipart Content-Type boundary automatically.
                    const options = { method: 'POST', credentials: 'include', body: formData };
                    const token = sessionStorage.getItem('authToken');
                    if (token) options.headers = { 'Authorization': `Bearer ${token}` };
                    const resp = await fetch('/api/upload', options);
                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        statusEl.textContent = 'Upload failed: ' + (err.error || 'Unknown error');
                        continue;
                    }
                    const data = await resp.json();
                    if (data.url) {
                        window._aboutPhotos.push(data.url);
                        uploaded++;
                    }
                } catch (e) {
                    console.error('Photo upload error:', e);
                    statusEl.textContent = 'Upload error: ' + (e.message || 'Unknown');
                }
            }
            renderAboutPhotos();
            statusEl.textContent = uploaded > 0
                ? uploaded + ' snapshot(s) added. Click "Update Profile" to save.'
                : 'No snapshots were added.';
            input.value = '';
        };

        // --- Monthly Themes CRUD Logic ---
        async function loadThemesList() {
            const container = document.getElementById('themes-list');
            if (!container) return;

            container.innerHTML = '<div class="loading">Loading themes...</div>';

            try {
                const response = await fetch('/api/admin/themes', { credentials: 'include', headers: getAuthHeaders() });
                const data = await response.json();
                const themes = data.themes || [];

                if (themes.length === 0) {
                    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-medium);">No themes defined yet.</div>';
                    return;
                }

                container.innerHTML = themes.map(theme => `
                    <div class="theme-archive-item" style="padding: 12px; border: 1px solid var(--border-color); border-radius: 12px; background: #fff; display: flex; align-items: start; justify-content: space-between; gap: 16px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <span style="font-weight: 700; font-size: 13px; color: var(--text-dark);">${theme.month} ${theme.year}</span>
                                <span style="font-size: 11px; padding: 2px 8px; background: var(--bg-light); color: var(--text-medium); border-radius: 20px; font-weight: 500; border: 1px solid var(--border-color);">Archive</span>
                            </div>
                            <div style="color: var(--primary-color); font-weight: 600; font-size: 12px; margin-bottom: 4px;">${theme.title}</div>
                            <div style="font-size: 11px; color: var(--text-medium); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${theme.description || 'No focus description provided.'}</div>
                        </div>
                        <button class="btn-modern sm" style="background: #fee2e2; color: #dc2626; border-color: #fecaca; padding: 6px; flex-shrink: 0;" onclick="deleteTheme('${theme.id || theme._id}')" title="Delete Theme">
                            <i>🗑️</i>
                        </button>
                    </div>
                `).join('');
            } catch (err) {
                console.error('Error loading themes:', err);
                container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #dc2626;">Error loading themes.</div>';
            }
        }

        async function addTheme() {
            const month = document.getElementById('theme-month').value;
            const year = document.getElementById('theme-year').value;
            const title = document.getElementById('theme-title').value.trim();
            const description = document.getElementById('theme-description').value.trim();
            const saveBtn = document.querySelector('#themes-panel .btn-modern');

            if (!title) { alert('Theme title is required.'); return; }

            await withLoading(saveBtn, async () => {
                try {
                    const response = await fetch('/api/admin/themes', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        credentials: 'include',
                        body: JSON.stringify({ month, year: parseInt(year), title, description })
                    });
                    if (response.ok) {
                        alert('Monthly theme added successfully!');
                        document.getElementById('theme-title').value = '';
                        document.getElementById('theme-description').value = '';
                        loadThemesList();
                    } else {
                        const data = await response.json();
                        alert('Failed to add theme: ' + (data.error || 'Unknown error'));
                    }
                } catch (err) {
                    console.error('Error adding theme:', err);
                    alert('Network error adding theme.');
                }
            });
        }

        async function deleteTheme(themeId) {
            if (!confirm('Are you sure you want to delete this monthly theme?')) return;
            const btn = event?.currentTarget || event?.target;
            
            await withLoading(btn, async () => {
                try {
                    const response = await fetch(`/api/admin/themes/${themeId}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(),
                        credentials: 'include'
                    });

                    if (response.ok) {
                        alert('Theme deleted successfully!');
                        loadThemesList();
                    } else {
                        const data = await response.json();
                        alert('Failed to delete theme: ' + (data.error || 'Unknown error'));
                    }
                } catch (err) {
                    console.error('Error deleting theme:', err);
                    alert('Network error deleting theme.');
                }
            }, '<i>🗑️</i>');
        }

        window.loadThemesList = loadThemesList;
        window.addTheme = addTheme;
        window.deleteTheme = deleteTheme;

        // ── Helper to get current logged in user from JWT ───────────────────
        function getCurrentUser() {
            const token = sessionStorage.getItem('authToken');
            if (!token) return 'admin';
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    return (payload.username || 'admin').toLowerCase();
                }
            } catch (e) {
                console.error('Failed to decode token:', e);
            }
            return 'admin';
        }

        async function saveNotificationSettings() {
            const emailNotifications = document.getElementById('email-notifications').checked;
            const commentNotifications = document.getElementById('comment-notifications').checked;
            const systemAlerts = document.getElementById('system-alerts').checked;
            const saveBtn = document.querySelector('#notifications-panel .btn-modern');

            await withLoading(saveBtn, async () => {
                try {
                    const response = await apiFetch('/api/settings/notifications', {
                        method: 'POST',
                        body: JSON.stringify({ emailNotifications, commentNotifications, systemAlerts })
                    });
                    if (response.ok) {
                        alert('Notification settings saved successfully!');
                    } else {
                        const data = await response.json();
                        alert('Failed to save notification settings: ' + (data.error || response.status));
                    }
                } catch (error) {
                    console.error('Error saving notification settings:', error);
                    alert('Error saving notification settings.');
                }
            });
        }

        async function saveContentSettings() {
            const postsPerPage = document.getElementById('posts-per-page').value;
            const autoPublish = document.getElementById('auto-publish').checked;
            const enableComments = document.getElementById('enable-comments').checked;
            const saveBtn = document.querySelector('#content-panel .btn-modern');

            await withLoading(saveBtn, async () => {
                try {
                    const response = await apiFetch('/api/settings/content', {
                        method: 'POST',
                        body: JSON.stringify({ postsPerPage: parseInt(postsPerPage), autoPublish, enableComments })
                    });
                    if (response.ok) {
                        alert('Content settings saved successfully!');
                    } else {
                        const data = await response.json();
                        alert('Failed to save content settings: ' + (data.error || response.status));
                    }
                } catch (error) {
                    console.error('Error saving content settings:', error);
                    alert('Error saving content settings.');
                }
            });
        }

        // Social Auto-Post functions
        async function loadSocialCredentials() {
            try {
                const res = await apiFetch('/api/settings/social-credentials');
                if (!res.ok) throw new Error('Failed to load');
                const data = await res.json();
                const creds = data.socialCredentials || {};

                ['twitter', 'linkedin', 'facebook', 'mastodon'].forEach(platform => {
                    const p = creds[platform] || {};
                    const enabledEl = document.getElementById(`social-${platform}-enabled`);
                    if (enabledEl) enabledEl.checked = !!p.enabled;

                    Object.keys(p).forEach(key => {
                        if (key === 'enabled') return;
                        const el = document.getElementById(`social-${platform}-${key}`);
                        if (el && p[key]) el.value = p[key];
                    });
                });
            } catch (err) {
                console.error('Error loading social credentials:', err);
            }
        }

        async function saveSocialCredentials() {
            const getVal = id => document.getElementById(id)?.value || '';
            const getChecked = id => document.getElementById(id)?.checked || false;

            const socialCredentials = {
                twitter: {
                    enabled: getChecked('social-twitter-enabled'),
                    appKey: getVal('social-twitter-appKey'),
                    appSecret: getVal('social-twitter-appSecret'),
                    accessToken: getVal('social-twitter-accessToken'),
                    accessSecret: getVal('social-twitter-accessSecret'),
                },
                linkedin: {
                    enabled: getChecked('social-linkedin-enabled'),
                    accessToken: getVal('social-linkedin-accessToken'),
                    personUrn: getVal('social-linkedin-personUrn'),
                },
                facebook: {
                    enabled: getChecked('social-facebook-enabled'),
                    accessToken: getVal('social-facebook-accessToken'),
                    pageId: getVal('social-facebook-pageId'),
                },
                mastodon: {
                    enabled: getChecked('social-mastodon-enabled'),
                    url: getVal('social-mastodon-url'),
                    accessToken: getVal('social-mastodon-accessToken'),
                },
            };

            try {
                const res = await apiFetch('/api/settings/social-credentials', {
                    method: 'PUT',
                    body: JSON.stringify({ socialCredentials }),
                });
                if (!res.ok) throw new Error('Failed to save');
                alert('Social auto-post settings saved!');
                loadSocialCredentials();
            } catch (err) {
                console.error('Error saving social credentials:', err);
                alert('Error saving social settings.');
            }
        }

        async function testSocialConnections() {
            const resultsDiv = document.getElementById('social-test-results');
            const outputEl = document.getElementById('social-test-output');
            resultsDiv.style.display = 'block';
            outputEl.textContent = 'Testing connections...';

            try {
                const res = await apiFetch('/api/social/test');
                if (!res.ok) throw new Error('Test endpoint unavailable');
                const data = await res.json();
                outputEl.textContent = JSON.stringify(data.results, null, 2);
            } catch (err) {
                outputEl.textContent = `Error: ${err.message}\n\nNote: Test endpoint may not be available yet. Save your settings and create a new post to test auto-sharing.`;
            }
        }

        // Wrapper functions for settings functions to handle async loading


        async function saveThemeSettings() {
            const primaryColor = document.getElementById('primary-color').value;
            const accentColor = document.getElementById('accent-color').value;
            const saveButton = event?.target || document.querySelector('#appearance-panel .btn-modern');

            await withLoading(saveButton, async () => {
                try {
                    const response = await apiFetch('/api/settings/theme', {
                        method: 'POST',
                        body: JSON.stringify({
                            primaryColor,
                            accentColor
                        })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        alert('Theme settings saved successfully!');
                        document.documentElement.style.setProperty('--primary-color', primaryColor);
                        document.documentElement.style.setProperty('--accent-color', accentColor);
                    } else {
                        alert('Failed to save theme settings: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Error saving theme settings:', error);
                    alert('Error saving theme settings.');
                }
            });
        }

        async function saveBackgroundSettings() {
            const backgroundColor = document.getElementById('background-color').value;
            const backgroundUrl = document.getElementById('background-url').value;
            const saveButton = event?.target || document.querySelector('#appearance-panel button[onclick="saveBackgroundSettings()"]');

            await withLoading(saveButton, async () => {
                try {
                    if (backgroundUrl) {
                        const response = await apiFetch('/api/settings/background', {
                            method: 'POST',
                            body: JSON.stringify({
                                backgroundUrl: backgroundUrl
                            })
                        });

                        const data = await response.json();

                        if (!response.ok) {
                            alert('Failed to save background settings: ' + (data.error || 'Unknown error'));
                            return;
                        }
                    }

                    alert('Background settings saved successfully!');
                    document.body.style.backgroundColor = backgroundColor;
                    if (backgroundUrl) {
                        document.body.style.backgroundImage = `url('${backgroundUrl}')`;
                        document.body.style.backgroundSize = 'cover';
                        document.body.style.backgroundAttachment = 'fixed';
                    }
                } catch (error) {
                    console.error('Error saving background settings:', error);
                    alert('Error saving background settings.');
                }
            });
        }

        // --- Cropper.js logic for Background Upload ---
        let cropper = null;

        /**
         * Closes the crop modal and cleans up cropper instance
         */
        function closeCropModal() {
            const modal = document.getElementById('crop-modal');
            if (modal) modal.style.display = 'none';
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        }

        async function handleBackgroundUpload() {
            const fileInput = document.getElementById('background-file');
            const file = fileInput.files[0];

            if (!file) return;

            // Validate type and size
            if (!file.type.startsWith('image/')) {
                alert('Please select a valid image file.');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert('File size must be less than 5MB.');
                return;
            }

            // Show Crop Modal
            const modal = document.getElementById('crop-modal');
            const image = document.getElementById('crop-image');
            
            const reader = new FileReader();
            reader.onload = function(e) {
                image.src = e.target.result;
                modal.style.display = 'flex';

                if (cropper) cropper.destroy();
                if (typeof Cropper === 'undefined') { console.error('Cropper.js not loaded'); return; }
                cropper = new Cropper(image, {
                    aspectRatio: 16 / 9,
                    viewMode: 1,
                    background: false,
                    responsive: true
                });
            };
            reader.readAsDataURL(file);

            // Bind crop button click
            const cropBtn = document.getElementById('btn-perform-crop');
            cropBtn.onclick = async () => {
                await performCropAndUpload(cropBtn);
            };
        }

        async function performCropAndUpload(buttonEl) {
            if (!cropper) return;

            await withLoading(buttonEl, async () => {
                try {
                    const canvas = cropper.getCroppedCanvas({
                        width: 1920,
                        height: 1080
                    });

                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
                    const croppedFile = new File([blob], 'background-cropped.jpg', { type: 'image/jpeg' });

                    const formData = new FormData();
                    formData.append('image', croppedFile);

                    const token = sessionStorage.getItem('authToken');
                    const headers = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    const response = await fetch('/api/upload', {
                        method: 'POST',
                        credentials: 'include',
                        headers: headers,
                        body: formData
                    });

                    const data = await response.json();
                    if (response.ok && data.url) {
                        alert('Background uploaded successfully!');
                        document.getElementById('background-url').value = data.url;
                        closeCropModal();
                    } else {
                        alert('Failed to upload: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Error during crop and upload:', error);
                    alert('Error processing image.');
                }
            }, 'Uploading...');
        }




        // Export to global scope
        window.hideAllSections = hideAllSections;
        window.showSection = showSection;
        window.showDashboard = showDashboard;
        window.showCreatePostSection = showCreatePostSection;
        window.showPostsSection = showPostsSection;
        window.showAnalyticsSection = showAnalyticsSection;
        window.showUsersSection = showUsersSection;
        window.showSettingsSection = showSettingsSection;
        window.switchSettingsPanel = switchSettingsPanel;

    