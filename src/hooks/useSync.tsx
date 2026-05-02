/**
 * SyncProvider — MedSyncManager Lifecycle Manager
 *
 * Automatically initializes the sync engine when a user authenticates,
 * sets the JWT auth token, starts periodic push/pull, and tears down
 * on logout.
 */

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getSyncManager } from '@/lib/syncEngine';
import { API_BASE_URL } from '@/lib/config';
import type { SyncStatus } from '@/lib/syncTypes';
import { toast } from 'sonner';

interface SyncContextType {
  status: SyncStatus;
  pendingCount: number;
  lastSyncTime: string | null;
  isOnline: boolean;
  triggerSync: () => Promise<boolean>;
  needsReLogin: boolean;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function useSync(): SyncContextType {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be within SyncProvider');
  return ctx;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [needsReLogin, setNeedsReLogin] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncManagerRef = useRef<ReturnType<typeof getSyncManager> | null>(null);
  const warnedRef = useRef(false);

  // ── Detect if user has local token but backend is online ──
  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;

    const token = localStorage.getItem('healthtrack_jwt_token') || '';
    if (!token.startsWith('local_')) {
      setNeedsReLogin(false);
      warnedRef.current = false;
      return;
    }

    // User has local token and we're online — check if backend is reachable
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/users`, {
          method: 'HEAD',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        // If we get 401, the backend is awake but rejects our local token
        if (res.status === 401 && !warnedRef.current) {
          warnedRef.current = true;
          setNeedsReLogin(true);
          toast.error('Your session is in offline mode. Please log out and log back in to sync your data to the server.', {
            duration: 10000,
            action: {
              label: 'Re-Login',
              onClick: () => {
                window.location.href = '/logout';
              },
            },
          });
        }
      } catch {
        // Backend still cold — don't warn yet
      }
    };

    // Check after 5s delay (give backend time to wake up if just came online)
    const t = setTimeout(checkBackend, 5000);
    return () => clearTimeout(t);
  }, [isAuthenticated, isOnline]);

  // ── Initialize / teardown based on auth state ──
  useEffect(() => {
    if (!isAuthenticated) {
      if (syncManagerRef.current) {
        syncManagerRef.current.stopAutoSync();
        syncManagerRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setStatus('idle');
      setNeedsReLogin(false);
      warnedRef.current = false;
      return;
    }

    const token = localStorage.getItem('healthtrack_jwt_token') || '';

    const manager = getSyncManager();
    syncManagerRef.current = manager;

    // Set auth token — sync engine will try even with local_ token
    manager.setAuthToken(token);

    // Recover items stuck in 'syncing' from previous crashed sessions
    manager.recoverStuckItems().then((count) => {
      if (count > 0) console.log(`[Sync] Recovered ${count} stuck items`);
    }).catch(() => {});

    const unsubscribe = manager.onStatusChange((s) => {
      setStatus(s);
      if (s === 'idle') {
        setLastSyncTime(new Date().toISOString());
        // Notify data hooks to re-fetch from backend
        window.dispatchEvent(new CustomEvent('healthtrack-sync-success'));
      } else if (s === 'error' || s === 'offline') {
        setLastSyncTime(new Date().toISOString());
      }
    });

    // Start periodic sync (30s) + immediate first sync
    manager.startAutoSync(30000);
    manager.sync().catch(() => {});

    // Poll pending count for UI badges
    intervalRef.current = setInterval(async () => {
      try {
        const count = await manager.getPendingCount();
        setPendingCount(count);
      } catch { /* ignore */ }
    }, 5000);

    return () => {
      unsubscribe();
      manager.stopAutoSync();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated]);

  // ── Monitor online/offline ──
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (syncManagerRef.current && isAuthenticated) {
        syncManagerRef.current.sync().catch(() => {});
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAuthenticated]);

  const triggerSync = async (): Promise<boolean> => {
    if (!syncManagerRef.current) return false;
    return syncManagerRef.current.sync();
  };

  return (
    <SyncContext.Provider value={{ status, pendingCount, lastSyncTime, isOnline, triggerSync, needsReLogin }}>
      {children}
    </SyncContext.Provider>
  );
}
