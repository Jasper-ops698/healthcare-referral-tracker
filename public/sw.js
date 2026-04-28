/**
 * Service Worker — Offline-First Caching Strategy
 *
 * This service worker implements a Cache-First strategy for static assets,
 * ensuring the app works offline after the first visit.
 *
 * Strategies:
 *   - Static assets (JS, CSS, HTML): Cache-first, stale-while-revalidate
 *   - API calls: Network-first with offline fallback
 *   - Images: Cache-first
 */

const CACHE_NAME = 'healthtrack-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/brand-logo.png',
];

// ─── INSTALL ───

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Skip waiting to activate immediately
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATE ───

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    // Clean up old caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// ─── FETCH ─——

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API requests (let them go to network for live data)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sync/')) {
    return;
  }

  // Strategy 1: Cache-first for static assets
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Strategy 2: Stale-while-revalidate for everything else
  event.respondWith(staleWhileRevalidate(request));
});

// ─── STRATEGIES ─——

/**
 * Cache-First: Serve from cache immediately, fetch from network in background
 * for updates. Best for static assets that rarely change.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    // Revalidate in background
    fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
    }).catch(() => { /* offline — use cached version */ });

    return cached;
  }

  // Not in cache — fetch and store
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline — resource not cached', { status: 503 });
  }
}

/**
 * Stale-While-Revalidate: Return cached version immediately, update cache
 * from network in background. Balances speed and freshness.
 */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const networkPromise = fetch(request).then((response) => {
    if (response.ok) {
      caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached); // Fallback to cache on network error

  return cached || networkPromise;
}

// ─── HELPERS ─——

function isStaticAsset(request) {
  const dest = request.destination;
  return dest === 'script' || dest === 'style' || dest === 'image' || dest === 'font';
}

// ─── OFFLINE SYNC (Background Sync) ─——

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-healthtrack') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // When connection is restored, trigger IndexedDB sync via the client
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_NOW' });
  });
}

// ─── PUSH NOTIFICATIONS ─——

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Healthcare Referral Tracker';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/brand-logo.png',
    badge: '/brand-logo.png',
    tag: data.tag || 'default',
    requireInteraction: false,
    data: data.data || {},
  };

  // Show OS notification
  const showNotif = self.registration.showNotification(title, options);

  // Also notify all open clients so the in-app bell updates
  const notifyClients = self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_NOTIFICATION',
        payload: { title, body: options.body, tag: options.tag, data: options.data },
      });
    });
  });

  event.waitUntil(Promise.all([showNotif, notifyClients]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow('/')
  );
});
