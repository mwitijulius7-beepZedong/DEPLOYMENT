---
description: Repository Information Overview
alwaysApply: true
---

# Birthday Blog Information

## Summary

Birthday Blog is a full-stack web application for publishing and managing blog posts with Google OAuth authentication. The project includes a Vue.js frontend, Node.js/Express backend, and integrates with MongoDB for data persistence, Cloudinary for image storage, and supports deployment to both Vercel and Netlify.

## Structure

**Root Level Organization**:
- **`src/`**: Vue component files (Navbar, etc.)
- **`components/`**: Header component (Header.vue)
- **`styles/`**: CSS styling files (header.css, input.css)
- **`uploads/`**: User-uploaded images storage
- **`dist/`**: Built distribution files
- **`node_modules/`**: npm dependencies

**Key Files**:
- **`server.js`**: Express.js backend server (main entry point)
- **`App.vue`**: Root Vue component
- **`index.html`**: Static HTML landing page
- **`admin.html`**, **`admin_page.html`**: Admin dashboard interfaces
- **`login.html`**, **`about.html`**, **`post.html`**: Static page templates
- **`test-*.js`**: Test files for various features (API, authentication, settings)

## Language & Runtime

**Language**: JavaScript (Node.js + Vue.js)  
**Node Version**: `22.x` (specified in package.json engines)  
**Frontend Framework**: Vue.js  
**Backend Framework**: Express.js (v4.18.2)  
**Package Manager**: npm  
**Styling**: Tailwind CSS (v4.1.16)

## Dependencies

**Main Dependencies**:
- **Authentication**: `google-auth-library` (v8.7.0), `bcryptjs` (v2.4.3)
- **Session Management**: `express-session` (v1.17.3)
- **File Upload**: `express-fileupload` (v1.4.0)
- **Database**: `mongodb` (v6.20.0)
- **Cloud Storage**: `cloudinary` (v2.7.0), `@vercel/blob` (v2.0.0), `@vercel/kv` (v1.0.1)
- **Email**: `nodemailer` (v7.0.9)
- **Utilities**: `dotenv` (v16.6.1), `node-fetch` (v2.6.7)
- **UI Framework**: `react` (v19.2.0), `react-dom` (v19.2.0)

**Development Dependencies**:
- `tailwindcss` (v4.1.16)

## Build & Installation

```bash
npm install
npm start
npm run dev
```

**Server Port**: Runs on `process.env.PORT || 3000`  
**Entry Point**: `server.js` (configured in package.json as "main")

## Docker

No Dockerfile or Docker Compose configuration found in the repository.

## Deployment

**Netlify Configuration** (`netlify.toml`):
- Functions directory: `netlify/functions`
- Publish directory: root
- Serverless functions for `/api/*` and `/auth/*` endpoints

**Vercel Configuration** (`vercel.json`):
- Version 2 API
- Server timeout: 10 seconds
- Single route handler: `/server.js`

## Testing

**Test Files Location**: Root directory  
**Available Test Suites**:
- `test-api.js` - API endpoint testing
- `test-forgot-password.js` - Password reset flow
- `test-forgot-password-invalid.js` - Invalid password reset scenarios
- `test-forgot-password-mock.js` - Mocked password reset testing
- `test-production-login.js` - Production login authentication
- `test-production-author-settings.js` - Author settings functionality
- `test-settings-apis.js` - Settings API endpoints
- `test-category-filter.html` - Category filtering UI test

**Test Framework**: Direct Node.js test files (no standard test runner framework detected)

## Configuration Files

- **`.env`**: Environment variables (not included; copy from `.env.example`)
- **`tailwind.config.js`**: Tailwind CSS configuration
- **`netlify.toml`**: Netlify deployment configuration
- **`vercel.json`**: Vercel deployment configuration
- **Data Files**: `users.json`, `posts.json`, `categories.json`, `analytics.json`, `security_logs.json`

## Main Features

- **Google OAuth Authentication**: Verify ID tokens and create sessions
- **Blog Post Management**: Create, edit, delete posts
- **Category Management**: Organize posts by categories
- **User Settings**: Author profile and preferences
- **Analytics Tracking**: View blog analytics
- **Image Upload**: Support for Cloudinary and Vercel Blob storage
- **Dark Mode Toggle**: Theme switching capability
- **Security Logging**: Track authentication and admin activities

## Important Notes

- Requires Google OAuth credentials (GOOGLE_CLIENT_ID)
- Supports optional domain/email restrictions (ALLOWED_DOMAIN, ALLOWED_EMAIL)
- MongoDB URI required for database operations
- Cloudinary credentials for image handling
- Session secret required for production deployment
- Production deployment requires HTTPS with secure cookies enabled
