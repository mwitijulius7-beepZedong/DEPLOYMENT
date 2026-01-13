// Posts module
export function showPostsSection() {
    // Hide other sections
    const sections = ['dashboard', 'settings-section', 'analytics-section', 'customize-section', 'create-post-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const postsSection = document.getElementById('posts-section');
    postsSection.style.display = 'block';
    postsSection.scrollIntoView({ behavior: 'smooth' });

    // Load posts data with improved error handling
    loadPostsList().catch(error => {
        console.error('Failed to load posts in showPostsSection:', error);
        const postsList = document.getElementById('posts-list');
        if (postsList) {
            postsList.innerHTML = '<p style="color: #dc2626; text-align: center; padding: 20px;">Failed to load posts. Please try again.</p>';
        }
    });
}

export function togglePostsList() {
    const postsListContainer = document.getElementById('posts-list-container');
    if (postsListContainer.style.display === 'none') {
        postsListContainer.style.display = 'block';
        loadPostsList(); // Load posts when showing
    } else {
        postsListContainer.style.display = 'none';
    }
}

export async function loadPostsList() {
    try {
        const response = await fetch('/api/posts');
        const data = await response.json();
        const postsList = document.getElementById('posts-list');
        const totalPosts = document.getElementById('total-posts');

        if (data.posts && data.posts.length > 0) {
            postsList.innerHTML = data.posts.map(post => `
                <div class="post-item">
                    <div class="post-item-header">
                        <h4 class="post-item-title">${post.title}</h4>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-modern sm secondary" onclick="editPost('${post.id}')">Edit</button>
                            <button class="btn-modern sm" style="background-color: #dc2626;" onclick="deletePost('${post.id}')">Delete</button>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                        <p style="color: var(--text-medium); font-size: 14px; margin: 0;">
                            ${new Date(post.date).toLocaleDateString()} · ${post.author || 'Admin'}
                        </p>
                        <span style="font-size:12px; padding:4px 8px; background:${post.isDraft ? '#fef3c7' : '#dcfce7'}; color:${post.isDraft ? '#d97706' : '#166534'}; border-radius:12px;">
                            ${post.isDraft ? 'Draft' : 'Published'}
                        </span>
                    </div>
                    <div class="post-meta-tags" style="margin-top:12px;">
                        ${(post.tags || []).map(tag => `<span class="post-tag-badge">${tag}</span>`).join('')}
                    </div>
                </div>
            `).join('');
            totalPosts.textContent = data.posts.length;
        } else {
            postsList.innerHTML = '<p>No posts found.</p>';
            totalPosts.textContent = '0';
        }
        // Reset select all checkbox and selected count
        const selectAll = document.getElementById('select-all-posts');
        if (selectAll) selectAll.checked = false;
        updateSelectedCount();
    } catch (error) {
        console.error('Failed to load posts:', error);
        document.getElementById('posts-list').innerHTML = '<p>Error loading posts.</p>';
    }
}

export function createNewPost() {
    // Show the settings section and navigate to new post panel
    const settingsSection = document.getElementById('settings-section');
    settingsSection.style.display = 'block';
    settingsSection.scrollIntoView({ behavior: 'smooth' });

    // Navigate to new post panel
    const navButtons = document.querySelectorAll('.settings-nav-btn');
    const panels = document.querySelectorAll('.settings-panel');

    navButtons.forEach(btn => btn.classList.remove('active'));
    panels.forEach(panel => panel.classList.remove('active'));

    document.querySelector('[data-panel="new-post"]').classList.add('active');
    document.getElementById('new-post-panel').classList.add('active');
}

export function editPost(postId) {
    alert(`Edit post functionality - This would open a form to edit post with ID: ${postId}`);
}

export async function deletePost(postId) {
    if (confirm('Are you sure you want to delete this post?')) {
        try {
            const response = await fetch(`/api/posts/${postId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                alert('Post deleted successfully!');
                loadPostsList(); // Refresh the list
            } else {
                alert('Failed to delete post.');
            }
        } catch (error) {
            console.error('Error deleting post:', error);
            alert('Error deleting post.');
        }
    }
}

export function viewPostStats() {
    alert('View post statistics functionality - This would show detailed statistics about posts');
}

export function toggleSelectAllPosts() {
    const selectAllCheckbox = document.getElementById('select-all-posts');
    const postCheckboxes = document.querySelectorAll('.post-checkbox');
    postCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    updateSelectedCount();
}

export function updateSelectedCount() {
    const postCheckboxes = document.querySelectorAll('.post-checkbox');
    const checkedCount = Array.from(postCheckboxes).filter(cb => cb.checked).length;
    const deleteButton = document.getElementById('delete-selected-posts');
    const countSpan = document.getElementById('selected-posts-count');

    countSpan.textContent = checkedCount;
    deleteButton.style.display = checkedCount > 0 ? 'inline-block' : 'none';
}

export async function deleteSelectedPosts() {
    const postCheckboxes = document.querySelectorAll('.post-checkbox:checked');
    const selectedIds = Array.from(postCheckboxes).map(cb => cb.getAttribute('data-post-id'));

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
            const response = await fetch(`/api/posts/${postId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

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
        loadPostsList(); // Refresh the list
    }

    if (errorCount > 0) {
        alert(`Failed to delete ${errorCount} post(s).`);
    }
}

// New Post Creation Functions
export function handlePostImageUpload() {
    const fileInput = document.getElementById('post-image-file');
    const previewDiv = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file.');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image file size must be less than 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            previewDiv.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

export async function saveNewPost() {
    const title = document.getElementById('post-title').value.trim();
    const category = document.getElementById('post-category').value;
    const content = document.getElementById('post-content').value.trim();
    const tags = document.getElementById('post-tags').value.trim();
    const status = document.getElementById('post-status').value;
    const imageFile = document.getElementById('post-image-file').files[0];

    // Validation
    if (!title) {
        alert('Please enter a post title.');
        return;
    }

    if (!content) {
        alert('Please enter post content.');
        return;
    }

    if (!category) {
        alert('Please select a category.');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('content', content);
        formData.append('tags', tags);
        formData.append('status', status);

        if (imageFile) {
            formData.append('image', imageFile);
        }

        const response = await fetch('/api/posts', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (response.ok) {
            const result = await response.json();
            alert('Post saved successfully!');
            clearPostForm();
            // Refresh posts list if visible
            if (document.getElementById('posts-list-container').style.display !== 'none') {
                loadPostsList();
            }
        } else {
            const error = await response.json();
            alert(`Failed to save post: ${error.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving post:', error);
        alert('Error saving post. Please try again.');
    }
}

export function previewPost() {
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const category = document.getElementById('post-category').value;
    const tags = document.getElementById('post-tags').value.trim();

    if (!title || !content) {
        alert('Please enter both title and content to preview.');
        return;
    }

    // Create preview modal
    const previewModal = document.createElement('div');
    previewModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const previewContent = document.createElement('div');
    previewContent.style.cssText = `
        background: white;
        padding: 32px;
        border-radius: 12px;
        max-width: 800px;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
    `;

    previewContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 16px;">
            <h2 style="margin: 0; color: #333;">Post Preview</h2>
            <button onclick="this.closest('div').parentElement.remove()" style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close</button>
        </div>
        <div style="margin-bottom: 16px;">
            <span style="background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #666;">${category}</span>
        </div>
        <h1 style="margin: 0 0 16px 0; color: #333; font-size: 28px; line-height: 1.3;">${title}</h1>
        <div style="color: #666; margin-bottom: 24px;">
            <small>By zedong254ke • ${new Date().toLocaleDateString()}</small>
        </div>
        <div style="line-height: 1.7; color: #333; margin-bottom: 24px;">${content.replace(/\n/g, '<br>')}</div>
        ${tags ? `<div style="border-top: 1px solid #eee; padding-top: 16px;"><strong>Tags:</strong> ${tags.split(',').map(tag => `<span style="background: #f8f9fa; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 4px;">${tag.trim()}</span>`).join('')}</div>` : ''}
    `;

    previewModal.appendChild(previewContent);
    document.body.appendChild(previewModal);
}

export function clearPostForm() {
    document.getElementById('post-title').value = '';
    document.getElementById('post-category').value = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-tags').value = '';
    document.getElementById('post-status').value = 'draft';
    document.getElementById('post-image-file').value = '';
    document.getElementById('image-preview').style.display = 'none';
}
