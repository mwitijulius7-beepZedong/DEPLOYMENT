
        let vueRetries = 0;
        const VUE_MAX_RETRIES = 100;

        function initVue() {
            if (typeof Vue === 'undefined') {
                vueRetries++;
                if (vueRetries > VUE_MAX_RETRIES) {
                    document.getElementById('app').style.display = 'block';
                    document.getElementById('app').innerHTML = '<div style="text-align:center;padding:4rem 2rem;color:var(--text-dark);"><h2>Failed to load application</h2><p>Please check your internet connection and refresh the page.</p></div>';
                    return;
                }
                setTimeout(initVue, 50);
                return;
            }

            const { createApp } = Vue;

            createApp({
                data() {
                    return {
                        blogTitle: 'My Personal Blog',
                        posts: [],
                        categories: [],
                        searchQuery: '',
                        selectedCategory: '',
                        selectedTag: '',
                        selectedArchive: '',
                        selectedDate: '',
                        sortBy: 'newest',
                        authorInfo: null,
                        lightboxImg: '',
                        isLightboxOpen: false,
                        loaded: false,
                        theme: (() => { const t = localStorage.getItem('blog_theme'); return (t === 'glass' || t === 'minimal') ? 'light' : (t || 'light'); })(),
                        showSearchSuggestions: false,
                        searchSuggestionIndex: -1,
                        showShortcuts: false,
                        filtersSticky: false,
                        readingModePost: null,
                        showBookmarks: false,
                        currentUserRights: [],
                        // Template modal & checkout
                        showTemplateModal: false,
                        checkoutStep: 'preview', // 'preview', 'payment', 'processing', 'success', 'failed'
                        selectedPaymentMethod: 'mpesa',
                        checkoutPaymentGroupName: 'pay-' + Date.now(),
                        checkoutProcessing: false,
                        checkoutError: '',
                        checkoutLicenseKey: '',
                        checkoutKeyCopied: false,
                        checkoutFormData: {
                            name: '',
                            email: '',
                            phone: '',
                            cardNumber: '',
                            cardExpiry: '',
                            cardCvc: ''
                        },
                    };
                },
                mounted() {
                    this.applyTheme(this.theme);
                    Promise.all([this.loadPosts(), this.loadCategories(), this.loadSettings()])
                        .catch(() => {})
                        .finally(() => { this.loaded = true; });

                    this.checkUserRights();

                    window.addEventListener('scroll', this.onScroll);

                    document.addEventListener('keydown', this.onKeydown);

                    document.addEventListener('mousemove', (e) => {
                        const glow = document.getElementById('cursor-glow');
                        if (glow) {
                            glow.style.left = e.clientX + 'px';
                            glow.style.top = e.clientY + 'px';
                            glow.classList.add('visible');
                        }
                    });
                },
                computed: {
                    filteredPosts() {
                        let filtered = this.posts;

                        if (this.showBookmarks) {
                            const saved = this.getBookmarkedIds();
                            filtered = filtered.filter(post => saved.includes(post.id));
                        }

                        if (this.searchQuery) {
                            const query = this.searchQuery.toLowerCase();
                            filtered = filtered.filter(post =>
                                (post.title || '').toLowerCase().includes(query) ||
                                (post.content || '').toLowerCase().includes(query) ||
                                (this.getTags(post)).some(tag => tag.toLowerCase().includes(query))
                            );
                        }

                        if (this.selectedCategory) {
                            filtered = filtered.filter(post => post.categoryId === this.selectedCategory);
                        }

                        if (this.selectedTag) {
                            filtered = filtered.filter(post => this.getTags(post).includes(this.selectedTag));
                        }

                        if (this.selectedArchive) {
                            const archiveDate = new Date(this.selectedArchive);
                            filtered = filtered.filter(post => {
                                const postDate = new Date(post.date);
                                return postDate.getFullYear() === archiveDate.getFullYear() &&
                                    postDate.getMonth() === archiveDate.getMonth();
                            });
                        }

                        if (this.selectedDate) {
                            filtered = filtered.filter(post => {
                                const pDate = new Date(post.date);
                                const yyyy = pDate.getFullYear();
                                const mm = String(pDate.getMonth() + 1).padStart(2, '0');
                                const dd = String(pDate.getDate()).padStart(2, '0');
                                const formattedPDate = `${yyyy}-${mm}-${dd}`;
                                return formattedPDate === this.selectedDate;
                            });
                        }

                        return filtered;
                    },
                    sortedFilteredPosts() {
                        let filtered = this.filteredPosts;
                        if (this.sortBy === 'oldest') {
                            return [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
                        } else if (this.sortBy === 'popular') {
                            return [...filtered].sort((a, b) => ((b.likes || 0) + (b.dislikes || 0)) - ((a.likes || 0) + (a.dislikes || 0)));
                        }
                        return [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
                    },
                    readingModeNav() {
                        if (!this.readingModePost) return null;
                        // Chronological neighbours, independent of the current sort order
                        const chronology = [...this.posts]
                            .filter(p => !p.isDeleted && !p.isDraft)
                            .sort((a, b) => new Date(a.date) - new Date(b.date));
                        const idx = chronology.findIndex(p => String(p.id) === String(this.readingModePost.id));
                        if (idx === -1) return { older: null, newer: null };
                        return {
                            older: idx > 0 ? chronology[idx - 1] : null,
                            newer: idx < chronology.length - 1 ? chronology[idx + 1] : null
                        };
                    },
                    featuredPost() {
                        if (this.posts.length === 0) return null;
                        const pinned = this.posts.find(p => p.featured || p.pinned);
                        return pinned || this.posts.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                    },
                    featuredImageStyle() {
                        if (!this.featuredPost) return 'none';
                        const img = this.featuredPost.image || (this.featuredPost.images && this.featuredPost.images[0]);
                        if (!img) return 'none';
                        const safeUrl = img.replace(/'/g, '%27');
                        return `url('${safeUrl}')`;
                    },
                    allTags() {
                        const tags = new Set();
                        this.posts.forEach(post => {
                            this.getTags(post).forEach(tag => tags.add(tag));
                        });
                        return Array.from(tags).sort();
                    },
                    archives() {
                        const archiveMap = new Map();
                        this.posts.forEach(post => {
                            const date = new Date(post.date);
                            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                            const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                            archiveMap.set(key, label);
                        });
                        return Array.from(archiveMap.entries()).map(([key, label]) => ({ key, label })).sort((a, b) => b.key.localeCompare(a.key));
                    },
                    allCategories() {
                        return [
                            { id: 'all', name: 'All' },
                            ...this.categories
                        ];
                    },
                    hasFilters() {
                        return this.searchQuery || this.selectedCategory || this.selectedTag || this.selectedArchive || this.selectedDate || this.sortBy !== 'newest';
                    },
                    activeFilterCount() {
                        let count = 0;
                        if (this.searchQuery) count++;
                        if (this.selectedCategory) count++;
                        if (this.selectedTag) count++;
                        if (this.selectedArchive) count++;
                        if (this.selectedDate) count++;
                        if (this.sortBy !== 'newest') count++;
                        return count;
                    },
                    searchSuggestions() {
                        if (!this.searchQuery) return [];
                        const q = this.searchQuery.toLowerCase();
                        const matches = new Set();
                        this.posts.forEach(post => {
                            if ((post.title || '').toLowerCase().includes(q)) matches.add(post.title);
                            this.getTags(post).forEach(tag => { if (tag.toLowerCase().includes(q)) matches.add(tag); });
                            if ((post.author || '').toLowerCase().includes(q)) matches.add(post.author);
                        });
                        return Array.from(matches).slice(0, 6);
                    },
                    recentSearches() {
                        try {
                            return JSON.parse(localStorage.getItem('blog_recent_searches') || '[]');
                        } catch { return []; }
                    },
                    continueReadingPosts() {
                        const readIds = this.getReadingHistory();
                        return this.posts.filter(p => readIds.includes(p.id)).slice(0, 6);
                    },
                    trendingPosts() {
                        return [...this.posts]
                            .sort((a, b) => ((b.likes || 0) + (b.dislikes || 0)) - ((a.likes || 0) + (a.dislikes || 0)))
                            .slice(0, 6);
                    },
                    recentlyViewedPosts() {
                        const viewedIds = this.getRecentlyViewed();
                        return viewedIds.map(id => this.posts.find(p => p.id === id)).filter(Boolean).slice(0, 6);
                    },
                    hasSocialLinks() {
                        if (!this.authorInfo || !this.authorInfo.social) return false;
                        const s = this.authorInfo.social;
                        return s.email || s.website || s.twitter || s.facebook || s.linkedin || s.instagram;
                    },
                    checkoutFormValid() {
                        const fd = this.checkoutFormData;
                        if (this.selectedPaymentMethod === 'mpesa') {
                            return fd.name.trim() && fd.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.email) && fd.phone.trim();
                        }
                        return fd.name.trim() && fd.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.email) && fd.cardNumber.replace(/\s/g, '').length >= 15 && fd.cardExpiry.length === 5 && fd.cardCvc.length >= 3;
                    }
                },
                methods: {
                    getTags(post) {
                        return Array.isArray(post?.tags) ? post.tags : [];
                    },
                    async loadPosts() {
                        try {
                            const resp = await fetch(`/api/posts?t=${new Date().getTime()}`);
                            const data = await resp.json();
                            this.posts = data.posts || [];
                        } catch (e) {
                            console.error('Failed to load posts:', e);
                            this.posts = [];
                        }
                    },
                    async loadCategories() {
                        try {
                            const resp = await fetch(`/api/categories?t=${new Date().getTime()}`);
                            const data = await resp.json();
                            this.categories = data.categories || [];
                        } catch (e) {
                            console.error('Failed to load categories:', e);
                            this.categories = [];
                        }
                    },
                    async loadSettings() {
                        const ts = new Date().getTime();
                        const [bg, blog, author] = await Promise.allSettled([
                            fetch(`/api/settings/background?t=${ts}`).then(r => r.json()).catch(() => null),
                            fetch(`/api/settings/blog-info?t=${ts}`).then(r => r.json()).catch(() => null),
                            fetch(`/api/settings/author?t=${ts}`).then(r => r.json()).catch(() => null)
                        ]);

                        const bgData = bg.value;
                        if (bgData && bgData.backgroundUrl) {
                            const appElement = document.getElementById('app');
                            if (appElement) {
                                const bgUrl = bgData.backgroundUrl.replace(/'/g, '%27');
                                appElement.style.backgroundImage = `url('${bgUrl}')`;
                                appElement.style.backgroundSize = 'cover';
                                appElement.style.backgroundPosition = 'center';
                                appElement.style.backgroundAttachment = 'fixed';
                            }
                        }

                        const blogData = blog.value;
                        if (blogData && blogData.blogInfo && blogData.blogInfo.title) {
                            this.blogTitle = blogData.blogInfo.title;
                        }

                        const authorData = author.value;
                        if (authorData && authorData.author) {
                            this.authorInfo = authorData.author;
                        }
                    },
                    async checkUserRights() {
                        try {
                            const token = sessionStorage.getItem('authToken');
                            const headers = { 'Content-Type': 'application/json' };
                            if (token) headers['Authorization'] = 'Bearer ' + token;
                            const resp = await fetch('/api/auth/me', { credentials: 'include', headers });
                            if (resp.ok) {
                                const data = await resp.json();
                                if (data.success && data.user) {
                                    this.currentUserRights = Array.isArray(data.user.rights) ? data.user.rights : [];
                                }
                            }
                        } catch (e) { /* not logged in or error — ignore */ }
                    },
                    clearFilters() {
                        this.searchQuery = '';
                        this.selectedCategory = '';
                        this.selectedTag = '';
                        this.selectedArchive = '';
                        this.selectedDate = '';
                        this.sortBy = 'newest';
                        this.showBookmarks = false;
                    },
                    clearSearch() {
                        this.searchQuery = '';
                        this.showSearchSuggestions = false;
                        document.getElementById('search-input').focus();
                    },
                    toggleCategory(categoryId) {
                        if (categoryId === 'all') {
                            this.selectedCategory = '';
                        } else {
                            this.selectedCategory = categoryId;
                        }
                    },
                    getReadingTime(content) {
                        const wordsPerMinute = 200;
                        const words = (content || '').trim().split(/\s+/).length;
                        const minutes = Math.ceil(words / wordsPerMinute);
                        return `${minutes} min read`;
                    },
                    getReadingMinutes(content) {
                        return Math.max(1, Math.ceil(((content || '').trim().split(/\s+/).length) / 200));
                    },
                    getCategoryName(categoryId) {
                        if (!categoryId) return null;
                        const cat = this.categories.find(c => c.id === categoryId);
                        return cat ? cat.name : null;
                    },
                    formatDate(dateString) {
                        const date = new Date(dateString);
                        return date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                    },
                    getExcerpt(content) {
                        if (!content) return '';
                        const text = content.replace(/<[^>]+>/g, '');
                        return text.length > 150 ? text.substring(0, 150) + '...' : text;
                    },
                    getReaction(postId) {
                        return localStorage.getItem(`reaction_${postId}`) || null;
                    },
                    async reactToPost(post, type) {
                        const reactionKey = `reaction_${post.id}`;
                        const current = localStorage.getItem(reactionKey);
                        const removing = current === type;
                        const action = removing ? 'remove' : 'add';

                        if (!removing && current && current !== type) {
                            const opposite = current === 'like' ? 'like' : 'dislike';
                            await fetch(`/api/posts/${post.id}/${opposite}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'remove' })
                            }).then(r => r.json()).then(d => {
                                if (d.success) {
                                    if (opposite === 'like') post.likes = d.likes;
                                    else post.dislikes = d.dislikes;
                                }
                            });
                            localStorage.removeItem(reactionKey);
                        }

                        try {
                            const resp = await fetch(`/api/posts/${post.id}/${type}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action })
                            });
                            const data = await resp.json();
                            if (resp.ok && data.success) {
                                if (type === 'like') post.likes = data.likes;
                                else post.dislikes = data.dislikes;
                                if (removing) {
                                    localStorage.removeItem(reactionKey);
                                } else {
                                    localStorage.setItem(reactionKey, type);
                                }
                                this.posts = [...this.posts];
                            }
                        } catch (e) {
                            console.error('Reaction error:', e);
                        }
                    },
                    openLightbox(imgUrl) {
                        this.lightboxImg = imgUrl;
                        this.isLightboxOpen = true;
                    },
                    closeLightbox() {
                        this.isLightboxOpen = false;
                    },

                    // ── THEME FUNCTIONS ──
                    applyTheme(theme) {
                        document.documentElement.setAttribute('data-theme', theme);
                        localStorage.setItem('blog_theme', theme);
                    },
                    setTheme(theme) {
                        this.theme = theme;
                        this.applyTheme(theme);
                    },
                    cycleTheme() {
                        const themes = ['light', 'dark'];
                        const idx = themes.indexOf(this.theme);
                        this.setTheme(themes[(idx + 1) % themes.length]);
                        this.showToast(`Theme: ${this.theme.charAt(0).toUpperCase() + this.theme.slice(1)}`);
                    },

                    // ── SEARCH SUGGESTIONS ──
                    hideSearchSuggestionsDelayed() {
                        setTimeout(() => { this.showSearchSuggestions = false; }, 200);
                    },
                    selectSuggestion(sug) {
                        this.searchQuery = sug;
                        this.showSearchSuggestions = false;
                        this.saveRecentSearch(sug);
                    },
                    saveRecentSearch(query) {
                        if (!query) return;
                        try {
                            let searches = JSON.parse(localStorage.getItem('blog_recent_searches') || '[]');
                            searches = searches.filter(s => s !== query);
                            searches.unshift(query);
                            if (searches.length > 5) searches = searches.slice(0, 5);
                            localStorage.setItem('blog_recent_searches', JSON.stringify(searches));
                        } catch (e) { /* ignore */ }
                    },
                    removeRecentSearch(index) {
                        try {
                            let searches = JSON.parse(localStorage.getItem('blog_recent_searches') || '[]');
                            searches.splice(index, 1);
                            localStorage.setItem('blog_recent_searches', JSON.stringify(searches));
                            this.$forceUpdate();
                        } catch (e) { /* ignore */ }
                    },
                    onSearchKeydown(e) {
                        const suggestions = this.searchSuggestions;
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (this.searchSuggestionIndex < suggestions.length - 1) {
                                this.searchSuggestionIndex++;
                            }
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (this.searchSuggestionIndex > -1) {
                                this.searchSuggestionIndex--;
                            }
                        } else if (e.key === 'Enter' && this.searchSuggestionIndex >= 0 && suggestions[this.searchSuggestionIndex]) {
                            e.preventDefault();
                            this.selectSuggestion(suggestions[this.searchSuggestionIndex]);
                        } else if (e.key === 'Escape') {
                            this.showSearchSuggestions = false;
                        } else if (e.key === 'Enter' && this.searchQuery) {
                            this.saveRecentSearch(this.searchQuery);
                        }
                    },

                    // ── READING PROGRESS ──
                    onScroll() {
                        const scrollTop = window.scrollY;
                        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                        const progress = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
                        const bar = document.getElementById('reading-progress-bar');
                        if (bar) bar.style.width = progress + '%';

                        this.filtersSticky = scrollTop > 200;
                    },

                    // ── READING HISTORY ──
                    getReadingHistory() {
                        try {
                            return JSON.parse(localStorage.getItem('blog_reading_history') || '[]');
                        } catch { return []; }
                    },
                    getReadingProgress(postId) {
                        try {
                            const prog = JSON.parse(localStorage.getItem('blog_reading_progress') || '{}');
                            return prog[postId] || 0;
                        } catch { return 0; }
                    },

                    // ── RECENTLY VIEWED ──
                    getRecentlyViewed() {
                        try {
                            return JSON.parse(localStorage.getItem('blog_recently_viewed') || '[]');
                        } catch { return []; }
                    },

                    // ── BOOKMARKS ──
                    getBookmarkedIds() {
                        try {
                            return JSON.parse(localStorage.getItem('blog_bookmarks') || '[]');
                        } catch { return []; }
                    },
                    isBookmarked(postId) {
                        return this.getBookmarkedIds().includes(postId);
                    },
                    toggleBookmark(post) {
                        let bookmarks = this.getBookmarkedIds();
                        if (bookmarks.includes(post.id)) {
                            bookmarks = bookmarks.filter(id => id !== post.id);
                            this.showToast('Bookmark removed');
                        } else {
                            bookmarks.unshift(post.id);
                            this.showToast('Post bookmarked!');
                            this.fireConfetti();
                        }
                        localStorage.setItem('blog_bookmarks', JSON.stringify(bookmarks));
                        this.$forceUpdate();
                    },

                    // ── KEYBOARD SHORTCUTS ──
                    onKeydown(e) {
                        if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                            const tag = e.target.tagName;
                            if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                                e.preventDefault();
                                const input = document.getElementById('search-input');
                                if (input) input.focus();
                            }
                        }
                        if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            this.showShortcuts = !this.showShortcuts;
                        }
                        if (e.key === 'Escape') {
                            if (this.showTemplateModal) { this.closeTemplateModal(); return; }
                            if (this.showShortcuts) { this.showShortcuts = false; return; }
                            if (this.readingModePost) { this.closeReadingMode(); return; }
                            if (this.isLightboxOpen) { this.closeLightbox(); return; }
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                        if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
                            const tag = e.target.tagName;
                            if (tag !== 'INPUT' && tag !== 'TEXTAREA' && this.sortedFilteredPosts.length > 0) {
                                e.preventDefault();
                                const first = this.sortedFilteredPosts[0];
                                if (first) this.openReadingMode(first);
                            }
                        }
                        if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
                            const tag = e.target.tagName;
                            if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                                e.preventDefault();
                                this.openRandomPost();
                            }
                        }
                        if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
                            const tag = e.target.tagName;
                            if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                                e.preventDefault();
                                this.cycleTheme();
                            }
                        }
                    },

                    // ── READING MODE ──
                    openReadingMode(post) {
                        this.readingModePost = post;
                        document.body.style.overflow = 'hidden';
                    },
                    closeReadingMode() {
                        this.readingModePost = null;
                        document.body.style.overflow = '';
                    },
                    getReadingContent(content) {
                        if (!content) return '<p>No content available.</p>';
                        const text = content.replace(/<[^>]+>/g, '');
                        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
                        return paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
                    },

                    // ── FEATURED POST ──
                    openFeaturedPost() {
                        if (this.featuredPost) {
                            window.location.href = '/post.html?id=' + this.featuredPost.id;
                        }
                    },

                    // ── RANDOM POST ──
                    openRandomPost() {
                        const visible = this.sortedFilteredPosts;
                        if (visible.length === 0) return;
                        const random = visible[Math.floor(Math.random() * visible.length)];
                        window.location.href = '/post.html?id=' + random.id;
                    },

                    // ── SCROLL TO TOP ──
                    scrollToTop() {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    },

                    // ── TOAST ──
                    showToast(message) {
                        const toast = document.getElementById('toast');
                        if (!toast) return;
                        toast.textContent = message;
                        toast.classList.add('visible');
                        clearTimeout(this._toastTimeout);
                        this._toastTimeout = setTimeout(() => {
                            toast.classList.remove('visible');
                        }, 2000);
                    },

                    // ── CONFETTI ──
                    fireConfetti() {
                        const container = document.getElementById('confetti-container');
                        if (!container) return;
                        const colors = ['#6366f1', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e', '#ec4899'];
                        for (let i = 0; i < 30; i++) {
                            const piece = document.createElement('div');
                            piece.className = 'confetti-piece';
                            piece.style.left = Math.random() * 100 + '%';
                            piece.style.top = '-10px';
                            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
                            piece.style.width = (Math.random() * 8 + 4) + 'px';
                            piece.style.height = (Math.random() * 8 + 4) + 'px';
                            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
                            piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
                            piece.style.animationDelay = (Math.random() * 0.5) + 's';
                            container.appendChild(piece);
                            setTimeout(() => piece.remove(), 3000);
                        }
                    },

                    // ── TEMPLATE MODAL ──
                    openTemplateModal() {
                        this.showTemplateModal = true;
                        this.checkoutStep = 'preview';
                        this.checkoutProcessing = false;
                        this.checkoutError = '';
                        this.checkoutKeyCopied = false;
                        document.body.style.overflow = 'hidden';
                    },
                    closeTemplateModal() {
                        this.showTemplateModal = false;
                        document.body.style.overflow = '';
                    },
                    proceedToCheckout() {
                        this.checkoutStep = 'payment';
                        this.checkoutFormData = { name: '', email: '', phone: '', cardNumber: '', cardExpiry: '', cardCvc: '' };
                        this.selectedPaymentMethod = 'mpesa';
                    },
                    formatCheckoutCardNumber(e) {
                        let v = e.target.value.replace(/\D/g, '');
                        v = v.replace(/(\d{4})/g, '$1 ').trim();
                        this.checkoutFormData.cardNumber = v.substring(0, 19);
                    },
                    formatCheckoutCardExpiry(e) {
                        let v = e.target.value.replace(/\D/g, '');
                        if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2, 4);
                        this.checkoutFormData.cardExpiry = v.substring(0, 5);
                    },
                    async submitCheckout() {
                        if (!this.checkoutFormValid || this.checkoutProcessing) return;
                        this.checkoutProcessing = true;
                        this.checkoutStep = 'processing';
                        try {
                            const fd = this.checkoutFormData;
                            if (this.selectedPaymentMethod === 'mpesa') {
                                // Step 1: Initiate M-Pesa STK Push
                                const initResp = await fetch('/api/payments/checkout', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        phoneNumber: fd.phone.trim().replace(/\D/g, ''),
                                        name: fd.name.trim(),
                                        email: fd.email.trim()
                                    })
                                });
                                const initData = await initResp.json();
                                if (!initResp.ok || !initData.success) {
                                    this.checkoutStep = 'failed';
                                    this.checkoutError = initData.error || 'Failed to initiate payment. Please try again.';
                                    this.checkoutProcessing = false;
                                    return;
                                }
                                // Step 2: Poll for payment confirmation
                                const checkoutRequestId = initData.checkoutRequestId;
                                const maxAttempts = 40;
                                let confirmed = false;
                                for (let i = 0; i < maxAttempts; i++) {
                                    await new Promise(r => setTimeout(r, 3000));
                                    try {
                                        const statusResp = await fetch(`/api/payments/status/${checkoutRequestId}`);
                                        const statusData = await statusResp.json();
                                        if (statusData.status === 'completed') {
                                            this.checkoutStep = 'success';
                                            this.checkoutLicenseKey = statusData.license_key || ('BLG-' + Date.now().toString(36).toUpperCase());
                                            this.fireConfetti();
                                            confirmed = true;
                                            break;
                                        } else if (statusData.status === 'failed') {
                                            this.checkoutStep = 'failed';
                                            this.checkoutError = 'Payment was declined. Please try again.';
                                            confirmed = true;
                                            break;
                                        }
                                    } catch (e) {
                                        // Ignore polling errors, keep trying
                                    }
                                }
                                if (!confirmed) {
                                    this.checkoutStep = 'failed';
                                    this.checkoutError = 'Payment timed out. Please check your M-Pesa and try again.';
                                }
                            } else {
                                // Card payment with validation
                                const payload = {
                                    name: fd.name.trim(),
                                    email: fd.email.trim(),
                                    payment_method: 'card',
                                    card_token: 'tok_' + Date.now()
                                };
                                const resp = await fetch('/api/template/purchase', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (sessionStorage.getItem('authToken') || '') },
                                    credentials: 'include',
                                    body: JSON.stringify(payload)
                                });
                                const data = await resp.json();
                                if (resp.ok && data.success) {
                                    this.checkoutStep = 'success';
                                    this.checkoutLicenseKey = data.license_key || 'LIC-' + Date.now().toString(36).toUpperCase();
                                    this.fireConfetti();
                                } else {
                                    this.checkoutStep = 'failed';
                                    this.checkoutError = data.message || 'Payment failed. Please try again.';
                                }
                            }
                        } catch (err) {
                            this.checkoutStep = 'failed';
                            this.checkoutError = 'Network error. Please check your connection and try again.';
                        } finally {
                            this.checkoutProcessing = false;
                        }
                    },
                    resetCheckout() {
                        this.checkoutStep = 'payment';
                        this.checkoutError = '';
                        this.checkoutProcessing = false;
                    },
                    copyLicenseKey() {
                        navigator.clipboard.writeText(this.checkoutLicenseKey).then(() => {
                            this.checkoutKeyCopied = true;
                            setTimeout(() => { this.checkoutKeyCopied = false; }, 2000);
                        }).catch(() => {
                            const ta = document.createElement('textarea');
                            ta.value = this.checkoutLicenseKey;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                            this.checkoutKeyCopied = true;
                            setTimeout(() => { this.checkoutKeyCopied = false; }, 2000);
                        });
                    }
                }
            }).mount('#app');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initVue);
        } else {
            initVue();
        }

        function highlightActiveTab() {
            const currentPath = window.location.pathname;
            const navLinks = document.querySelectorAll('.nav a');
            navLinks.forEach(link => {
                const href = link.getAttribute('href');
                link.classList.remove('active');
                link.classList.remove('active-tab');
                if (href === '/') {
                    if (currentPath === '/' || currentPath === '/index.html' || currentPath.endsWith('/')) {
                        link.classList.add('active');
                        link.classList.add('active-tab');
                    }
                } else if (href && currentPath.includes(href.replace('/', '').replace('.html', ''))) {
                    link.classList.add('active');
                    link.classList.add('active-tab');
                }
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', highlightActiveTab);
        } else {
            highlightActiveTab();
        }
        window.addEventListener('load', highlightActiveTab);
    