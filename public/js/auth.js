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

        // Check if admin entry key is required
        const securityResponse = await fetch('/api/settings/security');
        const securityData = await securityResponse.json();
        console.log('Security check:', securityData);

        if (securityData.hasEntryKey) {
            // First check if admin key is already verified in session
            const checkResponse = await fetch('/api/settings/check-admin-key-verified', { credentials: 'include' });
            const checkData = await checkResponse.json();

            if (!checkData.verified) {
                // Not verified, prompt for admin entry key
                const success = await promptForAdminKey();
                if (!success) return;
            } else {
                // Already verified, start idle timer
                resetIdleTimer();
            }
        }

        console.log('Authentication and entry key verification successful, loading dashboard');
        // Load dashboard data
        loadDashboardStats();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

export async function promptForAdminKey() {
    const adminKey = prompt('Please enter the admin entry key:');
    if (!adminKey) {
        alert('Admin entry key is required to access the admin panel.');
        window.location.href = '/login.html';
        return false;
    }

    try {
        // Server endpoint is /api/settings/verify-entry-key
        // and expects payload { adminEntryKey: string }
        const response = await fetch('/api/settings/verify-entry-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ adminEntryKey: adminKey })
        });

        if (response.ok) {
            resetIdleTimer();
            return true;
        } else {
            alert('Invalid admin entry key. Access denied.');
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
