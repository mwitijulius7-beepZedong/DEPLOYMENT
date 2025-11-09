# TODO: Fix Google Login and MongoDB Issues

## 1. Standardize Google OAuth Client ID
- [ ] Use client ID from index.html.txt (338774598801-1pj8tukietpiupfpt89lucjt17odm2hj.apps.googleusercontent.com) as standard
- [ ] Remove hardcoded client ID from login.html

## 2. Migrate login.html to Google Identity Services API
- [ ] Replace gapi.auth2 with Google Identity Services API
- [ ] Update script to use window.google.accounts.id
- [ ] Implement proper callback handling

## 3. Implement Dynamic Client ID Loading
- [ ] Update index.html.txt to fetch client ID from server endpoint
- [ ] Update login.html to fetch client ID from server endpoint
- [ ] Add error handling for missing client ID

## 4. Add Server Endpoint for Client ID
- [ ] Add GET /api/google-client-id endpoint in server.js
- [ ] Return GOOGLE_CLIENT_ID from environment or default

## 5. Fix MongoDB Connection Issues
- [ ] Update test-production-login.js with proper SSL options
- [ ] Add certificate validation settings
- [ ] Test connection with updated options

## 6. Testing and Verification
- [ ] Test Google authentication in index.html
- [ ] Test Google authentication in login.html
- [ ] Verify MongoDB connectivity
- [ ] Confirm all login methods work
