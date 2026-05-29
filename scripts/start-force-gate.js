#!/usr/bin/env node
// Start the server with the admin-entry gate enforced on localhost
process.env.DISABLE_LOCALHOST_ADMIN_KEY_BYPASS = 'true';

// Ensure NODE_ENV is development unless explicitly set
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

require('../server.js');
