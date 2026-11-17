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
- **Comments Photo Upload**: The blog now supports readers attaching images when leaving comments. The images are stored securely by the backend via the `/api/upload` API and automatically rendered on the frontend.
- Consider fetching token verification libraries from Google for more robust validation instead of tokeninfo endpoint.

## Data and file storage

The app uses **Supabase** (Postgres + Storage) automatically when
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Without them it falls
back to MongoDB → Vercel KV → local JSON files, and Cloudinary → Vercel Blob →
local `uploads/`.

Set up the project, run the schema, and migrate existing data by following
[`supabase/README.md`](supabase/README.md). `DATA_BACKEND=mongo` or
`DATA_BACKEND=file` forces the legacy backends and is the rollback switch.

## Multi-tenant blogs (subdomains + custom domains)

Each paying customer gets one tenant, one blog and one platform subdomain
(`<slug>.<PLATFORM_DOMAIN>`). The same Express app resolves the tenant from the
request `Host` header — there are no per-customer deployments.

1. Apply the tenancy migration after the base schema:
   `supabase/migrations/001_tenancy.sql`.
2. Set the environment variables listed in `.env.example`:
   `PLATFORM_DOMAIN`, `CUSTOM_DOMAIN_TARGET`, `SERVER_IP`, and (for automatic
   certificates) `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID`.
3. Restart the app. The seller's existing content lives in the `platform`
   tenant; buyers' posts, settings, categories, themes, analytics and media are
   scoped to their tenant.

### Local testing

Subdomains and custom domains are resolved from real DNS, so test them locally
with names that resolve to your machine:

- `*.localhost` resolves to `127.0.0.1` in modern browsers. Run the server with
  `PLATFORM_DOMAIN=localhost` and open `http://myblog.localhost:3000`.
- Alternatively add hosts-file entries, e.g.
  `127.0.0.1 myblog.test  blog.customer.test`, and set
  `PLATFORM_DOMAIN=test`. HTTP is used automatically for `.localhost`/
  `.lvh.me` hostnames.
- Create a tenant through the checkout with the card method (the M-Pesa flow
  needs Safaricom sandbox callbacks), then visit the chosen subdomain. Unknown
  hostnames return the clean `404.html` page.
- Custom-domain verification performs real DNS lookups. For offline testing,
  point the domain at `127.0.0.1` and add the TXT challenge shown in the
  dashboard.

### Production DNS and TLS

**Platform wildcard**

- `A` record for `PLATFORM_DOMAIN` → your server/host IP.
- `CNAME` for `*` (or at least `CUSTOM_DOMAIN_TARGET`) → your server/host.
- Issue a wildcard certificate for `*.<PLATFORM_DOMAIN>` at your proxy/load
  balancer.

**Customer custom domains**

Customers add these records (also shown in their dashboard):

- `CNAME <their-hostname>` → `CUSTOM_DOMAIN_TARGET` (recommended), or
- `A @` → `SERVER_IP` for apex domains (or an ALIAS/ANAME record).
- `TXT _verify.<their-hostname>` → the per-domain verification token.

After the TXT + CNAME/A checks pass, the domain is activated and the app asks
Cloudflare for SaaS to issue the certificate. `CLOUDFLARE_API_TOKEN` needs
Zone → SSL and Certificates → Edit plus Zone → Zone → Read on the zone, and
Cloudflare for SaaS must be enabled for that zone. Without Cloudflare the
domain still becomes active (useful behind your own proxy/cert manager).

Verification diagnostics also look at `AAAA` and `CAA` records:

- Leftover `AAAA` records can route IPv6 visitors past your proxy. They don't
  block activation, but the dashboard warns about them.
- A `CAA` record that does not allow a known certificate authority (for
  example `letsencrypt.org` or `digicert.com`) will block issuance even after
  DNS verification succeeds, so the dashboard warns before you wait on a
  failing certificate.
- `check.status` distinguishes `pending` (records absent — wait for
  propagation) from `mismatch` (records exist but point elsewhere — fix them).
- For active domains, certificate state (`sslStatus`, hostname status and
  validation errors) is refreshed from Cloudflare by the hourly job and by
  `POST /api/tenant/domains/verify-pending`, and shown as an SSL badge in the
  dashboard.

**Self-hosting with Caddy (alternative)**

Caddy can issue certificates on demand and ask this app whether a hostname is
allowed before requesting one. Point Caddy at `GET /internal/tls/ask?domain=`
(returning 200 only for known, active domains) and keep the ask endpoint on a
private network. Caddy cannot run on Vercel-style serverless hosting, which is
why Cloudflare for SaaS is the default there.

**Background jobs**

- Suspending a buyer parks the tenant and its domains; unsuspending restores
  them.
- Pending custom domains are marked `failed` after ~7 days. Long-running
  processes run this check hourly; on serverless, schedule
  `POST /api/tenant/domains/verify-pending` from cron to re-check pending
  domains and expire stale ones (send the `x-cron-secret: $CRON_SECRET`
  header, or use a seller session).
- Checkout reserves the chosen subdomain for 15 minutes (configurable via
  `SUBDOMAIN_RESERVATION_TTL_MS`) so two customers cannot pay for the same
  slug. Duplicate M-Pesa callbacks are idempotent on the receipt number.
- **Provisioning recovery**: if the process dies (or the mail server is down)
  after payment is captured but before the tenant/domain/blog/welcome email is
  finished, `recoverPendingProvisioning` re-runs the idempotent provisioning
  for completed transactions. Long-running processes run it hourly; on
  serverless, schedule `POST /api/admin/payments/provision-recovery` (or `GET`)
  with the `x-cron-secret: $CRON_SECRET` header. `?force=1` skips the
  10-minute retry cooldown. A seller session also works for manual runs.

**Data isolation and scaling**

- With Supabase, every tenant-owned read adds `.eq('tenant_id', …)`, so one
  blog's homepage, sitemap, RSS and API calls only scan that tenant's rows.
- Writes upsert and prune only the calling tenant's rows instead of
  rewriting the whole table, so concurrent customers cannot clobber each
  other's content.
- The JSON/Mongo fallbacks keep the read-filter/merge-on-write strategy for
  compatibility; they are intended for local use and migration, not for
  serving many tenants at once.

**Shared rate limiting**

By default the auth, API, subdomain-availability and domain-verification
limiters keep counters in process memory, which resets on deploy and is not
shared between serverless instances. Set either pair of variables to share
counters through Upstash Redis (or Vercel KV, which exposes the same REST API):

```
UPSTASH_REDIS_REST_URL=https://<db>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
# or
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Keys are namespaced (`rl:<limiter>:<identifier>`) and expire with the limiter
window. If Redis is configured but temporarily unreachable, each instance
falls back to its local counters and logs a throttled warning, so protection
degrades instead of disappearing.

