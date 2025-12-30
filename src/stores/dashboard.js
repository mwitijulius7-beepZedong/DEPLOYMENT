// dashboard.js
export async function loadDashboardStats() {
  try {
    const posts = await fetch('/api/posts').then(r => r.json());
    document.getElementById('posts-count').textContent = posts.posts.length;

    const analytics = await fetch('/api/analytics').then(r => r.json());
    document.getElementById('views-count').textContent =
      analytics.pageViews?.length || 0;

    document.getElementById('subscribers-count').textContent = '0';
  } catch (err) {
    console.error('Dashboard load failed', err);
  }
}
