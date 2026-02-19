/* ============================================================
   ABIDE - Service Worker
   Caching strategy + push notification handler
   ============================================================ */

const SW_VERSION = 'abide-v3';
const STATIC_CACHE = `${SW_VERSION}-static`;
const CONTENT_CACHE = `${SW_VERSION}-content`;

const STATIC_ASSETS = [
  '/faith/',
  '/faith/index.html',
  '/faith/offline.html',
  '/faith/manifest.json',
  '/faith/css/app.css',
  '/faith/css/components.css',
  '/faith/css/views.css',
  '/faith/css/animations.css',
  '/faith/js/date.js',
  '/faith/js/store.js',
  '/faith/js/api.js',
  '/faith/js/router.js',
  '/faith/js/notifications.js',
  '/faith/js/app.js',
  '/faith/js/views/home.js',
  '/faith/js/views/devotion.js',
  '/faith/js/views/scripture.js',
  '/faith/js/views/prayer.js',
  '/faith/js/views/journal.js',
  '/faith/js/views/plan.js',
  '/faith/js/views/settings.js',
  '/faith/assets/fonts/playfair-display.woff2',
  '/faith/assets/fonts/inter.woff2',
];

// --- Install: cache static assets ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Cache what we can, ignore individual failures (fonts may not exist yet)
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => null))
      );
    })
  );
  self.skipWaiting();
});

// --- Activate: clean old caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== CONTENT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// --- Fetch: routing strategy ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.hostname.includes('bible-api.com')) return;

  // Bible API: network first, fallback to cache
  if (url.hostname.includes('bible-api.com')) {
    event.respondWith(networkFirst(request, CONTENT_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // Content JSON files: network first, cache fallback
  if (url.pathname.includes('/faith/content/')) {
    event.respondWith(networkFirst(request, CONTENT_CACHE, 60 * 60));
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(STATIC_CACHE);
      return cache.match('/faith/offline.html') || new Response('Offline', { status: 503 });
    }
    throw err;
  }
}

async function networkFirst(request, cacheName, maxAgeSeconds = 3600) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('{"error":"offline"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// --- Push Notifications ---
// iOS Note: 'actions' are NOT supported on iOS. Keep options minimal for compatibility.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Abide', body: event.data.text() };
  }

  const title = data.title || 'Abide';

  // iOS-compatible options — no 'actions' field (unsupported on iOS)
  const options = {
    body: data.body || 'Time to spend a moment with God.',
    icon: '/faith/icons/icon-192.png',
    badge: '/faith/icons/icon-192.png',
    tag: data.tag || 'abide-reminder',
    renotify: true,
    silent: false,
    data: { url: data.url || '/faith/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/faith/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existingClient = clientList.find(c => c.url.includes('/faith/'));
      if (existingClient) {
        return existingClient.focus();
      }
      return clients.openWindow(url);
    })
  );
});
