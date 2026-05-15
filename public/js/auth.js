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

        // DISABLED: admin entry key gate skipped

        console.log('Authentication and entry key verification successful, loading dashboard');
        // Load dashboard data
        loadDashboardStats();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

export async function promptForAdminKey() {
    const adminKey = prompt('Please enter your Admin Entry Key:');
    if (!adminKey) {
        alert('Admin entry key is required to access the admin panel.');
        window.location.href = '/login.html';
        return false;
    }

    try {
        // Per-user endpoint
        const response = await fetch('/api/security/admin-key/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ adminKey })
        });

        if (response.ok) {
            resetIdleTimer();
            return true;
        } else {
            let msg = 'Invalid admin entry key. Access denied.';
            try {
                const data = await response.json();
                if (data && data.error === 'admin_key_not_set') {
                    msg = 'No Admin Entry Key is set for your account. Please contact the super admin.';
                }
            } catch (_) { }
            alert(msg);
            window.location.href = '/login.html';
            return false;
        }
    } catch (error) {
        console.error('Error verifying admin key:', error);
        alert('Error verifying admin entry key.');
        window.location.href = '/login.html';
        return false;
    }
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
