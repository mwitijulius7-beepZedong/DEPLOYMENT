/* Service worker: offline shell + fast repeat visits.
 *
 * Navigations are network-first so deployed HTML wins, falling back to the
 * cached shell offline. Scripts/styles are stale-while-revalidate so a deploy
 * reaches the next visit without pinning an old bundle. Images are
 * cache-first. API responses are never cached: they are role- and
 * tenant-dependent, and a shared browser cache could leak premium content.
 */
const VERSION = 'zedong-shell-v5';
const PRECACHE = [
  '/',
  '/about.html',
  '/post.html',
  '/icon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  if (!response || !response.ok) return;
  if ((response.headers.get('Cache-Control') || '').includes('no-store')) return;
  const copy = response.clone();
  caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    cachePut(request, response);
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request).then(response => {
    cachePut(request, response);
    return response;
  });
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
