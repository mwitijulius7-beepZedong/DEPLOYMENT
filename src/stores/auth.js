// auth.js
import { resetIdleTimer } from './idle-timeout.js';

export async function checkAuth() {
  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch('/auth/status', {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const data = await res.json();
    if (!data.loggedIn) {
      window.location.href = '/login.html';
      return;
    }

    const securityRes = await fetch('/api/settings/security');
    const security = await securityRes.json();

    if (security.hasEntryKey) {
      const checkRes = await fetch('/api/settings/check-admin-key-verified', {
        credentials: 'include'
      });
      const check = await checkRes.json();

      if (!check.verified) {
        return; // idle module will prompt
      }
      resetIdleTimer();
    }
  } catch (err) {
    console.error('Auth failed', err);
    window.location.href = '/login.html';
  }
}

export async function logout() {
  localStorage.removeItem('authToken');
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/';
}
