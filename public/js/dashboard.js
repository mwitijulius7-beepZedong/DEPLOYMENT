// Dashboard module
export async function loadDashboardStats() {
    try {
        // Load posts count
        const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('authToken') : '';
        const postsResponse = await fetch('/api/posts', { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        const postsData = await postsResponse.json();
        document.getElementById('posts-count').textContent = postsData.posts.length;

        // Load analytics (simplified)
        const token2 = (typeof localStorage !== 'undefined') ? localStorage.getItem('authToken') : '';
        const analyticsResponse = await fetch('/api/analytics', { headers: token2 ? { 'Authorization': `Bearer ${token2}` } : {} });
        const analyticsData = await analyticsResponse.json();
        document.getElementById('views-count').textContent = analyticsData.pageViews?.length || 0;

        // For subscribers, we could add a counter later
        document.getElementById('subscribers-count').textContent = '0';

    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
    }
}

export function showDashboard() {
    // Hide all sections
    const sections = ['posts-section', 'settings-section', 'analytics-section', 'customize-section', 'create-post-section'];
    sections.forEach(sectionId => {
        const el = document.getElementById(sectionId);
        if (el) el.style.display = 'none';
    });

    // Show dashboard content
    const dashboard = document.getElementById('dashboard');
    if (dashboard) dashboard.style.display = 'block';

    // Remove active class from all nav links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));

    // Add active class to dashboard link
    document.querySelector('.nav-link[href="#dashboard"]').classList.add('active');
}
