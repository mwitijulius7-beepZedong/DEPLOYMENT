# Idle Timeout Implementation for Admin Panel

## Tasks
- [ ] Update server.js to add idle timeout middleware and logic
- [ ] Update admin-react.html to add client-side activity tracking and timeout handling
- [ ] Test implementation with test-idle-timeout.js
- [ ] Ensure timeout is configurable via environment variable

## Details
- Idle timeout: 10 minutes (configurable via ADMIN_IDLE_TIMEOUT_MINUTES env var)
- Warning at 9 minutes
- Reset timer on user activity (mouse, keyboard, touch)
- Use existing adminKeyVerifiedAt session flag
- Add server-side check for idle timeout
- Client-side prompt when timeout reached
