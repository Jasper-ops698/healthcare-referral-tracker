/**
 * useNotifications — Push notification subscription & in-app notification center
 *
 * Features:
 *   • Request push permission from browser
 *   • Subscribe to push notifications via service worker
 *   • Unsubscribe on logout
 *   • In-memory notification history (badge count)
 *   • Respects user's push notification preference
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { BASE_URL } from '@/lib/apiClient';

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  tag: string;
  timestamp: number;
  read: boolean;
  data?: Record<string, unknown>;
}

const STORAGE_KEY_HISTORY = 'healthtrack_notifications';
const STORAGE_KEY_PUSH_ENABLED = 'healthtrack_push_enabled';

function loadHistory(): InAppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(history: InAppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 50)));
  } catch { /* ignore */ }
}

/** Check if push notifications are supported */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/** Check current push permission */
export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export function useNotifications() {
  const [history, setHistory] = useState<InAppNotification[]>(loadHistory);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(getPushPermission);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  const unreadCount = history.filter(n => !n.read).length;

  // ─── Load service worker registration ───
  useEffect(() => {
    if (!isPushSupported()) return;
    navigator.serviceWorker.ready.then(reg => {
      swRef.current = reg;
      // Check existing subscription
      reg.pushManager.getSubscription().then(sub => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  // ─── Persist history changes ───
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  // ─── Request permission & subscribe ───
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isPushSupported()) return false;

    setLoading(true);
    try {
      // 1. Request browser permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        return false;
      }

      // 2. Get VAPID public key from server
      const res = await fetch(`${BASE_URL}/api/v1/notifications/vapid-key`);
      if (!res.ok) {
        console.warn('[Push] VAPID key not available');
        setLoading(false);
        return false;
      }
      const { data } = await res.json();
      const vapidKey = data.publicKey;

      // 3. Subscribe via service worker
      const reg = swRef.current || await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      });

      // 4. Send subscription to server
      const token = localStorage.getItem('healthtrack_jwt_token');
      await fetch(`${BASE_URL}/api/v1/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      setIsSubscribed(true);
      localStorage.setItem(STORAGE_KEY_PUSH_ENABLED, 'true');
      setLoading(false);
      return true;
    } catch (err) {
      console.error('[Push] Subscription failed:', err);
      setLoading(false);
      return false;
    }
  }, []);

  // ─── Unsubscribe ───
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) return;

    try {
      const reg = swRef.current || await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();

        const token = localStorage.getItem('healthtrack_jwt_token');
        await fetch(`${BASE_URL}/api/v1/notifications/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }

      setIsSubscribed(false);
      localStorage.removeItem(STORAGE_KEY_PUSH_ENABLED);
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
    }
  }, []);

  // ─── Mark all as read ───
  const markAllRead = useCallback(() => {
    setHistory(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // ─── Mark single as read ───
  const markRead = useCallback((id: string) => {
    setHistory(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  // ─── Clear history ───
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  // ─── Add notification (called when push received) ───
  const addNotification = useCallback((notif: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>) => {
    const entry: InAppNotification = {
      ...notif,
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: Date.now(),
      read: false,
    };
    setHistory(prev => [entry, ...prev].slice(0, 50));
  }, []);

  // ─── Listen for push messages from service worker ───
  useEffect(() => {
    if (!isPushSupported()) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION') {
        addNotification({
          title: event.data.payload.title,
          body: event.data.payload.body,
          tag: event.data.payload.tag || 'general',
          data: event.data.payload.data,
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [addNotification]);

  return {
    history,
    unreadCount,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    markAllRead,
    markRead,
    clearHistory,
    addNotification,
  };
}

// ─── Utility: Base64url to Uint8Array ───
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
}
