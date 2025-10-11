# Birthday Blog — Google Sign-In (Admin)

This small project adds Google Sign-In to the admin portal and includes an Express server to verify ID tokens and issue a session cookie.

Quick start
1. Copy `.env.example` to `.env` and set `GOOGLE_CLIENT_ID` to your OAuth Web Client ID from Google Cloud Console. Optionally set `ALLOWED_EMAIL` or `ALLOWED_DOMAIN`.
2. Install dependencies:

```powershell
npm install
```

3. Start the server:

```powershell
npm start
```

4. Open http://localhost:3000/index.html.txt (or rename to `index.html`) and go to Admin -> Sign in with Google.

Notes
- The client-side currently calls `/auth/google` with the ID token; the server verifies the token using Google's `tokeninfo` endpoint and creates a session.
- For production, run under HTTPS, set `cookie.secure = true` and use a strong `SESSION_SECRET`.
- Consider fetching token verification libraries from Google for more robust validation instead of tokeninfo endpoint.
