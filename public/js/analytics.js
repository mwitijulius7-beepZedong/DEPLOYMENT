// Analytics module
export function showAnalyticsSection() {
    const analyticsSection = document.getElementById('analytics-section');
    if (analyticsSection.style.display === 'block') {
        analyticsSection.style.display = 'none';
    } else {
        analyticsSection.style.display = 'block';
        analyticsSection.scrollIntoView({ behavior: 'smooth' });
        // Load initial analytics data
        refreshAnalytics();
        // Initialize charts
        initializeCharts();
    }
}

export async function refreshAnalytics() {
    try {
        const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('authToken') : '';
        const analyticsResponse = await fetch('/api/analytics', { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        const analyticsData = await analyticsResponse.json();

        document.getElementById('analytics-page-views').textContent = analyticsData.pageViews?.length || 0;
        document.getElementById('analytics-engagement').textContent = analyticsData.engagementRate || '0%';

        alert('Analytics data refreshed successfully!');
    } catch (error) {
        console.error('Failed to refresh analytics:', error);
        alert('Failed to refresh analytics data.');
    }
}

export async function viewEngagementDetails() {
    try {
        const response = await fetch('/api/analytics/engagement');
        const data = await response.json();

        alert(`Engagement Details:\n- Total Interactions: ${data.totalInteractions || 0}\n- Average Time: ${data.averageTime || 0}s\n- Bounce Rate: ${data.bounceRate || 0}%`);
    } catch (error) {
        console.error('Failed to load engagement details:', error);
        alert('Failed to load engagement details.');
    }
}

export async function exportAnalytics() {
    try {
        const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('authToken') : '';
        const response = await fetch('/api/analytics/export', { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'analytics-report.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            alert('Failed to export analytics report.');
        }
    } catch (error) {
        console.error('Failed to export analytics:', error);
        alert('Failed to export analytics report.');
    }
}

export async function loadTimeAnalytics() {
    const period = document.getElementById('analytics-period').value;
    try {
        const response = await fetch(`/api/analytics/time?period=${period}`);
        const data = await response.json();

        alert(`Time Analytics for ${period}:\n- Total Views: ${data.totalViews || 0}\n- Peak Hours: ${data.peakHours || 'N/A'}\n- Growth Rate: ${data.growthRate || 0}%`);
    } catch (error) {
        console.error('Failed to load time analytics:', error);
        alert('Failed to load time analytics.');
    }
}
