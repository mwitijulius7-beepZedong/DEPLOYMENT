# TODO: Implement Admin Entry Key Idle Timeout

## Tasks to Complete

- [x] **Modify server.js**:
  - Add session storage for admin entry key verification status (`req.session.adminKeyVerified`).
  - Update `/api/settings/verify-entry-key` route to set `req.session.adminKeyVerified = true` on successful verification.
  - Add new route `/api/settings/check-admin-key-verified` to check if the key is verified in session.

- [ ] **Modify admin.html**:
  - Update `checkAuth()` function to first check session for admin key verification via new route.
  - Implement idle timeout logic: track last activity, prompt for key only if idle > 10 minutes.
  - Add event listeners for mouse, keyboard, and touch events to reset idle timer.
  - Clear session flag when idle timeout occurs.

- [ ] **Test idle timeout functionality**:
  - Simulate activity and inactivity to verify 10-minute idle prompt.
  - Ensure no prompt on refresh if active within 10 minutes.
