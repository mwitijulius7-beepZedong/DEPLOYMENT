// Localhost admin smoke test - verify admin UI endpoints
// Prerequisites: server is running on localhost:3000 (or PORT env), admin user exists or seedable via DEV_ADMIN_PASSWORD
// Usage: DEV_ADMIN_PASSWORD can seed/admin login password; port can be overridden with PORT env var

const fetch = require('node-fetch')

;(async () => {
  const port = process.env.PORT || 3000
  const base = `http://localhost:${port}`
  const adminUser = process.env.ADMIN_USER || 'admin'
  const adminPwd = process.env.DEV_ADMIN_PASSWORD || 'password'

  // 1) Login as admin to create a session cookie
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUser, password: adminPwd })
  })
  if (!loginRes.ok) {
    console.error('Login failed', loginRes.status, await loginRes.text())
    process.exit(1)
  }
  const setCookie = loginRes.headers.get('set-cookie')
  let cookie = ''
  if (setCookie) {
    // take first cookie value
    cookie = setCookie.split(',')[0].split(';')[0]
  }

  const cFetch = async (url, opts = {}) => {
    const headers = Object.assign({}, opts.headers || {})
    if (cookie) headers['Cookie'] = cookie
    return fetch(url, Object.assign({}, opts, { headers }))
  }

  // 2) GET /api/users
  let r = await cFetch(`${base}/api/users`)
  console.log('GET /api/users ->', r.status)
  console.log(await r.text())

  // 3) Create a new user
  const newUser = {
    username: 'smokeuser',
    password: 'Smoke123!',
    name: 'Smoke User',
    email: 'smoke@example.com',
    role: 'USER'
  }
  r = await cFetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newUser)
  })
  console.log('POST /api/users ->', r.status)
  console.log(await r.text())

  // 4) GET users again
  r = await cFetch(`${base}/api/users`)
  console.log('GET /api/users (after) ->', r.status)
  console.log(await r.text())

  // 5) GET categories
  r = await cFetch(`${base}/api/categories`)
  console.log('GET /api/categories ->', r.status)
  console.log(await r.text())

  // 6) Add a category
  const newCat = { name: 'LocalTech' }
  r = await cFetch(`${base}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newCat)
  })
  console.log('POST /api/categories ->', r.status)
  console.log(await r.text())

  // 7) GET categories again
  r = await cFetch(`${base}/api/categories`)
  console.log('GET /api/categories (after) ->', r.status)
  console.log(await r.text())
  process.exit(0)
})().catch(err => {
  console.error('Smoke test failed:', err)
  process.exit(1)
})
