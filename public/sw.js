// Service Worker for Patient Referral Tracker
// Offline-first caching strategy with background sync and push notifications

const CACHE_NAME = 'patient-referral-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/brand-logo.png',
  '/manifest.json',
];

// ─── INSTALL ─—
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        console.warn('[SW] Some assets could not be cached');
      });
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE ─—
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ─── FETCH ─—
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || request.mode === 'navigate') {
    return;
  }

  // API requests: network-first
  if (request.url.includes('/api/') || request.url.includes('/sync/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML & other: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ─── STRATEGIES ─——

/**
 * Network-First: Try network first, fall back to cache on failure
 * Best for API calls that should be fresh but tolerate offline fallback
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline — request failed', { status: 503 });
  }
}

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
  if (event.tag === 'sync-patienttrack') {
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
  const title = data.title || 'Patient Referral Tracker';
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
