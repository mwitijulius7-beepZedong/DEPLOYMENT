
                        (function () {
                            function bind(sel, fn) {
                                const el = document.querySelector(sel);
                                if (!el) return;
                                el.addEventListener('click', function (e) {
                                    e.preventDefault();
                                    fn();
                                });
                            }
                            document.addEventListener('DOMContentLoaded', function () {
                                bind('#nav-dashboard', showDashboard);
                                bind('#nav-create-post', showCreatePostSection);
                                bind('#nav-posts', showPostsSection);
                                bind('#nav-analytics', showAnalyticsSection);
                                bind('#nav-users', showUsersSection);
                                bind('#nav-settings', showSettingsSection);
                                const form = document.getElementById('create-user-form');
                                if (form) form.addEventListener('submit', handleCreateUser);

                                // Populate category dropdown on page load
                                if (typeof populatePostCategoryDropdown === 'function') {
                                    populatePostCategoryDropdown().catch(err => console.error('Failed to populate categories:', err));
                                }

                                // Logout handler moved to global scope for reliability
                            });
                        })();

                        // Global logout function for maximum reliability
                        async function handleLogout() {
                            try {
                                console.log('Logout initiated');

                                // 1. Clear local session data immediately.
                                // authToken now lives in sessionStorage (per-tab, never cached).
                                // Also clear any legacy localStorage token from older versions.
                                try { sessionStorage.removeItem('authToken'); } catch (_) { }
                                try { localStorage.removeItem('authToken'); } catch (_) { }
                                localStorage.removeItem('user');
                                localStorage.removeItem('adminCurrentSection');
                                sessionStorage.clear();

                                // 2. Attempt server-side logout
                                fetch('/auth/logout', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' }
                                }).catch(e => console.warn('Server logout call failed:', e));

                                console.log('Logout cleanup complete, redirecting...');

                                // 3. Always redirect to login
                                window.location.href = '/login.html';
                            } catch (error) {
                                console.error('Logout error:', error);
                                window.location.href = '/login.html';
                            }
                        }

                        // ── Comment Management Functions ────────────────────────────────
                        let allAdminComments = [];
                        let adminPostsForFilter = [];
                        let selectedCommentIds = new Set();

                        async function loadAllCommentsForAdmin() {
                            const listEl = document.getElementById('admin-comments-list');
                            selectedCommentIds.clear();
                            updateSelectedCommentsCountUI();
                            try {
                                const res = await fetch('/api/admin/comments', { headers: getAuthHeaders() });
                                const data = await res.json();
                                if (data.success) {
                                    allAdminComments = data.comments || [];
                                    await loadPostsForCommentFilter();
                                    renderAdminComments();
                                }
                            } catch (e) {
                                console.error('Failed to load comments:', e);
                                listEl.innerHTML = '<div style="color: #dc2626; padding: 20px;">Failed to load comments</div>';
                            }
                        }

                        async function loadPostsForCommentFilter() {
                            const select = document.getElementById('comment-post-filter');
                            try {
                                const res = await fetch('/api/posts');
                                const data = await res.json();
                                if (data.posts) {
                                    adminPostsForFilter = data.posts;
                                    select.innerHTML = '<option value="">All Posts</option>' + 
                                        data.posts.map(p => `<option value="${p.id}">${p.title.substring(0, 40)}${p.title.length > 40 ? '...' : ''}</option>`).join('');
                                }
                            } catch (e) {
                                console.error('Failed to load posts for filter:', e);
                            }
                        }

                        function renderAdminComments() {
                            const listEl = document.getElementById('admin-comments-list');
                            const filterPost = document.getElementById('comment-post-filter').value;
                            const showDeleted = document.getElementById('show-deleted-comments').checked;
                            
                            let filtered = allAdminComments;
                            if (filterPost) {
                                filtered = filtered.filter(c => c.postId === filterPost);
                            }
                            if (!showDeleted) {
                                filtered = filtered.filter(c => !c.deleted);
                            }

                            if (filtered.length === 0) {
                                listEl.innerHTML = '<div style="font-size: 12px; opacity: 0.6; padding: 20px; text-align: center;">No comments found.</div>';
                                return;
                            }

                            const selectAllChecked = filtered.length > 0 && filtered.every(c => selectedCommentIds.has(c.postId + '-' + c.id));

                            listEl.innerHTML = filtered.map(c => {
                                const post = adminPostsForFilter.find(p => p.id === c.postId);
                                const postTitle = post ? post.title : `Post ${c.postId}`;
                                const date = new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                const isChecked = selectedCommentIds.has(c.postId + '-' + c.id);
                                return `
                                    <div style="background: ${c.deleted ? '#fef2f2' : '#fff'}; border: 1px solid ${c.deleted ? '#fecaca' : '#e5e7eb'}; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                                        <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 6px;">
                                            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                                                <input type="checkbox" class="comment-checkbox" data-postid="${c.postId}" data-id="${c.id}" 
                                                    ${isChecked ? 'checked' : ''} onchange="toggleCommentSelection('${c.postId}', '${c.id}')" 
                                                    style="width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;">
                                                <div style="min-width: 0;">
                                                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">
                                                        <strong>${c.name}</strong> · ${date}
                                                        ${c.deleted ? ' · <span style="color: #dc2626;">Deleted</span>' : ''}
                                                    </div>
                                                    <div style="font-size: 11px; color: #9ca3af;">Post: ${postTitle.substring(0, 35)}${postTitle.length > 35 ? '...' : ''}</div>
                                                </div>
                                            </div>
                                            ${!c.deleted ? `
                                                <button onclick="deleteCommentAdmin('${c.postId}', '${c.id}')" 
                                                    style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">
                                                    🗑️ Delete
                                                </button>
                                            ` : `
                                                <button onclick="restoreCommentAdmin('${c.postId}', '${c.id}')" 
                                                    style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">
                                                    ↩️ Restore
                                                </button>
                                            `}
                                        </div>
                                        <div style="font-size: 12px; color: #374151; line-height: 1.5; ${c.deleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                                            ${c.content.substring(0, 100)}${c.content.length > 100 ? '...' : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        }

                        function filterAdminComments() {
                            renderAdminComments();
                        }

                        function toggleCommentSelection(postId, commentId) {
                            const key = postId + '-' + commentId;
                            if (selectedCommentIds.has(key)) {
                                selectedCommentIds.delete(key);
                            } else {
                                selectedCommentIds.add(key);
                            }
                            updateSelectedCommentsCountUI();
                        }

                        function toggleSelectAllComments() {
                            const selectAllCheckbox = document.getElementById('select-all-comments');
                            const filterPost = document.getElementById('comment-post-filter').value;
                            const showDeleted = document.getElementById('show-deleted-comments').checked;
                            
                            let filtered = allAdminComments;
                            if (filterPost) {
                                filtered = filtered.filter(c => c.postId === filterPost);
                            }
                            if (!showDeleted) {
                                filtered = filtered.filter(c => !c.deleted);
                            }

                            if (selectAllCheckbox.checked) {
                                filtered.forEach(c => selectedCommentIds.add(c.postId + '-' + c.id));
                            } else {
                                filtered.forEach(c => selectedCommentIds.delete(c.postId + '-' + c.id));
                            }
                            updateSelectedCommentsCountUI();
                            renderAdminComments();
                        }

                        function updateSelectedCommentsCountUI() {
                            const countEl = document.getElementById('selected-comments-count');
                            const deleteBtn = document.getElementById('bulk-delete-comments-btn');
                            const restoreBtn = document.getElementById('bulk-restore-comments-btn');
                            const count = selectedCommentIds.size;
                            countEl.textContent = count + ' selected';
                            
                            const hasSelection = count > 0;
                            const hasDeleted = Array.from(selectedCommentIds).some(key => {
                                const [postId, commentId] = key.split('-');
                                const comment = allAdminComments.find(c => c.postId === postId && c.id == commentId);
                                return comment && comment.deleted;
                            });
                            const hasActive = Array.from(selectedCommentIds).some(key => {
                                const [postId, commentId] = key.split('-');
                                const comment = allAdminComments.find(c => c.postId === postId && c.id == commentId);
                                return comment && !comment.deleted;
                            });

                            deleteBtn.style.display = hasSelection && hasActive ? 'inline-block' : 'none';
                            restoreBtn.style.display = hasSelection && hasDeleted ? 'inline-block' : 'none';
                        }

                        async function bulkDeleteComments() {
                            if (selectedCommentIds.size === 0) return;
                            if (!confirm('Soft delete ' + selectedCommentIds.size + ' comment(s)? They will be hidden from public view.')) return;
                            
                            const keys = Array.from(selectedCommentIds);
                            const promises = keys.map(async (key) => {
                                const [postId, commentId] = key.split('-');
                                const comment = allAdminComments.find(c => c.postId === postId && c.id == commentId);
                                if (comment && !comment.deleted) {
                                    try {
                                        await fetch(`/api/posts/${postId}/comments/${commentId}`, {
                                            method: 'DELETE',
                                            headers: getAuthHeaders()
                                        });
                                    } catch (e) {
                                        console.error('Delete error:', e);
                                    }
                                }
                            });
                            
                            await Promise.all(promises);
                            selectedCommentIds.clear();
                            loadAllCommentsForAdmin();
                        }

                        async function bulkRestoreComments() {
                            if (selectedCommentIds.size === 0) return;
                            if (!confirm('Restore ' + selectedCommentIds.size + ' comment(s)?')) return;
                            
                            const keys = Array.from(selectedCommentIds);
                            const promises = keys.map(async (key) => {
                                const [postId, commentId] = key.split('-');
                                const comment = allAdminComments.find(c => c.postId === postId && c.id == commentId);
                                if (comment && comment.deleted) {
                                    try {
                                        await fetch(`/api/posts/${postId}/comments/${commentId}/restore`, {
                                            method: 'POST',
                                            headers: getAuthHeaders()
                                        });
                                    } catch (e) {
                                        console.error('Restore error:', e);
                                    }
                                }
                            });
                            
                            await Promise.all(promises);
                            selectedCommentIds.clear();
                            loadAllCommentsForAdmin();
                        }

                        async function deleteCommentAdmin(postId, commentId) {
                            if (!confirm('Soft delete this comment? It will be hidden from public view.')) return;
                            try {
                                const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
                                    method: 'DELETE',
                                    headers: getAuthHeaders()
                                });
                                const data = await res.json();
                                if (data.success) {
                                    loadAllCommentsForAdmin();
                                } else {
                                    alert('Failed to delete comment');
                                }
                            } catch (e) {
                                console.error('Delete comment error:', e);
                                alert('Failed to delete comment');
                            }
                        }

                        async function restoreCommentAdmin(postId, commentId) {
                            try {
                                const res = await fetch(`/api/posts/${postId}/comments/${commentId}/restore`, {
                                    method: 'POST',
                                    headers: getAuthHeaders()
                                });
                                const data = await res.json();
                                if (data.success) {
                                    loadAllCommentsForAdmin();
                                } else {
                                    alert('Failed to restore comment');
                                }
                            } catch (e) {
                                console.error('Restore comment error:', e);
                                alert('Failed to restore comment');
                            }
                        }

                        window.loadAllCommentsForAdmin = loadAllCommentsForAdmin;
                        window.filterAdminComments = filterAdminComments;
                        window.deleteCommentAdmin = deleteCommentAdmin;
                        window.restoreCommentAdmin = restoreCommentAdmin;
                        window.toggleCommentSelection = toggleCommentSelection;
                        window.toggleSelectAllComments = toggleSelectAllComments;
                        window.bulkDeleteComments = bulkDeleteComments;
                        window.bulkRestoreComments = bulkRestoreComments;


                    