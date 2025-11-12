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
>>>>>>> a40d103835d26db4d055de7cb0612dc677445d20
=======
# Vue.js Migration Plan for Birthday Blog Frontend

## Information Gathered
- Current setup: Vanilla HTML/CSS/JS frontend with Express/Node.js backend
- Backend APIs are functional (posts, categories, auth, settings, etc.)
- Server running on port 3000 with MongoDB support
- Existing features: Blog grid, post pages, admin login, categories, search
- User requested migration to Vue.js with Vite and Tailwind CSS for modern features

## Plan
1. **Update package.json** - Add Vue 3, Vite, Pinia, Vue Router, Framer Motion Vue, and update scripts
2. **Create Vue project structure** - Set up src/ directory with components, views, stores
3. **Migrate main pages to Vue components**:
   - App.vue (main layout)
   - HomeView.vue (blog grid from index.html)
   - PostView.vue (individual post from post.html)
   - AboutView.vue (about page)
   - LoginView.vue (admin login)
4. **Create reusable components**:
   - BlogCard.vue
   - Navbar.vue
   - Footer.vue
   - SearchBar.vue
   - ThemeToggle.vue
   - CategoryFilter.vue
5. **Set up routing** - Vue Router for navigation between pages
6. **Add state management** - Pinia for global state (theme, auth, posts)
7. **Implement modern features**:
   - Dark/light mode toggle
   - Smooth animations with Framer Motion
   - Responsive design with Tailwind
   - Loading states and error handling
8. **Integrate with existing APIs** - Use fetch/Axios to consume backend endpoints
9. **Update build configuration** - Vite config for development and production

## Dependent Files to be edited
- package.json (add Vue dependencies)
- Create new Vue files: src/App.vue, src/main.js, src/router.js, etc.
- Update server.js if needed for SPA routing (serve index.html for all routes)

## Followup steps
- Install new dependencies
- Run Vite dev server
- Test API integration
- Verify responsive design and animations
- Test admin functionality
- Deploy and verify production build

## Confirmation Required
Please confirm if this plan looks good before proceeding with the migration.

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
=======
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
>>>>>>> a40d103835d26db4d055de7cb0612dc677445d20
