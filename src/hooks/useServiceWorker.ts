/**
 * Service Worker Registration — PWA Support
 *
 * Registers the service worker for offline caching,
 * background sync, and push notifications.
 */

import { useEffect } from 'react';

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration.scope);

        // Check for updates every hour
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      })
      .catch((error) => {
        console.error('[SW] Registration failed:', error);
      });
  }
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
