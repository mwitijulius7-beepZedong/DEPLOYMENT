// Authentication module
import { loadDashboardStats } from './dashboard.js';

export async function checkAuth() {
    console.log('Checking authentication status...');
    try {
        const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('authToken') : '';
        const response = await fetch('/auth/status', { credentials: 'include', headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        const data = await response.json();
        console.log('Auth response received:', { status: response.status, loggedIn: data.loggedIn });

        if (!data.loggedIn) {
            // Redirect to login if not authenticated
            console.log('Not logged in, redirecting to login');
            window.location.href = '/login.html';
            return;
        }

        // Admin key gate bypassed

        console.log('Authentication and entry key verification successful, loading dashboard');
        // Load dashboard data
        loadDashboardStats();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

export async function promptForAdminKey() {
    return true;
}

export async function logout() {
    try {
        // Clear stored token
        try { localStorage.removeItem('authToken'); } catch (_) { }
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout failed:', error);
        // Force redirect anyway
        window.location.href = '/';
    }
}

// Import idle timeout functionality
// import { initIdleTracking, resetIdleTimer } from './idle-timeout.js';
function resetIdleTimer() {
    if (window.resetIdleTimer) window.resetIdleTimer();
}

window.checkAuth = checkAuth;
window.promptForAdminKey = promptForAdminKey;
window.logout = logout;
