/**
 * Service Worker Registration — PWA Support
 *
 * Registers the service worker for offline caching,
 * background sync, and push notifications.
 */

import { useEffect } from 'react';

/**
 * EMERGENCY: Unregister stale service workers.
 *
 * The old service worker (healthtrack-v1) caches index.html which
 * references hashed asset filenames (JS/CSS) that change on every
 * build. When a new deployment goes live, the cached HTML still
 * points to old filenames that no longer exist → blank page.
 *
 * This clears all SW registrations and their caches on startup,
 * then skips registration until the SW caching strategy is fixed.
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Step 1: Unregister ALL existing service workers
  const registrations = await navigator.serviceWorker.getRegistrations();
  let hadStaleSw = false;
  for (const reg of registrations) {
    console.log('[SW] Unregistering stale service worker:', reg.scope);
    await reg.unregister();
    hadStaleSw = true;
  }

  // Step 2: Clear all caches
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      console.log('[SW] Deleting stale cache:', name);
      await caches.delete(name);
    }
  }

  // Step 3: If we removed a stale SW, reload once to get fresh files
  if (hadStaleSw) {
    console.log('[SW] Stale service worker removed — reloading for fresh assets');
    window.location.reload();
    return;
  }

  // No stale SW — register normally (with proper cache busting)
  navigator.serviceWorker
    .register('/sw.js?v=2')
    .then((registration) => {
      console.log('[SW] Registered:', registration.scope);
      setInterval(() => registration.update(), 60 * 60 * 1000);
    })
    .catch((error) => {
      console.error('[SW] Registration failed:', error);
    });
}

export function useServiceWorker() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
}

/**
 * Request background sync permission.
 * Called after offline data changes to queue sync.
 */
export async function requestSync() {
  if ('serviceWorker' in navigator && 'sync' in (ServiceWorkerRegistration as any).prototype) {
    try {
      const registration = await navigator.serviceWorker.ready as any;
      await registration.sync?.register('sync-healthtrack');
      console.log('[SW] Background sync registered');
    } catch (error) {
      console.warn('[SW] Background sync not available:', error);
    }
  }
}

/**
 * Check if the app is currently offline.
 */
export function isOffline(): boolean {
  return !navigator.onLine;
}

/**
 * Listen for online/offline events.
 */
export function useNetworkStatus(callback?: (online: boolean) => void) {
  useEffect(() => {
    const handleOnline = () => callback?.(true);
    const handleOffline = () => callback?.(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [callback]);
}
