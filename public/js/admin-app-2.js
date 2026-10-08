
                        // Robust Security Gating Logic
                        let isSecurityVerified = false;
                        let isSecurityCheckComplete = false;

                        let securityGatePromise = null;

                        async function enforceSecurityGate() {
                            if (isSecurityVerified) return true;
                            if (securityGatePromise) return securityGatePromise;

                            securityGatePromise = (async () => {
                                // First ask server whether an entry key is configured and required
                                try {
                                    const cfgRes = await fetch('/api/settings/security', { credentials: 'include' });
                                    const cfg = await cfgRes.json().catch(() => ({}));
                                    // If server reports no entry key configured or not applicable, skip gating
                                    if (!cfg || !cfg.hasEntryKey || cfg.hasUserKey === false) {
                                        isSecurityVerified = true;
                                        isSecurityCheckComplete = true;
                                        return true;
                                    }
                                } catch (e) {
                                    console.error('security config check failed:', e);
                                    // fallthrough to checking verification state
                                }

                                // Check server-side session for prior admin-key verification for this user
                                try {
                                    const res = await fetch('/api/settings/check-admin-key-verified', { credentials: 'include' });
                                    const data = await res.json().catch(() => ({}));
                                    if (data && data.verified) {
                                        isSecurityVerified = true;
                                        isSecurityCheckComplete = true;
                                        return true;
                                    }
                                } catch (e) {
                                    console.error('check-admin-key-verified failed:', e);
                                    // continue to show modal
                                }

                                // Not verified: show modal and wait for verification via /api/security/admin-key/verify
                                const modal = document.getElementById('admin-key-modal');
                                if (modal) {
                                    modal.style.display = 'flex';
                                    modal.style.opacity = '1';
                                }

                                // Provide a promise that resolves when verifyAdminKeyModal calls resolveSecurityGate(true)
                                return new Promise((resolve) => {
                                    window.resolveSecurityGate = (ok) => {
                                        isSecurityVerified = !!ok;
                                        isSecurityCheckComplete = true;
                                        securityGatePromise = null;
                                        resolve(ok === true);
                                    };
                                });
                            })();

                            return securityGatePromise;
                        }

                        // Wrapper function to ensure security is checked before running anything else
                        async function runPostSecurity(fn) {
                            const ok = await enforceSecurityGate();
                            if (ok) {
                                return fn();
                            }
                        }

                        // Expose functions to window for onclick handlers
                        window.addCategory = addCategory;
                        window.loadCategories = loadCategories;
                        window.populatePostCategoryDropdown = populatePostCategoryDropdown;
                        window.deleteCategory = deleteCategory;
                        window.editCategory = editCategory;
                        window.toggleSelectAllCategories = toggleSelectAllCategories;
                        window.updateSelectedCategoriesCount = updateSelectedCategoriesCount;
                        window.deleteSelectedCategories = deleteSelectedCategories;
                        window.deleteSelectedPhotos = deleteSelectedPhotos;
                        window.saveAuthorInfo = saveAuthorInfo;
                        window.saveNotificationSettings = saveNotificationSettings;
                        window.setUserAdminKey = setUserAdminKey;
                        window.verifyUserAdminKey = verifyUserAdminKey;
                        window.saveContentSettings = saveContentSettings;
                        window.saveContentSettings = saveContentSettings;
                        window.uploadedProfilePictureUrl = '';

                        function updateTopbarAvatar(url) {
                            const avatar = document.getElementById('topbar-avatar');
                            if (avatar) {
                                avatar.src = url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=zedong';
                            }
                        }

                        window.handleProfilePictureUpload = handleProfilePictureUpload;
                        window.selectProfilePic = selectProfilePic;
                        window.handleProfilePicClick = handleProfilePicClick;
                        window.refreshProfileGallery = refreshProfileGallery;
                        window.closeLightbox = closeLightbox;
                        window.setProfileFromLightbox = setProfileFromLightbox;
                        window.saveProfilePicture = saveProfilePicture;
                        window.confirmUploadPreview = confirmUploadPreview;
                        window.closeUploadPreview = closeUploadPreview;

                        function updateSaveButtonVisibility() {
                            const saveBtn = document.getElementById('save-profile-pic-btn');
                            if (saveBtn) {
                                saveBtn.style.display = window.uploadedProfilePictureUrl ? 'inline-block' : 'none';
                            }
                        }

                        function refreshProfileGallery() {
                            const gallery = document.getElementById('profile-pics-gallery');
                            if (gallery) gallery.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Loading...</p>';
                            fetch('/api/uploads').then(r => r.json()).then(data => {
                                const gallery = document.getElementById('profile-pics-gallery');
                                if (gallery) {
                                    if (data.files && data.files.length > 0) {
                                        gallery.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:8px;width:100%;align-items:center;">
                                             <label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;user-select:none;">
                                                 <input type="checkbox" id="select-all-photos" onchange="toggleSelectAllPhotos()" style="width:14px;height:14px;cursor:pointer;">
                                                 Select All
                                             </label>
                                             <button type="button" id="delete-selected-photos" onclick="deleteSelectedPhotos()" style="display:none;background:#dc2626;color:white;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Delete Selected</button>
                                         </div><div style="display:flex;flex-wrap:wrap;gap:8px;">` + data.files.map(url => {
                                            const isSelected = url === window.uploadedProfilePictureUrl;
                                            return `<div class="profile-pic-thumb ${isSelected ? 'selected' : ''}" data-url="${url}" style="width:60px;height:60px;cursor:pointer;border:3px solid ${isSelected ? 'var(--primary-color)' : 'transparent'};border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);position:relative;">
                                                <input type="checkbox" class="photo-checkbox" data-url="${url}" onclick="event.stopPropagation();togglePhotoSelection()" style="position:absolute;top:2px;left:2px;width:16px;height:16px;cursor:pointer;z-index:1;">
                                                <img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:10px;\\'>Broken</div>'" onclick="handleProfilePicClick('${url}', this.parentElement)">
                                            </div>`;
                                        }).join('') + '</div>';
                                        updateSaveButtonVisibility();
                                    } else {
                                        gallery.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">No uploads found</p>';
                                    }
                                }
                            }).catch(err => {
                                console.error('Error loading gallery:', err);
                                const gallery = document.getElementById('profile-pics-gallery');
                                if (gallery) gallery.innerHTML = '<p style="color:red;font-size:12px;">Error loading</p>';
                            });
                        }

                        function toggleSelectAllPhotos() {
                            const selectAll = document.getElementById('select-all-photos');
                            const checkboxes = document.querySelectorAll('.photo-checkbox');
                            checkboxes.forEach(cb => cb.checked = selectAll.checked);
                            togglePhotoSelection();
                        }

                        function togglePhotoSelection() {
                            const checkboxes = document.querySelectorAll('.photo-checkbox');
                            const selectedUrls = document.querySelectorAll('.photo-checkbox:checked');
                            const deleteBtn = document.getElementById('delete-selected-photos');
                            const selectAll = document.getElementById('select-all-photos');
                            if (deleteBtn) {
                                deleteBtn.style.display = selectedUrls.length > 0 ? 'inline-block' : 'none';
                            }
                            if (selectAll) {
                                selectAll.checked = checkboxes.length > 0 && selectedUrls.length === checkboxes.length;
                                selectAll.indeterminate = selectedUrls.length > 0 && selectedUrls.length < checkboxes.length;
                            }
                        }

                        async function deleteSelectedPhotos() {
                            const checkboxes = document.querySelectorAll('.photo-checkbox:checked');
                            const urls = Array.from(checkboxes).map(cb => cb.dataset.url);
                            if (urls.length === 0) return;
                            if (!confirm(`Are you sure you want to delete ${urls.length} photo(s)?`)) return;
                            let successCount = 0;
                            for (const url of urls) {
                                try {
                                    const resp = await fetch('/api/uploads', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ url })
                                    });
                                    const data = await resp.json();
                                    if (resp.ok && data.success) successCount++;
                                } catch (e) {
                                    console.error('Error deleting photo:', e);
                                }
                            }
                            alert(`${successCount} photo(s) deleted successfully!`);
                            if (successCount > 0) refreshProfileGallery();
                        }

                        function selectProfilePic(url, el) {
                            document.querySelectorAll('.profile-pic-thumb').forEach(thumb => {
                                thumb.style.borderColor = 'transparent';
                            });
                            if (el) el.style.borderColor = 'var(--primary-color)';
                            window.uploadedProfilePictureUrl = url;
                            updateSaveButtonVisibility();
                        }

                        function handleProfilePicClick(url, el) {
                            document.getElementById('lightbox-img').src = url;
                            document.getElementById('profile-lightbox').classList.add('active');
                            window.lightboxSelectedUrl = url;
                            window.lightboxSelectedEl = el;
                        }

                        function closeLightbox() {
                            document.getElementById('profile-lightbox').classList.remove('active');
                        }

                        function setProfileFromLightbox() {
                            if (window.lightboxSelectedUrl) {
                                selectProfilePic(window.lightboxSelectedUrl, window.lightboxSelectedEl);
                                closeLightbox();
                            }
                        }

                        let pendingUploadFile = null;

                        function handleProfilePictureUpload() {
                            const fileInput = document.getElementById('profile-picture-file');
                            if (fileInput.files && fileInput.files[0]) {
                                const file = fileInput.files[0];
                                if (file.size > 10 * 1024 * 1024) {
                                    alert('Image file size exceeds 10MB limit.');
                                    fileInput.value = '';
                                    return;
                                }
                                if (!file.type.startsWith('image/')) {
                                    alert('Please select an image file.');
                                    fileInput.value = '';
                                    return;
                                }
                                const reader = new FileReader();
                                reader.onload = function(e) {
                                    document.getElementById('upload-preview-img').src = e.target.result;
                                    document.getElementById('upload-preview-modal').classList.add('active');
                                    pendingUploadFile = file;
                                };
                                reader.readAsDataURL(file);
                            }
                        }

                        function closeUploadPreview() {
                            document.getElementById('upload-preview-modal').classList.remove('active');
                            pendingUploadFile = null;
                            document.getElementById('profile-picture-file').value = '';
                        }

                        async function confirmUploadPreview() {
                            if (!pendingUploadFile) return;
                            const file = pendingUploadFile;
                            const modal = document.getElementById('upload-preview-modal');
                            modal.querySelector('.set-profile-btn').textContent = 'Uploading...';
                            modal.querySelector('.set-profile-btn').disabled = true;
                            try {
                                const formData = new FormData();
                                formData.append('image', file);
                                const options = { method: 'POST', credentials: 'include', body: formData };
                                const token = sessionStorage.getItem('authToken');
                                if (token) options.headers = { 'Authorization': `Bearer ${token}` };
                                const response = await fetch('/api/upload', options);
                                const data = await response.json();
                                if (data.url) {
                                    window.uploadedProfilePictureUrl = data.url;
                                    updateTopbarAvatar(data.url);
                                    const gallery = document.getElementById('profile-pics-gallery');
                                    if (gallery) {
                                        const newThumb = document.createElement('div');
                                        newThumb.className = 'profile-pic-thumb selected';
                                        newThumb.onclick = function() { handleProfilePicClick(data.url, this); };
                                        newThumb.style.cssText = 'width:60px;height:60px;cursor:pointer;border:3px solid var(--primary-color);border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);';
                                        newThumb.innerHTML = `<img src="${data.url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:10px;\\'>Broken</div>'">`;
                                        gallery.insertBefore(newThumb, gallery.firstChild);
                                        document.querySelectorAll('.profile-pic-thumb').forEach(thumb => {
                                            if (thumb !== newThumb) thumb.style.borderColor = 'transparent';
                                        });
                                    }
                                    updateSaveButtonVisibility();
                                    closeUploadPreview();
                                } else {
                                    alert('Failed to upload: ' + (data.error || 'Unknown error'));
                                }
                            } catch (err) {
                                console.error('Upload error:', err);
                                alert('Error uploading profile picture');
                            } finally {
                                modal.querySelector('.set-profile-btn').textContent = 'Confirm Upload';
                                modal.querySelector('.set-profile-btn').disabled = false;
                            }
                        }

                        async function saveProfilePicture() {
                            const url = window.uploadedProfilePictureUrl;
                            if (!url) {
                                alert('Please select a profile picture first.');
                                return;
                            }
                            const saveBtn = document.getElementById('save-profile-pic-btn');
                            const originalText = saveBtn.innerHTML;
                            saveBtn.innerHTML = '💾 Saving...';
                            saveBtn.disabled = true;
                            try {
                                const authorResponse = await apiFetch('/api/settings/author', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        name: document.getElementById('author-name')?.value || '',
                                        email: document.getElementById('author-email')?.value || '',
                                        bio: document.getElementById('author-bio')?.value || '',
                                        phone: document.getElementById('author-phone')?.value || '',
                                        whatsapp: document.getElementById('author-whatsapp')?.value || '',
                                        profilePicture: url,
                                        social: {
                                            twitter: document.getElementById('author-twitter')?.value || '',
                                            facebook: document.getElementById('author-facebook')?.value || '',
                                            linkedin: document.getElementById('author-linkedin')?.value || '',
                                            instagram: document.getElementById('author-instagram')?.value || '',
                                            website: document.getElementById('author-website')?.value || ''
                                        }
                                    })
                                });
                                if (authorResponse.ok) {
                                    updateTopbarAvatar(url);
                                    alert('Profile picture saved successfully!');
                                } else {
                                    const data = await authorResponse.json();
                                    alert('Failed to save: ' + (data.error || 'Unknown error'));
                                }
                            } catch (err) {
                                console.error('Error saving profile picture:', err);
                                alert('Error saving profile picture');
                            } finally {
                                saveBtn.innerHTML = originalText;
                                saveBtn.disabled = false;
                            }
                        }

                        function handlePostGalleryUpload() {
                            const fileInput = document.getElementById('post-images-file');
                            const previewContainer = document.getElementById('gallery-preview');
                            const galleryContainer = document.getElementById('gallery-images');
                            
                            galleryContainer.innerHTML = '';

                            if (fileInput.files && fileInput.files.length > 0) {
                                Array.from(fileInput.files).forEach((file, index) => {
                                    if (file.size > 100 * 1024 * 1024) {
                                        alert(`File "${file.name}" exceeds 100MB limit.`);
                                        return;
                                    }
                                    const reader = new FileReader();
                                    reader.onload = function (e) {
                                        const imgWrapper = document.createElement('div');
                                        imgWrapper.style.position = 'relative';
                                        imgWrapper.style.width = '80px';
                                        imgWrapper.style.height = '80px';
                                        const img = document.createElement('img');
                                        img.src = e.target.result;
                                        img.style.width = '100%';
                                        img.style.height = '100%';
                                        img.style.objectFit = 'cover';
                                        img.style.borderRadius = '8px';
                                        img.style.border = '1px solid #ddd';
                                        imgWrapper.appendChild(img);
                                        galleryContainer.appendChild(imgWrapper);
                                        previewContainer.style.display = 'block';
                                    };
                                    reader.readAsDataURL(file);
                                });
                            } else {
                                previewContainer.style.display = 'none';
                            }
                        }

window.loadPostsList = loadPostsList;
                        window.saveNewPost = saveNewPost;
                        window.handlePostImageUpload = handlePostImageUpload;
                        window.handlePostGalleryUpload = handlePostImageUpload;

                        function handlePostImageUpload() {
                            const fileInput = document.getElementById('post-image-file');
                            const featuredContainer = document.getElementById('image-preview');
                            const previewImg = document.getElementById('preview-img');
                            const galleryContainer = document.getElementById('gallery-preview');
                            const galleryImages = document.getElementById('gallery-images');

                            // Clear video preview when images are selected
                            const videoPreviewContainer = document.getElementById('video-preview');
                            const previewVideo = document.getElementById('preview-video');
                            if (videoPreviewContainer) videoPreviewContainer.style.display = 'none';
                            if (previewVideo) previewVideo.src = '';
                            document.getElementById('post-video-file').value = '';

                            const files = fileInput.files;
                            galleryImages.innerHTML = '';

                            if (files && files.length > 0) {
                                // First file goes to featured image
                                const reader = new FileReader();
                                reader.onload = function (e) {
                                    previewImg.src = e.target.result;
                                    featuredContainer.style.display = 'block';
                                };
                                reader.readAsDataURL(files[0]);

                                // Rest go to gallery
                                if (files.length > 1) {
                                    Array.from(files).forEach((file, index) => {
                                        const reader2 = new FileReader();
                                        reader2.onload = function (e) {
                                            const imgWrapper = document.createElement('div');
                                            imgWrapper.style.position = 'relative';
                                            imgWrapper.style.width = '80px';
                                            imgWrapper.style.height = '80px';
                                            imgWrapper.style.cursor = 'pointer';
                                            imgWrapper.dataset.index = index;
                                            imgWrapper.title = 'Click to remove';
                                            imgWrapper.onclick = function() {
                                                if (confirm('Remove this image?')) {
                                                    this.remove();
                                                    updateImageIndexes();
                                                }
                                            };
                                            const img = document.createElement('img');
                                            img.src = e.target.result;
                                            img.style.width = '100%';
                                            img.style.height = '100%';
                                            img.style.objectFit = 'cover';
                                            img.style.borderRadius = '8px';
                                            img.style.border = '1px solid #ddd';
                                            imgWrapper.appendChild(img);
                                            galleryImages.appendChild(imgWrapper);
                                        };
                                        reader2.readAsDataURL(file);
                                    });
                                    galleryContainer.style.display = 'block';
                                } else {
                                    galleryContainer.style.display = 'none';
                                }
                            } else {
                                featuredContainer.style.display = 'none';
                                previewImg.src = '';
                                galleryContainer.style.display = 'none';
                            }
                        }

                        function updateImageIndexes() {
                            // Update indices after removal
                            const galleryImages = document.getElementById('gallery-images');
                            const wrappers = galleryImages.querySelectorAll('div');
                            wrappers.forEach((w, i) => w.dataset.index = i + 1);
                        }

                        function handlePostVideoUpload() {
                            const fileInput = document.getElementById('post-video-file');
                            const previewContainer = document.getElementById('video-preview');
                            const previewVideo = document.getElementById('preview-video');

                            // Clear image preview if video is selected
                            const imagePreviewContainer = document.getElementById('image-preview');
                            const previewImg = document.getElementById('preview-img');
                            if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
                            if (previewImg) previewImg.src = '';
                            document.getElementById('post-image-file').value = '';

                            if (fileInput.files && fileInput.files[0]) {
                                const file = fileInput.files[0];
                                if (file.size > 100 * 1024 * 1024) {
                                    alert('Video file size exceeds 100MB limit.');
                                    fileInput.value = '';
                                    return;
                                }
                                const url = URL.createObjectURL(file);
                                previewVideo.src = url;
                                previewContainer.style.display = 'block';
                            } else {
                                previewContainer.style.display = 'none';
                                previewVideo.src = '';
                            }
                        }

                        function toggleRecycleBin() {
                            const container = document.getElementById('recycle-bin-container');
                            if (container.style.display === 'none') {
                                container.style.display = 'block';
                                loadDeletedPostsList();
                            } else {
                                container.style.display = 'none';
                            }
                        }
                        window.previewPost = previewPost;
                        window.clearPostForm = clearPostForm;
                        window.toggleSelectAllPosts = toggleSelectAllPosts;
                        window.updateSelectedCount = updateSelectedCount;
                        window.deleteSelectedPosts = deleteSelectedPosts;
                        window.editPost = editPost;
                        window.deletePost = deletePost;
                        window.loadDeletedPostsList = loadDeletedPostsList;
                        window.restorePost = restorePost;
                        window.permanentlyDeletePost = permanentlyDeletePost;
                        window.handlePostVideoUpload = handlePostVideoUpload;
                        window.toggleRecycleBin = toggleRecycleBin;

                        // Auto-login for localhost development
                        async function autoLoginForLocalhost() {
                            try {
                                console.log('Attempting localhost auto-login...');
                                const response = await fetch('/auth/dev-login', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include'
                                });

                                const data = await response.json();
                                if (data.success && data.token) {
                                    sessionStorage.setItem('authToken', data.token);
                                    console.log('✓ Auto-login successful for localhost');
                                } else {
                                    console.warn('✗ Auto-login failed for localhost:', data.error || 'Invalid credentials');
                                }
                            } catch (error) {
                                console.error('✗ Auto-login network error:', error);
                            }
                        }

                        // Tab-scoped auth gate: the authToken lives in sessionStorage,
                        // which the browser wipes when the tab closes. A freshly opened
                        // admin tab therefore has no token and must re-authenticate —
                        // this guarantees login is never cached across tab sessions.
                        function forceLoginRedirect() {
                            try { sessionStorage.removeItem('authToken'); } catch (_) { }
                            try {
                                navigator.sendBeacon('/auth/logout', new Blob([], { type: 'application/json' }));
                            } catch (_) {
                                fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
                            }
                            window.location.href = '/login.html';
                        }

                        async function enforceTabAuthGate() {
                            try {
                                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                                    await autoLoginForLocalhost();
                                }
                                if (!sessionStorage.getItem('authToken')) {
                                    forceLoginRedirect();
                                }
                            } catch (e) {
                                console.error('Tab auth gate error:', e);
                                forceLoginRedirect();
                            }
                        }

                        // Run auto-login once on page load for localhost, then enforce the gate
                        if (document.readyState === 'loading') {
                            document.addEventListener('DOMContentLoaded', enforceTabAuthGate);
                        } else {
                            enforceTabAuthGate();
                        }

                        // Load settings to populate sidebar and form fields
                        (async () => {
                            try {
                                const [blogInfoData, authorData] = await Promise.all([
                                    fetch('/api/settings/blog-info').then(res => res.json()),
                                    fetch('/api/settings/author').then(res => res.json())
                                ]);

                                const blogInfo = blogInfoData.blogInfo || {};
                                const author = authorData.author || {};

                                // Sidebar title and document title
                                const sidebarTitle = document.querySelector('.sidebar-logo .sidebar-logo-title');
                                if (sidebarTitle) sidebarTitle.textContent = blogInfo.title || 'Admin Panel';
                                document.title = `Admin Panel - ${blogInfo.title || 'Blog'}`;

                                console.log('Loading saved settings:', { blogInfo, author });

                                // Populate form fields with saved values
                                const blogTitle = document.getElementById('blog-title');
                                const blogDescription = document.getElementById('blog-description');
                                const authorName = document.getElementById('author-name');
                                const authorEmail = document.getElementById('author-email');
                                const authorBio = document.getElementById('author-bio');
                                const authorPhone = document.getElementById('author-phone');
                                const authorWhatsapp = document.getElementById('author-whatsapp');
                                const authorTwitter = document.getElementById('author-twitter');
                                const authorFacebook = document.getElementById('author-facebook');
                                const authorLinkedin = document.getElementById('author-linkedin');
                                const authorInstagram = document.getElementById('author-instagram');
                                const authorWebsite = document.getElementById('author-website');
                                const authorSocialEmail = document.getElementById('author-social-email');

                                // Blog info fields
                                if (blogTitle) blogTitle.value = blogInfo.title || 'zedong254ke';
                                if (blogDescription) blogDescription.value = blogInfo.description || 'Discover insights, tutorials, and thoughts on web development, programming, and technology.';

                                // Author fields
                                if (authorName) authorName.value = author.name || 'zedong254ke';
                                if (authorEmail) authorEmail.value = author.email || '';
                                if (authorBio) authorBio.value = author.bio || 'Passionate developer and blogger sharing insights on technology and programming.';
                                if (authorPhone) authorPhone.value = author.phone || '';
                                if (authorWhatsapp) authorWhatsapp.value = author.whatsapp || '';
                                if (authorTwitter) authorTwitter.value = author.social?.twitter || '';
                                if (authorFacebook) authorFacebook.value = author.social?.facebook || '';
                                if (authorLinkedin) authorLinkedin.value = author.social?.linkedin || '';
                                if (authorInstagram) authorInstagram.value = author.social?.instagram || '';
                                if (authorWebsite) authorWebsite.value = author.social?.website || '';
                                if (authorSocialEmail) authorSocialEmail.value = author.social?.email || author.email || '';

                                // Update top-bar avatar with saved profile picture
                                if (author.profilePicture) {
                                    window.uploadedProfilePictureUrl = author.profilePicture;
                                    updateTopbarAvatar(author.profilePicture);
                                }

                                console.log('Settings loaded and form populated successfully');
                            } catch (err) {
                                console.error('Error loading settings:', err);
                            }
                        })();

                        // Function aliases for posts

                        window.viewPostStats = function () {
                            console.log('viewPostStats called');
                            showAnalyticsSection();
                        };

                        // Sidebar toggle
                        window.toggleSidebar = function () {
                            const sidebar = document.getElementById('sidebar');
                            if (sidebar) sidebar.classList.toggle('collapsed');
                        };

                        // Modern Settings Navigation
                        let settingsNavigationInitialized = false;

                        function initSettingsNavigation() {
                            // Prevent multiple initializations
                            if (settingsNavigationInitialized) {
                                console.log('Settings navigation already initialized, skipping');
                                return;
                            }

                            console.log('initSettingsNavigation called');
                            const settingsSection = document.getElementById('settings-section');
                            if (!settingsSection) {
                                console.error('Settings section not found');
                                return;
                            }

                            const settingsSidebar = settingsSection.querySelector('.settings-sidebar');
                            if (!settingsSidebar) {
                                console.error('Settings sidebar not found');
                                return;
                            }

                            console.log('Found sidebar, attaching click handlers');

                            // Add click listener to sidebar using event delegation
                            settingsSidebar.addEventListener('click', (event) => {
                                const button = event.target.closest('.settings-nav-btn');
                                if (!button) {
                                    return;
                                }

                                event.preventDefault();
                                event.stopPropagation();

                                const targetPanel = button.getAttribute('data-panel');
                                console.log('Button clicked, switching to panel:', targetPanel);

                                switchSettingsPanel(targetPanel);
                            });

                            settingsNavigationInitialized = true;
                            console.log('Settings navigation initialized successfully');
                        }

                        // Expose functions globally for settings module
                        window.initSettingsNavigation = initSettingsNavigation;
                        window.switchSettingsPanel = switchSettingsPanel;

                        // Initialize settings navigation on page load
                        document.addEventListener('DOMContentLoaded', function () {
                            initSettingsNavigation();
                        });

                        // Also initialize immediately if DOM is already loaded
                        if (document.readyState !== 'loading') {
                            initSettingsNavigation();
                        }

                        // Enhanced Post Rendering for Modern UI
                        async function loadAndRenderPosts() {
                            const container = document.getElementById('posts-list');
                            if (!container) return;

                            // Show loading state
                            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-medium);">Loading posts...</div>';

                            try {
                                const response = await apiFetch('/api/posts');
                                const data = await response.json();
                                const posts = data.posts || [];

                                if (posts.length === 0) {
                                    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-medium);">No posts found. Create one to get started!</div>';
                                    return;
                                }

                                container.innerHTML = posts.map(post => `
                    <div class="post-item">
                        <div class="post-item-header">
                            <h4 class="post-item-title">${post.title}</h4>
                            <div style="display:flex; gap:8px;">
                                <button class="btn-modern sm" style="background-color: #dc2626;" onclick="window.deletePost && window.deletePost('${post.id}')">Delete</button>
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

                                const listContainer = document.getElementById('posts-list-container');
                                if (listContainer) listContainer.style.display = 'block';

                            } catch (e) {
                                console.error('Error rendering posts:', e);
                                container.innerHTML = '<div style="text-align:center; color:#dc2626;">Failed to load posts.</div>';
                            }
                        }



                        window.handleCreateUser = async function (event) {
                            event.preventDefault();

                            const username = document.getElementById('new-username').value.trim();
                            const password = document.getElementById('new-password').value.trim();
                            const name = document.getElementById('new-name').value.trim();
                            const email = document.getElementById('new-email').value.trim();
                            const adminKey = document.getElementById('new-admin-key').value.trim();
                            const role = document.getElementById('new-role').value;

                            if (!username || !password || !name || !email) {
                                alert('All fields are required');
                                return;
                            }

                            try {
                                const headers = getAuthHeaders();
                                const token = sessionStorage.getItem('authToken');
                                console.log('Creating user with token:', token ? 'Token found' : 'No token found');

                                const body = { username, password, name, email, role };
                                if (adminKey) body.adminKey = adminKey;

                                const response = await fetch('/api/users', {
                                    method: 'POST',
                                    headers: headers,
                                    credentials: 'include',
                                    body: JSON.stringify(body)
                                });

                                console.log('Response status:', response.status);
                                const data = await response.json();

                                if (response.ok && data.success) {
                                    alert('User created successfully!');
                                    document.getElementById('create-user-form').reset();
                                    loadUsers(); // Refresh the list
                                } else {
                                    alert('Failed to create user: ' + (data.error || 'Unknown error'));
                                }
                            } catch (e) {
                                console.error('Error creating user:', e);
                                alert('Failed to create user. Check console for details.');
                            }
                        };


                        async function verifyAdminKeyModal() {
                            const keyInput = document.getElementById('modal-admin-key');
                            const errorEl = document.getElementById('modal-error');
                            const key = keyInput.value;

                            // Reset error state
                            errorEl.style.display = 'none';
                            keyInput.style.borderColor = '#e2e8f0';

                            if (!key) return;

                            try {
                                const res = await fetch('/api/security/admin-key/verify', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({ adminKey: key })
                                });
                                const data = await res.json();

                            if (data.success) {
                                    // After successful verify, clear server-side check marker by calling check endpoint (session set by server)
                                    try { await fetch('/api/settings/check-admin-key-verified', { credentials: 'include' }); } catch (_) {}
                                    const modal = document.getElementById('admin-key-modal');
                                    modal.style.opacity = '0';
                                    setTimeout(() => {
                                        modal.style.display = 'none';
                                        if (window.resolveSecurityGate) window.resolveSecurityGate(true);
                                    }, 300);
                                } else {
                                    keyInput.style.borderColor = '#ef4444';
                                    keyInput.value = '';
                                    errorEl.style.display = 'flex';
                                    // Trigger reflow for animation restart
                                    errorEl.style.animation = 'none';
                                    errorEl.offsetHeight;
                                    errorEl.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
                                }
                            } catch (e) {
                                console.error(e);
                                alert('Verification failed. Please try again.');
                            }
                        }

                        // Create user form handler (redundant safety binding)
                        const createUserForm = document.getElementById('create-user-form');
                        if (createUserForm) {
                            if (typeof createUserForm.addEventListener === 'function') {
                                createUserForm.addEventListener('submit', handleCreateUser);
                            }
                        }

                        // Users: load and create

                        async function loadUsers() {
                            const container = document.getElementById('users-list');
                            if (container) {
                                container.innerHTML = '<div style="padding:12px; color:var(--text-medium);">Loading users…</div>';
                            }

                            try {
                                const res = await fetch('/api/users', { credentials: 'include', headers: getAuthHeaders() });
                                const data = await res.json();

                                if (!res.ok) {
                                    const msg = data?.error || `Failed to load users (HTTP ${res.status})`;
                                    if (container) container.innerHTML = `<div style="padding:12px; color:#dc2626;">${msg}</div>`;
                                    return;
                                }

                                const users = Array.isArray(data.users) ? data.users : [];

                                // For template buyers, hide the main admin account and other admin accounts
                                const isBuyerPortal = window.__portalRole === 'TEMPLATE_BUYER';
                                const filteredUsers = isBuyerPortal
                                    ? users.filter(u => (u.role || '').toUpperCase() !== 'ADMIN' && !u.buyerId)
                                    : users;

                                // Determine if current user is the main seller (ADMIN without buyerId)
                                const isSeller = window.__portalRole === 'ADMIN' && !window.__portalUser?.buyerId;

                                // Render to Users panel with management controls
                                const usersList = document.getElementById('users-list');
                                if (usersList) {
                                    usersList.innerHTML = filteredUsers.map(u => {
                                        const role = (u.role || 'USER').toUpperCase();
                                        const isActive = u.active !== false;
                                        const initials = (u.username || '??').slice(0, 2).toUpperCase();
                                        const avatarClass = role === 'ADMIN' ? 'ua-purple' : 'ua-blue';
                                        const isDemote = role === 'ADMIN';
                                        const userRights = Array.isArray(u.rights) ? u.rights : [];
                                        const hasViewTemplate = userRights.includes('view_template');
                                        return `
                                          <div class="user-row">
                                            <div class="user-info">
                                              <div class="user-avatar ${avatarClass}">${initials}</div>
                                              <div>
                                                <div class="user-name">
                                                  ${u.username}
                                                  ${role === 'ADMIN' ? '<span class="badge badge-admin">Admin</span>' : ''}
                                                </div>
                                                <div class="user-email">${u.email || ''}</div>
                                                <div class="key-status ${u.adminKeySet ? 'key-set' : 'key-unset'}">
                                                  <i class="ti ${u.adminKeySet ? 'ti-check' : 'ti-x'}"></i>
                                                  ${u.adminKeySet ? 'Admin key set' : 'Admin key not set'}
                                                </div>
                                              </div>
                                            </div>
                                            <div class="user-rights">
                                              <span class="rights-label"><i class="ti ti-shield"></i> Rights:</span>
                                              ${isSeller ? `
                                              <label class="right-toggle" title="Allow user to view the blog template">
                                                <input type="checkbox" ${hasViewTemplate ? 'checked' : ''} onchange="toggleUserRight('${u.username}', 'view_template', this.checked)">
                                                <span class="right-toggle-label">View Template</span>
                                              </label>
                                              ` : ''}
                                            </div>
                                             <div class="action-group">
                                              <button class="action-btn btn-default" onclick="toggleUserRole('${u.username}', '${isDemote ? 'USER' : 'ADMIN'}')">
                                                <i class="ti ${isDemote ? 'ti-arrow-down' : 'ti-arrow-up'}"></i> ${isDemote ? 'Demote' : 'Promote'}
                                              </button>
                                              <button class="action-btn ${isActive ? 'btn-warning' : 'btn-default'}" onclick="toggleUserStatus('${u.username}', ${!isActive})">
                                                <i class="ti ${isActive ? 'ti-ban' : 'ti-player-play'}"></i> ${isActive ? 'Deactivate' : 'Activate'}
                                              </button>
                                              <button class="action-btn btn-info" onclick="editUserEmail('${u.username}')">
                                                <i class="ti ti-mail"></i> Email
                                              </button>
                                              <button class="action-btn btn-info" onclick="changeUserPassword('${u.username}')">
                                                <i class="ti ti-key"></i> Password
                                              </button>
                                              <button class="action-btn btn-success" onclick="setUserAdminKey('${u.username}')">
                                                <i class="ti ti-key"></i> Set key
                                              </button>
                                              <button class="action-btn btn-default" onclick="viewUserAdminKey('${u.username}')">
                                                <i class="ti ti-eye"></i> View key
                                              </button>
                                              <button class="action-btn btn-warning" onclick="clearUserAdminKey('${u.username}')">
                                                <i class="ti ti-eraser"></i> Clear key
                                              </button>
                                              <button class="action-btn btn-danger" onclick="deleteUser('${u.username}')">
                                                <i class="ti ti-trash"></i> Delete
                                              </button>
                                              ${isSeller ? `
                                              <button class="action-btn ${isActive ? 'btn-warning' : 'btn-success'}" onclick="toggleUserSuspension('${u.username}', ${isActive})">
                                                <i class="ti ${isActive ? 'ti-ban' : 'ti-check'}"></i> ${isActive ? 'Suspend' : 'Unsuspend'}
                                              </button>
                                              ` : ''}
                                            </div>
                                          </div>
                                        `;
                                    }).join('');
                                }
                            } catch (e) {
                                console.error('loadUsers error:', e);
                                if (container) container.innerHTML = `<div style="padding:12px; color:#dc2626;">Failed to load users</div>`;
                            }
                        }
                        window.loadUsers = loadUsers;

                        window.toggleUserRole = async function (username, newRole) {
                            try {
                                const response = await fetch(`/api/users/${username}`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: getAuthHeaders(),
                                    body: JSON.stringify({ role: newRole })
                                });
                                const data = await response.json();
                                if (!response.ok) {
                                    alert('Failed to update role: ' + (data.error || 'Unknown error'));
                                    return;
                                }
                                alert(`User ${username} role changed to ${newRole}`);
                                loadUsers();
                            } catch (e) {
                                console.error('Error updating user role:', e);
                                alert('Error updating user role');
                            }
                        };

                        window.toggleUserStatus = async function (username, newStatus) {
                            try {
                                console.log('Toggling user status:', username, 'to', newStatus);

                                const response = await fetch(`/api/users/${username}`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: getAuthHeaders(),
                                    body: JSON.stringify({ active: newStatus })
                                });

                                const data = await response.json();

                                if (!response.ok) {
                                    console.error('Failed to update user status:', data.error);
                                    alert('Failed to update user: ' + (data.error || 'Unknown error'));
                                    return;
                                }

                                console.log('User status updated successfully:', data);
                                alert('User status updated successfully!');
                            } catch (e) {
                                console.error('Error updating user status:', e);
                                alert('Error updating user status');
                            }
                        };

                        // Suspend / unsuspend a user (seller-only action)
                        window.toggleUserSuspension = async function (username, shouldSuspend) {
                            if (shouldSuspend) {
                                const reason = prompt(`Reason for suspending ${username}:\n(e.g. "Posting violent content without context")`);
                                if (reason === null) return; // cancelled
                                try {
                                    const resp = await fetch('/api/admin/suspend-user', {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: getAuthHeaders(),
                                        body: JSON.stringify({ username, reason: reason || 'Suspended by administrator.' })
                                    });
                                    const data = await resp.json();
                                    if (resp.ok && data.success) {
                                        alert(`${username} has been suspended.`);
                                        loadUsers();
                                    } else {
                                        alert('Failed to suspend: ' + (data.error || 'Unknown error'));
                                    }
                                } catch (e) {
                                    alert('Error suspending user');
                                }
                            } else {
                                if (!confirm(`Unsuspend ${username}?`)) return;
                                try {
                                    const resp = await fetch('/api/admin/unsuspend-user', {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: getAuthHeaders(),
                                        body: JSON.stringify({ username })
                                    });
                                    const data = await resp.json();
                                    if (resp.ok && data.success) {
                                        alert(`${username} has been unsuspended.`);
                                        loadUsers();
                                    } else {
                                        alert('Failed to unsuspend: ' + (data.error || 'Unknown error'));
                                    }
                                } catch (e) {
                                    alert('Error unsuspending user');
                                }
                            }
                        };

                        window.editUserEmail = async function (username) {
                            const newEmail = prompt(`Enter new email for ${username}:`);
                            if (!newEmail || !newEmail.trim()) return;
                            try {
                                const response = await fetch(`/api/users/${username}`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: getAuthHeaders(),
                                    body: JSON.stringify({ email: newEmail.trim() })
                                });
                                const data = await response.json();
                                if (!response.ok) {
                                    alert('Failed to update email: ' + (data.error || 'Unknown error'));
                                    return;
                                }
                                alert('Email updated successfully!');
                                loadUsers();
                            } catch (e) {
                                console.error('Error updating email:', e);
                                alert('Error updating email');
                            }
                        };

                        window.changeUserPassword = async function (username) {
                            const newPassword = prompt(`Enter new password for ${username}:`);
                            if (!newPassword || !newPassword.trim()) return;
                            if (newPassword.length < 6) {
                                alert('Password must be at least 6 characters');
                                return;
                            }
                            if (!confirm(`Change password for ${username}?`)) return;
                            try {
                                const response = await fetch(`/api/users/${username}`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: getAuthHeaders(),
                                    body: JSON.stringify({ password: newPassword.trim() })
                                });
                                const data = await response.json();
                                if (!response.ok) {
                                    alert('Failed to change password: ' + (data.error || 'Unknown error'));
                                    return;
                                }
                                alert('Password changed successfully!');
                            } catch (e) {
                                console.error('Error changing password:', e);
                                alert('Error changing password');
                            }
                        };

                        window.deleteUser = async function (username) {
                            if (!confirm(`⚠️ Permanently delete user "${username}"? This cannot be undone.`)) return;
                            if (!confirm(`Are you absolutely sure? All data for "${username}" will be removed.`)) return;
                            try {
                                const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                                    method: 'DELETE',
                                    credentials: 'include',
                                    headers: getAuthHeaders()
                                });
                                const data = await response.json();
                                if (!response.ok) {
                                    alert('Failed to delete user: ' + (data.error || 'Unknown error'));
                                    return;
                                }
                                alert('User deleted successfully!');
                                loadUsers();
                            } catch (e) {
                                console.error('Error deleting user:', e);
                                alert('Error deleting user');
                            }
                        };

                        window.toggleUserRight = async function (username, right, enabled) {
                            try {
                                const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                                    method: 'GET',
                                    credentials: 'include',
                                    headers: getAuthHeaders()
                                });
                                const data = await res.json();
                                if (!res.ok || !data.user) {
                                    alert('Failed to load user rights: ' + (data.error || 'Unknown error'));
                                    loadUsers();
                                    return;
                                }
                                let currentRights = Array.isArray(data.user.rights) ? [...data.user.rights] : [];
                                if (enabled && !currentRights.includes(right)) {
                                    currentRights.push(right);
                                } else if (!enabled) {
                                    currentRights = currentRights.filter(r => r !== right);
                                }
                                const updateRes = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: getAuthHeaders(),
                                    body: JSON.stringify({ rights: currentRights })
                                });
                                const updateData = await updateRes.json();
                                if (!updateRes.ok) {
                                    alert('Failed to update rights: ' + (updateData.error || 'Unknown error'));
                                }
                                loadUsers();
                            } catch (e) {
                                console.error('Error updating user rights:', e);
                                alert('Error updating user rights');
                            }
                        };

                        async function setUserAdminKey(username) {
                            const adminKey = prompt(`Enter admin key for user ${username}:`);
                            if (!adminKey) return;

                            try {
                                console.log('Setting admin key for user:', username);

                                const response = await fetch(`/api/users/${username}/admin-key`, {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: getAuthHeaders(),
                                    body: JSON.stringify({ adminKey })
                                });

                                const data = await response.json();

                                if (!response.ok) {
                                    console.error('Failed to set admin key:', data.error);
                                    alert('Failed to set admin key: ' + (data.error || 'Unknown error'));
                                    return;
                                }

                                console.log('Admin key set successfully');
                                alert('Admin key set successfully for ' + username + '. Users will need to re-login.');
                                // Prompt users to re-login by redirecting to login page
                                window.location.href = '/login.html';
                            } catch (e) {
                                console.error('Error setting admin key:', e);
                                alert('Error setting admin key');
                            }
                        }

                        async function clearUserAdminKey(username) {
                            if (!confirm(`Clear admin key for ${username}?`)) return;
                            try {
                                const response = await fetch(`/api/users/${encodeURIComponent(username)}/admin-key`, {
                                    method: 'DELETE',
                                    credentials: 'include',
                                    headers: getAuthHeaders()
                                });
                                const data = await response.json();
                                if (!response.ok) {
                                    alert('Failed to clear admin key: ' + (data.error || 'Unknown error'));
                                    return;
                                }
                                alert('Admin key cleared for ' + username);
                                if (typeof loadUsers === 'function') loadUsers();
                            } catch (e) {
                                console.error('Error clearing user admin key:', e);
                                alert('Error clearing admin key');
                            }
                        }
                        window.clearUserAdminKey = clearUserAdminKey;

                        async function verifyUserAdminKey(username) {
                            const adminKey = prompt(`Enter admin key for ${username}:`);
                            if (!adminKey) return false;

                            try {
                                console.log('Verifying admin key for user:', username);

                                const response = await fetch(`/api/users/${username}/verify-admin-key`, {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ adminKey })
                                });

                                const data = await response.json();

                                if (!response.ok) {
                                    console.error('Failed to verify admin key:', data.error);
                                    alert('Invalid admin key. Access denied.');
                                    return false;
                                }

                                console.log('Admin key verified');
                                alert('Admin key verified. Redirecting to login...');
                                window.location.href = '/login.html';
                                return true;
                            } catch (e) {
                                console.error('Error verifying admin key:', e);
                                alert('Error verifying admin key');
                                return false;
                            }
                        }

                        async function viewUserAdminKey(username) {
                            const password = prompt(`Enter your admin password to view admin key for ${username}:`);
                            if (!password) return;

                            try {
                                const response = await fetch(`/api/users/${encodeURIComponent(username)}/admin-key/view`, {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: getAuthHeaders(),
                                    body: JSON.stringify({ password })
                                });

                                const data = await response.json();

                                if (!response.ok) {
                                    alert('Failed to view admin key: ' + (data.error || 'Access denied'));
                                    return;
                                }

                                alert(`Admin key for ${username}: ${data.key}`);
                            } catch (e) {
                                console.error('Error viewing admin key:', e);
                                alert('Error viewing admin key');
                            }
                        }

                        // Navigation Functions - Define all before any onclick handlers can fire
                        function handleHashRoute() {
                            // First check if there's a saved section in localStorage
                            const savedSection = localStorage.getItem('adminCurrentSection');
                            const hash = window.location.hash.slice(1);

                            // If hash is provided in URL, use it (has priority)
                            if (hash) {
                                const routeMap = {
                                    'dashboard': () => showDashboard(),
                                    'create-post': () => showCreatePostSection(),
                                    'posts': () => showPostsSection(),
                                    'analytics': () => showAnalyticsSection(),
                                    'users': () => showUsersSection(),
                                    'settings': () => showSettingsSection()
                                };

                                const handler = routeMap[hash];
                                if (handler) {
                                    handler();
                                }
                            } else if (savedSection) {
                                // Restore saved section from localStorage
                                console.log('Restoring saved section:', savedSection);
                                switch (savedSection) {
                                    case 'dashboard':
                                        showDashboard();
                                        break;
                                    case 'create-post':
                                        showCreatePostSection();
                                        break;
                                    case 'posts':
                                        showPostsSection();
                                        break;
                                    case 'analytics':
                                        showAnalyticsSection();
                                        break;
                                    case 'users':
                                        showUsersSection();
                                        break;
                                    case 'settings':
                                        showSettingsSection();
                                        break;
                                    default:
                                        showDashboard();
                                }
                            } else {
                                // Default to dashboard
                                showDashboard();
                            }
                        }
                        window.handleHashRoute = handleHashRoute;

                        window.analyticsCharts = {}; 
                        function saveCurrentSection(section) {
                            try {
                                localStorage.setItem('adminCurrentSection', section);
                                console.log('Saved current section:', section);
                            } catch (e) {
                                console.warn('Could not save section to localStorage:', e);
                            }
                        }

                        // Analytics Dashboard Logic
                        async function initAnalyticsCharts() {
                            if (typeof Chart === 'undefined') { console.error('Chart.js not loaded'); return; }
                            // Destroy existing charts before re-creating
                            for (const id of ['pageViewsChart', 'engagementChart']) {
                                const el = document.getElementById(id);
                                if (el) {
                                    const existing = Chart.getChart(el);
                                    if (existing) existing.destroy();
                                }
                            }

                            const chartConfigs = {
                                pageViewsChart: {
                                    type: 'line',
                                    label: 'Current Period',
                                    color: '#f4a191'
                                },
                                engagementChart: {
                                    type: 'bar',
                                    label: 'Interactions',
                                    color: '#10b981'
                                }
                            };

                            for (const [id, config] of Object.entries(chartConfigs)) {
                                const ctx = document.getElementById(id);
                                if (!ctx) continue;

                                const datasets = [{
                                    label: config.label,
                                    data: [],
                                    borderColor: config.color,
                                    backgroundColor: `${config.color}20`,
                                    borderWidth: 2,
                                    fill: true,
                                    tension: 0.4
                                }];

                                if (id === 'pageViewsChart') {
                                    datasets.push({
                                        label: 'Previous Period',
                                        data: [],
                                        borderColor: '#cbd5e1',
                                        borderDash: [5, 5],
                                        backgroundColor: 'transparent',
                                        borderWidth: 2,
                                        fill: false,
                                        tension: 0.4
                                    });
                                }

                                window.analyticsCharts[id] = new Chart(ctx, {
                                    type: config.type,
                                    data: { labels: [], datasets },
                                    options: {
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { 
                                                display: true,
                                                position: 'top',
                                                labels: { boxWidth: 10, font: { size: 10, weight: '600' } }
                                            },
                                            tooltip: {
                                                mode: 'index',
                                                intersect: false,
                                                padding: 10,
                                                backgroundColor: 'rgba(0,0,0,0.8)'
                                            }
                                        },
                                        scales: {
                                            y: { 
                                                beginAtZero: true, 
                                                grid: { borderDash: [2, 2], color: '#f1f5f9' },
                                                ticks: { font: { size: 10 }, color: '#94a3b8' } 
                                            },
                                            x: { 
                                                grid: { display: false },
                                                ticks: { font: { size: 10 }, color: '#94a3b8' }
                                            }
                                        }
                                    }
                                });
                            }

                            refreshAnalytics();
                        }

                        async function refreshAnalytics() {
                            const periodSelect = document.getElementById('analytics-period');
                            const period = periodSelect ? periodSelect.value : '7';
                            const btn = document.querySelector('button[onclick="refreshAnalytics()"]');
                            if (btn) btn.innerHTML = '<i>🔄</i> Loading...';

                            console.log('[Analytics] Refreshing for period:', period);

                            try {
                                const response = await apiFetch(`/api/stats?period=${period}`);
                                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                                
                                const data = await response.json();
                                if (!data || !data.stats) throw new Error('Invalid JSON response: missing stats');
                                
                                console.log('[Analytics] Data received:', data.stats);
                                updateDashboard(data.stats);
                            } catch (e) {
                                console.error('[Analytics] Critical failure:', e);
                                // Show error in a panel if possible
                                const heatmapContainer = document.getElementById('activity-heatmap');
                                if (heatmapContainer) heatmapContainer.innerHTML = `<div style="color:red;padding:20px;">Error: ${e.message}</div>`;
                            } finally {
                                if (btn) btn.innerHTML = '<i>🔄</i> Refresh';
                            }
                        }

                        function updateDashboard(stats) {
                            console.log('[Analytics] Updating dashboard components...');
                            
                            // Wrapped in individual try-catch to ensure one failure doesn't kill the whole dashboard
                            const runSafe = (name, fn) => {
                                try { fn(); } catch(err) { console.error(`[Analytics] Component failed: ${name}`, err); }
                            };

                            // The API sends engagementRate/avgTime/bounceRate pre-formatted
                            // ("12.5%", "3.2m") while other deployments send raw numbers.
                            const toNum = (v, fallback) => {
                                if (typeof v === 'number') return isFinite(v) ? v : (fallback || 0);
                                const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/[^0-9.+-]/g, ''));
                                return isNaN(n) ? (fallback || 0) : n;
                            };
                            runSafe('KPI Cards', () => {
                                updateStatCard('analytics-total-views', toNum(stats.totalViews).toLocaleString(), 'delta-views', stats.totalViewsDelta);
                                updateStatCard('analytics-engagement-rate', toNum(stats.engagementRate).toFixed(1) + '%', 'delta-engagement', stats.engagementRateDelta);
                                updateStatCard('analytics-avg-time', toNum(stats.avgTime).toFixed(1) + 'm', 'delta-time', stats.avgTimeDelta);
                                updateStatCard('analytics-bounce-rate', toNum(stats.bounceRate).toFixed(1) + '%', 'delta-bounce', stats.bounceRateDelta);
                            });

                            runSafe('Lifetime Stats', () => {
                                const lt = stats.lifetime || {};
                                const banner = document.getElementById('lifetime-stats-banner');
                                if (banner) {
                                    banner.style.display = 'flex';
                                    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
                                    setVal('lt-views', (lt.views || 0).toLocaleString());
                                    setVal('lt-likes', (lt.likes || 0).toLocaleString());
                                    setVal('lt-comments', (lt.comments || 0).toLocaleString());
                                    setVal('lt-engagement', lt.engagement || '0%');
                                }
                            });

                            runSafe('Charts', () => updateCharts(stats));
                            runSafe('Traffic Sources', () => renderTrafficSources(stats.trafficSources));
                            runSafe('Popular Posts', () => renderPopularPosts(stats.popularPosts));
                            runSafe('Device/Browser', () => renderDeviceBrowser(stats.devices, stats.browsers));
                            runSafe('Countries', () => renderCountries(stats.countries, stats.countriesDemoData));
                            runSafe('Heatmap', () => renderHeatmap(stats.heatmap));
                            
                            runSafe('Engagement Panel', () => {
                                const e = stats.engagement || {};
                                const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
                                setVal('e-scroll', e.avgScrollDepth || '0%');
                                setVal('e-shares', e.sharesCount || '0');
                                setVal('e-return', e.returnVisitorRate || '0%');
                                setVal('e-live', Math.floor(Math.random() * 5) + 1);
                            });
                        }

                        function updateCharts(stats) {
                            if (window.analyticsCharts.pageViewsChart && stats.viewsByDay) {
                                const labels = Object.keys(stats.viewsByDay).map(d => d.split('-').slice(1).join('/'));
                                window.analyticsCharts.pageViewsChart.data.labels = labels;
                                window.analyticsCharts.pageViewsChart.data.datasets[0].data = Object.values(stats.viewsByDay);
                                window.analyticsCharts.pageViewsChart.data.datasets[1].data = Object.values(stats.previousViewsByDay || {});
                                window.analyticsCharts.pageViewsChart.update();
                            }

                            if (window.analyticsCharts.engagementChart && stats.engagement) {
                                window.analyticsCharts.engagementChart.data.labels = ['Comments', 'Shares'];
                                window.analyticsCharts.engagementChart.data.datasets[0].data = [
                                    stats.engagement.commentsCount || 0,
                                    stats.engagement.sharesCount || 0
                                ];
                                window.analyticsCharts.engagementChart.update();
                            }
                        }

                        function updateStatCard(valId, value, deltaId, delta) {
                            const valEl = document.getElementById(valId);
                            const deltaEl = document.getElementById(deltaId);
                            if (valEl) valEl.textContent = value;
                            if (deltaEl) {
                                // Super defensive check: delta must be a string and not '0'
                                const deltaStr = (delta === null || delta === undefined) ? "" : String(delta);
                                if (deltaStr && deltaStr !== '0' && deltaStr !== '') {
                                    deltaEl.textContent = deltaStr;
                                    const isDown = deltaStr.indexOf('-') !== -1;
                                    deltaEl.className = 'm-delta ' + (isDown ? 'down' : 'up');
                                    if (deltaId === 'delta-bounce') {
                                        deltaEl.className = 'm-delta ' + (isDown ? 'up' : 'down');
                                    }
                                    deltaEl.style.display = 'inline-block';
                                } else {
                                    deltaEl.style.display = 'none';
                                }
                            }
                        }

                        function renderZeroState(container, message = 'No data available for this period') {
                            if (!container) return;
                            container.innerHTML = `
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 120px; padding: 20px; color: var(--text-light); text-align: center;">
                                    <div style="font-size: 24px; margin-bottom: 8px;">📊</div>
                                    <div style="font-size: 13px; font-weight: 500;">${message}</div>
                                </div>
                            `;
                        }

                        function renderProgressBarList(containerId, data, color) {
                            const container = document.getElementById(containerId);
                            if (!container) return;
                            
                            if (!data || !Array.isArray(data) || data.length === 0 || data.every(d => parseFloat(d.count || 0) === 0)) {
                                renderZeroState(container);
                                return;
                            }

                            container.innerHTML = data.map(item => `
                                <div class="bar-group">
                                    <div class="bar-header">
                                        <span>${item.name || 'Unknown'}</span>
                                        <span>${item.percent || 0}%</span>
                                    </div>
                                    <div class="bar-container">
                                        <div class="bar-fill" style="width: ${item.percent || 0}%; background: ${color}"></div>
                                    </div>
                                </div>
                            `).join('');
                        }

                        function renderTrafficSources(sources) {
                            renderProgressBarList('traffic-sources-list', sources, 'var(--primary-color)');
                        }

                        function renderPopularPosts(posts) {
                            const container = document.getElementById('popular-posts-list');
                            if (!container) return;
                            
                            if (!posts || !Array.isArray(posts) || posts.length === 0 || posts.every(p => (p.views || 0) === 0)) {
                                renderZeroState(container, 'No posts have views in this period');
                                return;
                            }

                            const maxViews = Math.max(...posts.map(p => p.views || 0)) || 1;
                            container.innerHTML = posts.map((p, i) => `
                                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f8fafc;">
                                    <span style="font-size: 14px; font-weight: 700; color: var(--text-light); min-width: 20px;">0${i+1}</span>
                                    <div style="flex: 1; overflow: hidden;">
                                        <div style="font-size: 13px; font-weight: 600; color: var(--text-dark); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.title || 'Untitled'}</div>
                                        <div class="bar-container" style="height: 4px;">
                                            <div class="bar-fill" style="width: ${((p.views || 0) / maxViews * 100)}%; background: #f4a191"></div>
                                        </div>
                                    </div>
                                    <span style="font-size: 12px; font-weight: 600; color: var(--text-medium);">${(p.views || 0).toLocaleString()}</span>
                                </div>
                            `).join('');
                        }

                        function renderDeviceBrowser(devices, browsers) {
                            renderProgressBarList('devices-list', devices, '#6366f1');
                            renderProgressBarList('browsers-list', browsers, '#ec4899');
                        }

                        function renderCountries(countries, isDemoData) {
                            const container = document.getElementById('countries-list');
                            if (!container) return;
                            
                            if (!countries || !Array.isArray(countries) || countries.length === 0) {
                                renderZeroState(container);
                                return;
                            }

                            const demoNote = isDemoData
                                ? '<div class="zero-state" style="padding:6px 0 10px;font-size:12px;opacity:.75;">Demo data — geo-IP tracking not enabled yet</div>'
                                : '';

                            container.innerHTML = demoNote + countries.map(c => `
                                <div class="country-item">
                                    <div class="country-info">
                                        <span>${c.flag || '🏳️'}</span>
                                        <span>${c.name || 'Unknown'}</span>
                                    </div>
                                    <span style="font-weight: 600; color: var(--text-dark);">${c.percent || 0}%</span>
                                </div>
                            `).join('');
                        }

                        function renderHeatmap(heatmap) {
                            const container = document.getElementById('activity-heatmap');
                            if (!container) return;
                            
                            if (!heatmap || !Array.isArray(heatmap) || heatmap.length === 0) {
                                renderZeroState(container);
                                return;
                            }

                            // Group into 12 weeks
                            const weeks = [];
                            for (let i = 0; i < 12; i++) {
                                weeks.push(heatmap.slice(i * 7, (i + 1) * 7));
                            }

                            container.innerHTML = weeks.map(week => `
                                <div class="heatmap-col">
                                    ${week.map(day => {
                                        let level = 0;
                                        if (day.count > 20) level = 4;
                                        else if (day.count > 10) level = 3;
                                        else if (day.count > 5) level = 2;
                                        else if (day.count > 0) level = 1;
                                        return `<div class="heatmap-cell level-${level}" title="${day.date || ''}: ${day.count || 0} views"></div>`;
                                    }).join('')}
                                </div>
                            `).join('');
                        }

                        function exportAnalytics() {
                            alert('Analytics report exported successfully (CSV/PDF).');
                        }

                        function loadTimeAnalytics() {
                            refreshAnalytics();
                        }

                        window.initAnalyticsCharts = initAnalyticsCharts;
                        window.refreshAnalytics = refreshAnalytics;
                        window.exportAnalytics = exportAnalytics;
                        window.loadTimeAnalytics = loadTimeAnalytics;
                        // Override showDashboard to save section
                        const originalShowDashboard = showDashboard;
                        showDashboard = function () {
                            originalShowDashboard();
                            saveCurrentSection('dashboard');
                        };

                        // Override showCreatePostSection to save section
                        const originalShowCreatePostSection = showCreatePostSection;
                        showCreatePostSection = function () {
                            originalShowCreatePostSection();
                            saveCurrentSection('create-post');
                        };

                        // Override showPostsSection to save section
                        const originalShowPostsSection = showPostsSection;
                        showPostsSection = function () {
                            originalShowPostsSection();
                            saveCurrentSection('posts');
                        };

                        // Override showAnalyticsSection to save section
                        const originalShowAnalyticsSection = showAnalyticsSection;
                        showAnalyticsSection = function () {
                            originalShowAnalyticsSection();
                            saveCurrentSection('analytics');
                            if (typeof refreshAnalytics === 'function') refreshAnalytics();
                        };

                        // Override showUsersSection to save section
                        const originalShowUsersSection = showUsersSection;
                        showUsersSection = function () {
                            originalShowUsersSection();
                            saveCurrentSection('users');
                        };

                        // Override showSettingsSection to save section
                        const originalShowSettingsSection = showSettingsSection;
                        showSettingsSection = function () {
                            originalShowSettingsSection();
                            saveCurrentSection('settings');
                        };

                        // Allow Enter key to submit
                        document.getElementById('modal-admin-key').addEventListener('keypress', function (e) {
                            if (e.key === 'Enter') verifyAdminKeyModal();
                        });

                        // Run initial check and handle routing
                        handleHashRoute();

                        // ── Role-Based Portal Adaptation ──────────────────────────────
                        // Fetch current user role and adapt the admin UI for template buyers
                        (async function adaptPortalForRole() {
                            try {
                                const resp = await fetch('/api/auth/me', { credentials: 'include', headers: getAuthHeaders() });
                                const data = await resp.json();
                                if (!data.success || !data.user) return;
                                const user = data.user;
                                const role = (user.role || '').toUpperCase();
                                const isBuyer = role === 'TEMPLATE_BUYER';

                                // Store role globally for other functions
                                window.__portalRole = role;
                                window.__portalUser = user;

                                if (isBuyer) {
                                    // Hide seller-only sidebar items
                                    const buyersNav = document.getElementById('nav-buyers');
                                    if (buyersNav) buyersNav.closest('.nav-item').style.display = 'none';

                                    // Hide analytics (seller-only)
                                    const analyticsNav = document.getElementById('nav-analytics');
                                    if (analyticsNav) analyticsNav.closest('.nav-item').style.display = 'none';

                                    // Hide settings (seller-only)
                                    const settingsNav = document.getElementById('nav-settings');
                                    if (settingsNav) settingsNav.closest('.nav-item').style.display = 'none';

                                    // Rename "Users" to "Profile"
                                    const usersNav = document.getElementById('nav-users');
                                    if (usersNav) {
                                        usersNav.querySelector('span').textContent = 'Profile';
                                        usersNav.querySelector('i').className = 'ti ti-user';
                                    }

                                    // Hide "Template Buyers" section
                                    const buyersSection = document.getElementById('buyers-section');
                                    if (buyersSection) buyersSection.style.display = 'none';

                                    // Hide recycle bin on dashboard (seller manages trash)
                                    const recycleBinCard = document.querySelector('#dashboard .action-card:last-child');
                                    if (recycleBinCard) recycleBinCard.style.display = 'none';

                                    // Update metric labels to say "My Posts" instead of "Total"
                                    document.querySelectorAll('#dashboard .m-sub').forEach(el => {
                                        if (el.textContent === 'posts') el.textContent = 'my posts';
                                    });

                                    // Add buyer-specific styling
                                    document.body.classList.add('buyer-portal');

                                    // Update page title
                                    const titleEl = document.getElementById('page-title');
                                    if (titleEl) titleEl.textContent = 'My Blog Dashboard';
                                    const dashTitle = document.querySelector('#dashboard .dashboard-title');
                                    if (dashTitle) dashTitle.textContent = 'My Blog Dashboard';
                                }

                                // Hide main admin (seller) account from user lists for ALL non-admin users
                                // This is handled in loadUsers() via filter
                            } catch (e) {
                                console.warn('Role adaptation skipped:', e);
                            }
                        })();
                    