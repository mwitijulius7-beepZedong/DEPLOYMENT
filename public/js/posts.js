// Posts module
export function showPostsSection() {
    const postsSection = document.getElementById('posts-section');
    if (postsSection.style.display === 'block') {
        postsSection.style.display = 'none';
    } else {
        postsSection.style.display = 'block';
        postsSection.scrollIntoView({ behavior: 'smooth' });
        // Load posts data
        loadPostsList();
    }
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
                <div class="post-item" style="padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 8px; background: #f9f9f9;">
                    <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                        <input type="checkbox" class="post-checkbox" data-post-id="${post.id}" onchange="updateSelectedCount()">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 8px 0; font-size: 16px;">${post.title}</h4>
                            <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">${post.content ? post.content.substring(0, 100) + '...' : 'No content'}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="action-btn" style="padding: 6px 12px; font-size: 12px;" onclick="editPost('${post.id}')">Edit</button>
                        <button class="action-btn secondary" style="padding: 6px 12px; font-size: 12px;" onclick="deletePost('${post.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
            totalPosts.textContent = data.posts.length;
        } else {
            postsList.innerHTML = '<p>No posts found.</p>';
            totalPosts.textContent = '0';
        }
        // Reset select all checkbox and selected count
        document.getElementById('select-all-posts').checked = false;
        updateSelectedCount();
    } catch (error) {
        console.error('Failed to load posts:', error);
        document.getElementById('posts-list').innerHTML = '<p>Error loading posts.</p>';
    }
}

export function createNewPost() {
    alert('Create new post functionality - This would open a form to create a new post');
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
