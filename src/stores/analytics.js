// analytics.js
export async function refreshAnalytics() {
  const data = await fetch('/api/stats').then(r => r.json());
  document.getElementById('analytics-page-views').textContent =
    data.pageViews?.length || 0;
}
