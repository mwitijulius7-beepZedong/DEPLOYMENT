
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
            const sections = ['dashboard', 'posts-section', 'users-section', 'analytics-section', 'create-post-section', 'settings-section', 'buyers-section', 'domains-section'];
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
                    listEl.innerHTML = data.buyers.map(b => {
                        const domainRows = (b.domains || []).map(d => {
                            const statusColor = d.status === 'active' ? '#15803d' : d.status === 'failed' ? '#dc2626' : '#b45309';
                            return `
                                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px;">
                                    <a href="${escapeDomainHtml(d.url)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:600;color:#4338ca;word-break:break-all;">${escapeDomainHtml(d.hostname)}</a>
                                    <span style="font-size:10px;background:#eef2ff;color:#4338ca;padding:2px 6px;border-radius:4px;">${d.type === 'platform' ? 'Platform' : 'Custom'}</span>
                                    ${d.isPrimary ? '<span style="font-size:10px;background:#e0e7ff;color:#4338ca;padding:2px 6px;border-radius:4px;">PRIMARY</span>' : ''}
                                    <span style="font-size:10px;color:${statusColor};padding:2px 6px;border-radius:4px;border:1px solid var(--border-color);text-transform:capitalize;">${escapeDomainHtml(d.status)}</span>
                                    ${d.sslStatus ? `<span style="font-size:10px;color:var(--text-medium);">SSL: ${escapeDomainHtml(d.sslStatus)}</span>` : ''}
                                </div>
                            `;
                        }).join('');
                        const noDomains = '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">No blog or domain provisioned yet.</div>';
                        const suspended = b.tenantStatus && b.tenantStatus !== 'active'
                            ? `<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:2px 6px;border-radius:4px;margin-left:6px;">BLOG ${escapeDomainHtml(String(b.tenantStatus).toUpperCase())}</span>`
                            : '';
                        return `
                            <div style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; background: #fff;">
                                <div>
                                    <strong style="color: var(--text-dark);">${escapeDomainHtml(b.name)}</strong> <span style="font-size: 12px; color: var(--text-medium);">(${escapeDomainHtml(b.email)})</span>${suspended}<br>
                                    <span style="font-size: 11px; background: #e0e7ff; color: #4f46e5; padding: 2px 6px; border-radius: 4px; font-family: monospace;">Key: ${escapeDomainHtml(b.licenseKey)}</span>
                                    <span style="font-size: 11px; color: var(--text-light); margin-left: 8px;">Purchased: ${b.purchaseDate ? new Date(b.purchaseDate).toLocaleDateString() : '—'}</span>
                                    <div style="margin-top:8px;">
                                        <div style="font-size:11px;font-weight:600;color:var(--text-medium);">Domains</div>
                                        ${domainRows || noDomains}
                                    </div>
                                </div>
                                <button onclick="deleteBuyer('${b.id}')" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer; flex-shrink:0;">Remove</button>
                            </div>
                        `;
                    }).join('');
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

        // ── MY DOMAINS (template buyers) ──────────────────────────────
        function escapeDomainHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function showDomainsSection() {
            showSection('domains-section', 'My Domains', 'showDomainsSection');
            if (typeof loadDomains === 'function') loadDomains();
        }

        async function loadDomains() {
            const listEl = document.getElementById('domains-list');
            if (!listEl) return;
            try {
                const response = await apiFetch('/api/tenant/domains');
                const data = await response.json();
                if (!response.ok || !data.success) {
                    listEl.innerHTML = `<div style="padding:12px;color:#dc2626;font-size:13px;">${escapeDomainHtml(data.message || data.error || 'Could not load domains.')}</div>`;
                    return;
                }
                if (!data.domains || data.domains.length === 0) {
                    listEl.innerHTML = '<div style="padding:12px;color:var(--text-medium);font-size:13px;">No domains yet.</div>';
                    return;
                }
                listEl.innerHTML = data.domains.map(domain => {
                    const status = String(domain.status || 'pending');
                    const badgeColor = status === 'active' ? '#15803d' : status === 'failed' ? '#dc2626' : '#b45309';
                    const badgeBg = status === 'active' ? '#dcfce7' : status === 'failed' ? '#fee2e2' : '#fef3c7';
                    const isPlatform = domain.type === 'platform';
                    let sslBadge = '';
                    if (!isPlatform && (domain.sslStatus || domain.sslError || (domain.sslValidationErrors || []).length)) {
                        const sslTrouble = Boolean(domain.sslError) || (domain.sslValidationErrors || []).length > 0;
                        const sslActive = String(domain.sslStatus || '').toLowerCase() === 'active';
                        const sslColor = sslTrouble ? '#b45309' : sslActive ? '#15803d' : '#b45309';
                        const sslBg = sslTrouble ? '#fef3c7' : sslActive ? '#dcfce7' : '#fef3c7';
                        const sslLabel = sslTrouble ? 'SSL attention' : sslActive ? 'SSL active' : 'SSL pending';
                        sslBadge = `<span title="${escapeDomainHtml(domain.sslError || (domain.sslValidationErrors || [])[0] || domain.sslStatus || '')}" style="background:${sslBg};color:${sslColor};padding:1px 6px;border-radius:4px;margin-left:4px;">${sslLabel}</span>`;
                    }
                    const actions = [
                        !isPlatform && status !== 'active'
                            ? `<button onclick="verifyDomain('${domain.id}')" style="background:#e0e7ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;margin-right:6px;"><i class="ti ti-refresh"></i> Verify DNS</button>`
                            : '',
                        status === 'active' && !domain.isPrimary
                            ? `<button onclick="makeDomainPrimary('${domain.id}')" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;margin-right:6px;"><i class="ti ti-star"></i> Make primary</button>`
                            : '',
                        !isPlatform
                            ? `<button onclick="removeDomain('${domain.id}')" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;"><i class="ti ti-trash"></i> Remove</button>`
                            : '',
                        !isPlatform && domain.instructions
                            ? `<button onclick="showDomainInstructions('${domain.id}')" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;margin-left:6px;"><i class="ti ti-dns"></i> DNS</button>`
                            : ''
                    ].join('');
                    return `
                        <div style="padding:12px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;background:#fff;">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
                                <div>
                                    <strong style="color:var(--text-dark);word-break:break-all;">${escapeDomainHtml(domain.hostname)}</strong>
                                    ${domain.isPrimary ? '<span style="font-size:10px;background:#e0e7ff;color:#4338ca;padding:2px 6px;border-radius:4px;margin-left:6px;">PRIMARY</span>' : ''}
                                    <div style="font-size:11px;color:var(--text-light);margin-top:4px;">
                                        ${isPlatform ? 'Platform address' : 'Custom domain'}
                                        · <span style="background:${badgeBg};color:${badgeColor};padding:1px 6px;border-radius:4px;text-transform:capitalize;">${escapeDomainHtml(status)}</span>
                                        ${sslBadge}
                                        ${domain.verifiedAt ? ` · verified ${new Date(domain.verifiedAt).toLocaleDateString()}` : ''}
                                        ${domain.sslStatus && !sslBadge ? ` · SSL: ${escapeDomainHtml(domain.sslStatus)}` : ''}
                                    </div>
                                </div>
                                <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">${actions}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                window.__tenantDomains = data.domains;
            } catch (err) {
                listEl.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:13px;">Error loading domains.</div>';
            }
        }

        async function addCustomDomain() {
            const input = document.getElementById('new-domain-hostname');
            const message = document.getElementById('domain-form-message');
            const hostname = (input?.value || '').trim();
            if (!hostname) return;
            if (message) message.textContent = 'Connecting...';
            try {
                const response = await apiFetch('/api/tenant/domains', {
                    method: 'POST',
                    body: JSON.stringify({ hostname })
                });
                const data = await response.json();
                if (!response.ok || !data.success) {
                    if (message) message.textContent = data.message || 'Could not connect that domain.';
                    return;
                }
                if (input) input.value = '';
                if (message) message.textContent = 'Domain added. Add the DNS records below, then click Verify DNS.';
                await loadDomains();
                if (data.domain) renderDomainInstructions(data.domain, data.instructions);
            } catch (err) {
                if (message) message.textContent = 'Network error. Please try again.';
            }
        }

        async function verifyDomain(id) {
            try {
                const response = await apiFetch(`/api/tenant/domains/${encodeURIComponent(id)}/verify`, { method: 'POST' });
                const data = await response.json();
                if (response.ok && (data.verified || data.domain?.status === 'active')) {
                    alert('Domain verified. HTTPS will be issued automatically once DNS propagates.');
                } else if (response.status === 429) {
                    alert('Too many verification attempts. Please wait a few minutes.');
                } else {
                    const check = data.check || {};
                    const diagnostics = Array.isArray(check.diagnostics) && check.diagnostics.length
                        ? check.diagnostics
                        : [
                            check.txtOk === false ? 'TXT record not found yet.' : '',
                            (check.cnameOk === false && check.aOk === false) ? 'CNAME/A record not pointing here yet.' : ''
                        ].filter(Boolean);
                    const heading = check.status === 'mismatch'
                        ? 'DNS points somewhere else. Update the records below.'
                        : 'DNS is still propagating.';
                    alert((data.message || heading) + (diagnostics.length ? '\n\n- ' + diagnostics.join('\n- ') : ''));
                }
                await loadDomains();
            } catch (err) {
                alert('Network error while verifying the domain.');
            }
        }

        async function makeDomainPrimary(id) {
            try {
                const response = await apiFetch(`/api/tenant/domains/${encodeURIComponent(id)}/primary`, { method: 'POST' });
                const data = await response.json();
                if (!response.ok || !data.success) {
                    alert(data.message || 'Could not change the primary domain.');
                    return;
                }
                await loadDomains();
            } catch (err) {
                alert('Network error.');
            }
        }

        async function removeDomain(id) {
            if (!confirm('Disconnect this domain? Your blog will stay available on its platform address.')) return;
            try {
                const response = await apiFetch(`/api/tenant/domains/${encodeURIComponent(id)}`, { method: 'DELETE' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) {
                    alert(data.message || 'Could not remove the domain.');
                    return;
                }
                await loadDomains();
            } catch (err) {
                alert('Network error.');
            }
        }

        function showDomainInstructions(id) {
            const domains = window.__tenantDomains || [];
            const domain = domains.find(d => String(d.id) === String(id));
            if (domain) renderDomainInstructions(domain, domain.instructions);
        }

        function renderDomainInstructions(domain, instructions) {
            const card = document.getElementById('domain-instructions-card');
            const container = document.getElementById('domain-instructions');
            if (!card || !container || !domain) return;
            const records = (instructions && instructions.records) || [];
            const rows = records.filter(record => record.required).map(record => `
                <tr>
                    <td style="padding:8px;border-bottom:1px solid var(--border-color);font-family:monospace;">${escapeDomainHtml(record.type)}</td>
                    <td style="padding:8px;border-bottom:1px solid var(--border-color);font-family:monospace;word-break:break-all;">${escapeDomainHtml(record.name)}</td>
                    <td style="padding:8px;border-bottom:1px solid var(--border-color);font-family:monospace;word-break:break-all;">${escapeDomainHtml(record.value)}</td>
                </tr>
            `).join('');
            const optional = records.filter(record => !record.required).map(record => `
                <tr style="opacity:0.7;">
                    <td style="padding:8px;font-family:monospace;">${escapeDomainHtml(record.type)}</td>
                    <td style="padding:8px;font-family:monospace;word-break:break-all;">${escapeDomainHtml(record.name)}</td>
                    <td style="padding:8px;font-family:monospace;word-break:break-all;">${escapeDomainHtml(record.value)}</td>
                </tr>
            `).join('');
            container.innerHTML = `
                <p style="font-size:13px;color:var(--text-medium);margin:0 0 10px;">
                    Add these records at your DNS provider for <strong>${escapeDomainHtml(domain.hostname)}</strong>, then click Verify DNS. Propagation can take a few minutes.
                </p>
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead>
                        <tr style="text-align:left;color:var(--text-medium);">
                            <th style="padding:8px;border-bottom:1px solid var(--border-color);">Type</th>
                            <th style="padding:8px;border-bottom:1px solid var(--border-color);">Name</th>
                            <th style="padding:8px;border-bottom:1px solid var(--border-color);">Value</th>
                        </tr>
                    </thead>
                    <tbody>${rows}${optional}</tbody>
                </table>
                <ul style="font-size:12px;color:var(--text-light);margin:10px 0 0;padding-left:18px;">
                    <li>Remove any existing <strong>AAAA</strong> records for this hostname. IPv6 clients would bypass the platform and fail unless IPv6 is configured.</li>
                    <li>If you publish <strong>CAA</strong> records, allow your certificate authority (for example <code>letsencrypt.org</code>) so HTTPS can be issued.</li>
                </ul>
            `;
            card.style.display = 'block';
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
                        <div class="category-item" data-category-row="${category.id}" data-original-name="${escapeDomainHtml(category.name)}" data-original-description="${escapeDomainHtml(category.description || '')}" style="padding: 10px; border: 1px solid var(--border-color); border-radius: 10px; background: #fff; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; transition: all 0.2s ease;">
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                                <input type="checkbox" class="category-checkbox" data-category-id="${category.id}" onchange="updateSelectedCategoriesCount()" style="width: 14px; height: 14px; cursor: pointer;">
                                <div class="category-view" style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                                    <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeDomainHtml(category.name)}</h4>
                                    <p style="margin: 0; font-size: 11px; color: var(--text-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeDomainHtml(category.description || 'No description provided')}</p>
                                </div>
                                <div class="category-editor" style="display: none; flex-direction: column; gap: 6px; flex: 1; min-width: 0;">
                                    <input type="text" class="category-edit-name" value="${escapeDomainHtml(category.name)}" placeholder="Category name" aria-label="Category name" style="padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 12px; font-family: var(--sans);">
                                    <input type="text" class="category-edit-description" value="${escapeDomainHtml(category.description || '')}" placeholder="Description (optional)" aria-label="Category description" style="padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 12px; font-family: var(--sans);">
                                </div>
                            </div>
                            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                                <button class="btn-modern sm secondary category-edit-action" style="padding: 4px 8px; font-size: 11px;" onclick="editCategory('${category.id}', this)">Edit</button>
                                <button class="btn-modern sm category-save-action" style="display: none; padding: 4px 8px; font-size: 11px;" onclick="saveCategory('${category.id}', this)">Save</button>
                                <button class="btn-modern sm secondary category-cancel-action" style="display: none; padding: 4px 8px; font-size: 11px;" onclick="cancelCategory('${category.id}')">Cancel</button>
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

        function setCategoryEditMode(categoryId, editing) {
            const row = document.querySelector(`[data-category-row="${categoryId}"]`);
            if (!row) return null;
            const view = row.querySelector('.category-view');
            const editor = row.querySelector('.category-editor');
            if (!view || !editor) return null;
            view.style.display = editing ? 'none' : 'flex';
            editor.style.display = editing ? 'flex' : 'none';
            row.querySelector('.category-edit-action').style.display = editing ? 'none' : '';
            row.querySelector('.category-save-action').style.display = editing ? '' : 'none';
            row.querySelector('.category-cancel-action').style.display = editing ? '' : 'none';
            return editor;
        }

        function editCategory(categoryId) {
            const editor = setCategoryEditMode(categoryId, true);
            if (!editor) return;
            const nameInput = editor.querySelector('.category-edit-name');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        }

        function cancelCategory(categoryId) {
            const row = document.querySelector(`[data-category-row="${categoryId}"]`);
            const editor = setCategoryEditMode(categoryId, false);
            if (!row || !editor) return;
            editor.querySelector('.category-edit-name').value = row.dataset.originalName || '';
            editor.querySelector('.category-edit-description').value = row.dataset.originalDescription || '';
        }

        async function saveCategory(categoryId, button) {
            const editor = setCategoryEditMode(categoryId, true);
            if (!editor) return;
            const nameInput = editor.querySelector('.category-edit-name');
            const descriptionInput = editor.querySelector('.category-edit-description');
            const name = nameInput.value.trim();

            if (!name) {
                alert('Please enter a category name.');
                nameInput.focus();
                return;
            }

            await withLoading(button, async () => {
                try {
                    const response = await apiFetch(`/api/categories/${encodeURIComponent(categoryId)}`, {
                        method: 'PUT',
                        body: JSON.stringify({ name, description: descriptionInput.value.trim() })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        await loadCategories();
                        if (typeof populatePostCategoryDropdown === 'function') {
                            await populatePostCategoryDropdown();
                        }
                    } else {
                        const errorMessage = data.details || data.error || data.message || 'Failed to update category.';
                        alert(`Error: ${errorMessage}`);
                    }
                } catch (error) {
                    console.error('Error updating category:', error);
                    alert('Network error: Failed to update category.');
                }
            }, 'Saving...');
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

                const toLocalInput = (iso) => {
                    if (!iso) return '';
                    const d = new Date(iso);
                    if (!Number.isFinite(d.getTime())) return '';
                    const pad = n => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                };
                document.getElementById('post-date').value = toLocalInput(post.date);
                document.getElementById('post-expiry').value = toLocalInput(post.expiryDate);
                document.getElementById('post-premium').checked = !!post.isPremium;
                document.getElementById('post-seo-description').value = post.seoDescription || '';
                document.getElementById('post-seo-image').value = post.seoImage || '';
                const previewStatus = document.getElementById('preview-link-status');
                if (previewStatus) previewStatus.textContent = post.previewToken ? 'Preview link available via “Draft link”.' : '';

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
            const bulkCategory = document.getElementById('bulk-category-select');
            const bulkTags = document.getElementById('bulk-tags-input');
            const bulkApply = document.getElementById('apply-bulk-btn');

            if (deleteButton) deleteButton.style.display = checkedCount > 0 ? 'inline-block' : 'none';
            if (countSpan) countSpan.textContent = checkedCount;

            const visible = checkedCount > 0 ? 'inline-block' : 'none';
            if (bulkCategory) bulkCategory.style.display = visible;
            if (bulkTags) bulkTags.style.display = visible;
            if (bulkApply) bulkApply.style.display = visible;

            if (checkedCount > 0) populateBulkCategorySelect();
        }

        let bulkCategoriesLoaded = false;
        async function populateBulkCategorySelect() {
            if (bulkCategoriesLoaded) return;
            const select = document.getElementById('bulk-category-select');
            if (!select) return;
            try {
                const response = await apiFetch('/api/categories');
                const data = await response.json();
                const categories = (data.categories || []).map(cat =>
                    `<option value="${cat.id}">${cat.name}</option>`
                ).join('');
                select.innerHTML = '<option value="">Category: unchanged</option>' + categories;
                bulkCategoriesLoaded = true;
            } catch (err) {
                console.error('Failed to load bulk categories:', err);
            }
        }

        async function applyBulkEdits() {
            const selectedIds = Array.from(document.querySelectorAll('.post-checkbox:checked'))
                .map(cb => cb.getAttribute('data-post-id'));
            if (selectedIds.length === 0) return;

            const categoryId = document.getElementById('bulk-category-select').value;
            const tagsRaw = document.getElementById('bulk-tags-input').value.trim();
            const addTags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

            if (!categoryId && addTags.length === 0) {
                alert('Choose a category or enter tags to apply.');
                return;
            }

            const updateBtn = document.getElementById('apply-bulk-btn');
            if (updateBtn.disabled) return;
            updateBtn.disabled = true;
            const originalLabel = updateBtn.textContent;
            updateBtn.textContent = 'Applying…';

            let successCount = 0;
            for (const postId of selectedIds) {
                try {
                    const getResp = await apiFetch(`/api/posts/${postId}`);
                    const getData = await getResp.json();
                    if (!getResp.ok || !getData.post) continue;

                    const post = getData.post;
                    const mergedTags = Array.from(new Set([
                        ...(Array.isArray(post.tags) ? post.tags : []),
                        ...addTags
                    ]));

                    const payload = {
                        title: post.title,
                        subtitle: post.subtitle || '',
                        content: post.content,
                        tags: mergedTags,
                        image: post.image || '',
                        video: post.video || '',
                        images: Array.isArray(post.images) ? post.images : [],
                        isDraft: !!post.isDraft,
                        categoryId: categoryId || post.categoryId || '',
                        fontFamily: post.fontFamily || '',
                        pullQuote: post.pullQuote || '',
                        sceneCard: post.sceneCard || '',
                        closingBox: post.closingBox || '',
                        seoDescription: post.seoDescription || '',
                        seoImage: post.seoImage || '',
                        expiryDate: post.expiryDate || '',
                        isPremium: !!post.isPremium
                    };

                    const putResp = await apiFetch(`/api/posts/${postId}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload)
                    });
                    if (putResp.ok) successCount++;
                } catch (err) {
                    console.error('Bulk update failed for', postId, err);
                }
            }

            updateBtn.disabled = false;
            updateBtn.textContent = originalLabel;
            document.getElementById('bulk-tags-input').value = '';
            document.getElementById('bulk-category-select').value = '';
            alert(`Updated ${successCount} of ${selectedIds.length} post(s).`);
            loadPostsList();
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
                    const dateInput = document.getElementById('post-date').value;
                    const expiryInput = document.getElementById('post-expiry').value;
                    const isPremium = document.getElementById('post-premium').checked;
                    const seoDescription = document.getElementById('post-seo-description').value.trim();
                    const seoImage = document.getElementById('post-seo-image').value.trim();

                    const postData = {
                        title, subtitle, content,
                        tags: tags.split(',').map(t => t.trim()).filter(t => t),
                        image: imageUrl, video: videoUrl, images: galleryImages,
                        isDraft: status === 'draft',
                        categoryId: category || null,
                        fontFamily: fontFamily || '',
                        pullQuote: pullQuote || '',
                        sceneCard: sceneCard || '',
                        closingBox: closingBox || '',
                        isPremium: isPremium,
                        seoDescription: seoDescription,
                        seoImage: seoImage,
                        expiryDate: expiryInput ? new Date(expiryInput).toISOString() : ''
                    };
                    if (dateInput) {
                        postData.date = new Date(dateInput).toISOString();
                    }

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

        async function generatePreviewLink() {
            const postId = document.getElementById('edit-post-id').value;
            const status = document.getElementById('preview-link-status');
            if (!postId) {
                alert('Save the draft first, then generate a preview link.');
                return;
            }
            status.textContent = 'Generating…';
            try {
                const response = await apiFetch(`/api/posts/${postId}/preview-token`, { method: 'POST' });
                const data = await response.json();
                if (!response.ok || !data.url) {
                    status.textContent = '';
                    alert('Failed to generate preview link: ' + ((data && data.error) || 'Unknown error'));
                    return;
                }
                status.innerHTML = `Preview: <a href="${data.url}" target="_blank" rel="noopener" style="color:#534AB7;">${data.url}</a>`;
                try {
                    await navigator.clipboard.writeText(data.url);
                    status.insertAdjacentText('beforeend', ' (copied)');
                } catch (e) { /* clipboard may be unavailable */ }
            } catch (err) {
                console.error('Preview link error:', err);
                status.textContent = '';
                alert('Network error generating preview link.');
            }
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
            document.getElementById('post-date').value = '';
            document.getElementById('post-expiry').value = '';
            document.getElementById('post-premium').checked = false;
            document.getElementById('post-seo-description').value = '';
            document.getElementById('post-seo-image').value = '';
            const previewStatus = document.getElementById('preview-link-status');
            if (previewStatus) previewStatus.textContent = '';

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


        const ABOUT_EDITOR_CONFIG = {
            point: {
                container: 'about-mission-points-editor',
                fields: [{ key: 'text', placeholder: 'Mission point' }]
            },
            skill: {
                container: 'about-skills-editor',
                fields: [
                    { key: 'title', placeholder: 'Skill title' },
                    { key: 'description', placeholder: 'Skill description', multiline: true }
                ]
            },
            timeline: {
                container: 'about-timeline-editor',
                fields: [
                    { key: 'period', placeholder: 'Period, e.g. December 2024 — Present' },
                    { key: 'title', placeholder: 'Role or milestone' },
                    { key: 'description', placeholder: 'What you did', multiline: true }
                ]
            },
            currently: {
                container: 'about-currently-editor',
                fields: [
                    { key: 'label', placeholder: 'Label, e.g. Working on' },
                    { key: 'text', placeholder: 'Details', multiline: true }
                ]
            }
        };

        function aboutSetValue(id, value) {
            const field = document.getElementById(id);
            if (field) field.value = value || '';
        }

        function aboutCreateField(field, value) {
            const input = document.createElement(field.multiline ? 'textarea' : 'input');
            if (!field.multiline) input.type = 'text';
            input.className = 'form-input' + (field.multiline ? ' form-textarea' : '');
            input.dataset.field = field.key;
            input.placeholder = field.placeholder;
            input.value = value === undefined || value === null ? '' : String(value);
            if (field.multiline) input.style.minHeight = '52px';
            return input;
        }

        function addAboutListItem(kind, values) {
            const config = ABOUT_EDITOR_CONFIG[kind];
            const container = config && document.getElementById(config.container);
            if (!container) return;

            const row = document.createElement('div');
            row.className = 'about-list-row';

            const fields = document.createElement('div');
            fields.className = 'about-list-fields';
            config.fields.forEach(field => {
                fields.appendChild(aboutCreateField(field, values ? values[field.key] : ''));
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'about-list-remove';
            remove.title = 'Remove';
            remove.setAttribute('aria-label', 'Remove item');
            remove.textContent = '\u00d7';
            remove.addEventListener('click', function () { row.remove(); });

            row.appendChild(fields);
            row.appendChild(remove);
            container.appendChild(row);
        }

        function renderAboutEditorRows(kind, items) {
            const config = ABOUT_EDITOR_CONFIG[kind];
            const container = config && document.getElementById(config.container);
            if (!container) return;

            container.replaceChildren();
            (Array.isArray(items) ? items : []).forEach(item => {
                if (kind === 'point') {
                    addAboutListItem(kind, { text: item });
                } else if (item && typeof item === 'object') {
                    addAboutListItem(kind, item);
                }
            });
        }

        function collectAboutEditorRows(kind) {
            const config = ABOUT_EDITOR_CONFIG[kind];
            const container = config && document.getElementById(config.container);
            if (!container) return [];

            return Array.from(container.querySelectorAll('.about-list-row')).map(row => {
                const values = {};
                config.fields.forEach(field => {
                    const input = row.querySelector('[data-field="' + field.key + '"]');
                    values[field.key] = input ? input.value.trim() : '';
                });
                return values;
            });
        }

        function updateAboutProfilePreview(url) {
            const preview = document.getElementById('about-profile-preview');
            if (preview && url) preview.src = url;
        }

        window.addAboutListItem = addAboutListItem;
        window.updateAboutProfilePreview = updateAboutProfilePreview;

        async function loadAboutSettings() {
            console.log('loadAboutSettings called');
            try {
                const [aboutResponse, authorResponse] = await Promise.all([
                    fetch('/api/about'),
                    fetch('/api/settings/author').catch(() => null)
                ]);
                const about = await aboutResponse.json();

                if (about) {
                    const sections = Array.isArray(about.sections) ? about.sections : [];
                    const whoSection = sections.find(s => s.id === 'who-i-am') || {};
                    const missionSection = sections.find(s => s.id === 'mission') || {};
                    const titles = about.titles || {};

                    aboutSetValue('about-hero-title', about.hero?.title);
                    aboutSetValue('about-hero-subtitle', about.hero?.subtitle);
                    aboutSetValue('about-who-content', whoSection.content);
                    aboutSetValue('about-mission-content', missionSection.content);
                    aboutSetValue('about-title-who', whoSection.title);
                    aboutSetValue('about-title-mission', missionSection.title);
                    aboutSetValue('about-title-timeline', titles.timeline);
                    aboutSetValue('about-title-skills', titles.skills);
                    aboutSetValue('about-title-featured', titles.featured);
                    aboutSetValue('about-title-photos', titles.photos);
                    aboutSetValue('about-title-currently', titles.currently);
                    aboutSetValue('about-title-contact', titles.contact);

                    renderAboutEditorRows('point', missionSection.points);
                    renderAboutEditorRows('skill', about.skills);
                    renderAboutEditorRows('timeline', about.timeline);
                    renderAboutEditorRows('currently', about.currently);

                    // Load snapshots
                    window._aboutPhotos = Array.isArray(about.photos) ? about.photos.slice() : [];
                    renderAboutPhotos();
                }

                if (authorResponse && authorResponse.ok) {
                    try {
                        const authorData = await authorResponse.json();
                        const picture = authorData.author?.profilePicture || '';
                        if (picture) window.uploadedProfilePictureUrl = picture;
                        updateAboutProfilePreview(picture);
                    } catch (error) {
                        console.warn('Could not read profile picture:', error);
                    }
                }
            } catch (error) {
                console.error('Error loading about settings:', error);
            }
        }

        async function saveAboutSettings() {
            const getVal = id => document.getElementById(id)?.value || '';
            const aboutData = {
                hero: {
                    title: getVal('about-hero-title'),
                    subtitle: getVal('about-hero-subtitle')
                },
                titles: {
                    timeline: getVal('about-title-timeline'),
                    skills: getVal('about-title-skills'),
                    featured: getVal('about-title-featured'),
                    photos: getVal('about-title-photos'),
                    currently: getVal('about-title-currently'),
                    contact: getVal('about-title-contact')
                },
                sections: [
                    {
                        id: 'who-i-am',
                        title: getVal('about-title-who') || 'Who I Am',
                        content: getVal('about-who-content')
                    },
                    {
                        id: 'mission',
                        title: getVal('about-title-mission') || 'My Mission',
                        content: getVal('about-mission-content'),
                        points: collectAboutEditorRows('point').map(row => row.text).filter(Boolean)
                    }
                ],
                skills: collectAboutEditorRows('skill').filter(skill => skill.title || skill.description),
                timeline: collectAboutEditorRows('timeline').filter(entry => entry.period || entry.title || entry.description),
                currently: collectAboutEditorRows('currently').filter(item => item.label || item.text),
                photos: Array.isArray(window._aboutPhotos) ? window._aboutPhotos : []
            };
            const saveButton = event?.target || document.querySelector('#about-panel .btn-modern');

            await withLoading(saveButton, async () => {
                try {
                    // Blog info and author settings share the same settings store,
                    // so save them sequentially to avoid overwriting each other.
                    const blogResponse = await apiFetch('/api/settings/blog-info', {
                        method: 'POST',
                        body: JSON.stringify({
                            title: getVal('blog-title'),
                            description: getVal('blog-description'),
                            donationUrl: getVal('blog-donation-url')
                        })
                    });

                    // Omit profilePicture unless a photo was chosen in this session so
                    // saving other About fields can never clear the saved portrait.
                    const authorPayload = {
                        name: getVal('author-name'),
                        email: getVal('author-email'),
                        bio: getVal('author-bio'),
                        phone: getVal('author-phone'),
                        whatsapp: getVal('author-whatsapp'),
                        social: {
                            email: getVal('author-social-email'),
                            twitter: getVal('author-twitter'),
                            facebook: getVal('author-facebook'),
                            linkedin: getVal('author-linkedin'),
                            instagram: getVal('author-instagram'),
                            github: getVal('author-github'),
                            website: getVal('author-website')
                        }
                    };

                    if (window.uploadedProfilePictureUrl) {
                        authorPayload.profilePicture = window.uploadedProfilePictureUrl;
                    }

                    const authorResponse = await apiFetch('/api/settings/author', {
                        method: 'POST',
                        body: JSON.stringify(authorPayload)
                    });

                    const aboutResponse = await apiFetch('/api/about', {
                        method: 'POST',
                        body: JSON.stringify(aboutData)
                    });

                    const failed = [];
                    if (!blogResponse.ok) failed.push('blog information');
                    if (!authorResponse.ok) failed.push('author profile');
                    if (!aboutResponse.ok) failed.push('About page');
                    if (failed.length > 0) {
                        alert('Failed to save: ' + failed.join(', ') + '.');
                        return;
                    }

                    const authorData = await authorResponse.json();
                    const blogTitle = getVal('blog-title');
                    const sidebarTitle = document.querySelector('.sidebar-logo .sidebar-logo-title');
                    if (sidebarTitle) sidebarTitle.textContent = blogTitle;
                    document.title = `Admin Panel - ${blogTitle}`;
                    const savedProfilePicture = authorData.author?.profilePicture || '';
                    if (savedProfilePicture) {
                        window.uploadedProfilePictureUrl = savedProfilePicture;
                        updateTopbarAvatar(savedProfilePicture);
                    }
                    alert('About Me settings saved successfully!');
                } catch (error) {
                    console.error('Error saving about settings:', error);
                    alert('Connection error. Failed to save settings.');
                }
            });
        }

        window.loadAboutSettings = loadAboutSettings;
        window.saveAboutSettings = saveAboutSettings;

        // About Me is the default settings panel, so populate it on load.
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', loadAboutSettings);
        } else {
            loadAboutSettings();
        }

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


        async function saveAppearanceSettings() {
            const primaryColor = document.getElementById('primary-color').value;
            const accentColor = document.getElementById('accent-color').value;
            const backgroundColor = document.getElementById('background-color').value;
            const backgroundUrl = document.getElementById('background-url').value;
            const saveButton = event?.target || document.querySelector('#appearance-panel button[onclick="saveAppearanceSettings()"]');

            await withLoading(saveButton, async () => {
                try {
                    const failed = [];

                    // Theme and background share the same settings store,
                    // so save them sequentially to avoid overwriting each other.
                    const themeResponse = await apiFetch('/api/settings/theme', {
                        method: 'POST',
                        body: JSON.stringify({
                            primaryColor,
                            accentColor
                        })
                    });
                    if (!themeResponse.ok) failed.push('theme');

                    if (backgroundUrl) {
                        const backgroundResponse = await apiFetch('/api/settings/background', {
                            method: 'POST',
                            body: JSON.stringify({
                                backgroundUrl: backgroundUrl
                            })
                        });
                        if (!backgroundResponse.ok) failed.push('background');
                    }

                    if (failed.length > 0) {
                        alert('Failed to save: ' + failed.join(', ') + '.');
                        return;
                    }

                    document.documentElement.style.setProperty('--primary-color', primaryColor);
                    document.documentElement.style.setProperty('--accent-color', accentColor);
                    document.body.style.backgroundColor = backgroundColor;
                    if (backgroundUrl) {
                        document.body.style.backgroundImage = `url('${backgroundUrl}')`;
                        document.body.style.backgroundSize = 'cover';
                        document.body.style.backgroundAttachment = 'fixed';
                    }

                    alert('Appearance settings saved successfully!');
                } catch (error) {
                    console.error('Error saving appearance settings:', error);
                    alert('Error saving appearance settings.');
                }
            });
        }

        window.saveAppearanceSettings = saveAppearanceSettings;

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

    