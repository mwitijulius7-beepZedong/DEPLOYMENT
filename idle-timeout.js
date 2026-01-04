// idle-timeout.js
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

let idleTimer;
let lastActivity = Date.now();

export function resetIdleTimer() {
  lastActivity = Date.now();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(checkIdleTimeout, 1000);
}

function checkIdleTimeout() {
  const now = Date.now();
  if (now - lastActivity >= IDLE_TIMEOUT) {
    clearAdminKeyVerification();
    promptForAdminKey();
  } else {
    idleTimer = setTimeout(checkIdleTimeout, 1000);
  }
}

async function clearAdminKeyVerification() {
  try {
    await fetch('/api/settings/clear-admin-key-verification', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (err) {
    console.error('Failed to clear admin key verification', err);
  }
}

async function promptForAdminKey() {
  const entryKey = prompt(
    'Your session has expired due to inactivity. Please enter the admin entry key.'
  );

  if (!entryKey) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const res = await fetch('/api/settings/verify-entry-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ adminEntryKey: entryKey })
    });

    const data = await res.json();
    if (!data.success) {
      alert('Invalid admin entry key');
      window.location.href = '/login.html';
      return;
    }

    resetIdleTimer();
  } catch (err) {
    console.error('Admin key verification failed', err);
    window.location.href = '/login.html';
  }
}

export function initIdleTracking() {
  [
    'mousedown',
    'mousemove',
    'keypress',
    'scroll',
    'touchstart',
    'click'
  ].forEach(evt =>
    document.addEventListener(evt, resetIdleTimer, true)
  );
}
