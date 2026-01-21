Admin UI: Users & Categories (localhost dev branch)
- Added admin-only endpoints: GET /api/users, POST /api/users, GET/POST/DELETE /api/categories
- Rewired admin panel to include Users section with Create User form and list
- Centralized event wiring in a single script to attach navigation handlers
- Smoke test script test-admin-smoke.js added for end-to-end verification on localhost

Branch: localhost/dev
PR target: main
Author: automation
