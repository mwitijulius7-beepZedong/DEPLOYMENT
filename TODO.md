# Authentication System Security Improvements

## Critical Security Fixes (Priority 1)
- [ ] Fix overly permissive Vercel authentication (currently allows all requests)
- [ ] Add rate limiting to auth endpoints (login, forgot password, etc.)
- [ ] Improve session configuration with security headers
- [ ] Add CSRF protection to sensitive endpoints

## Enhanced Authentication (Priority 2)
- [ ] Implement proper JWT tokens instead of basic base64 tokens
- [ ] Add account lockout mechanism after failed login attempts
- [ ] Better password validation and strength requirements
- [ ] Implement session invalidation on password change

## Production Readiness (Priority 3)
- [ ] Move password reset tokens from memory to database/file storage
- [ ] Add security headers (HSTS, CSP, X-Frame-Options, etc.)
- [ ] Implement proper session store (Redis/MongoDB) for production
- [ ] Add request logging and monitoring

## Admin Security Enhancements (Priority 4)
- [ ] Enhanced admin entry key validation with time-based restrictions
- [ ] Multi-factor authentication support for admin accounts
- [ ] Admin session timeout and concurrent session limits
- [ ] Audit logging for admin actions

## Testing and Validation
- [ ] Create comprehensive auth tests
- [ ] Security audit of all endpoints
- [ ] Performance testing under load
- [ ] Penetration testing preparation
# TODO: Implement Admin Entry Key Idle Timeout

## Tasks to Complete

- [x] **Modify server.js**:
  - Add session storage for admin entry key verification status (`req.session.adminKeyVerified`).
  - Update `/api/settings/verify-entry-key` route to set `req.session.adminKeyVerified = true` on successful verification.
  - Add new route `/api/settings/check-admin-key-verified` to check if the key is verified in session.

- [x] **Modify admin.html**:
  - Update `checkAuth()` function to first check session for admin key verification via new route.
  - Implement idle timeout logic: track last activity, prompt for key only if idle > 10 minutes.
  - Add event listeners for mouse, keyboard, and touch events to reset idle timer.
  - Clear session flag when idle timeout occurs.

- [x] **Test idle timeout functionality**:
  - Simulate activity and inactivity to verify 10-minute idle prompt.
  - Ensure no prompt on refresh if active within 10 minutes.
