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
import type { SyncStatus } from '@/lib/syncTypes';

interface SyncContextType {
  status: SyncStatus;
  pendingCount: number;
  lastSyncTime: string | null;
  isOnline: boolean;
  triggerSync: () => Promise<boolean>;
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncManagerRef = useRef<ReturnType<typeof getSyncManager> | null>(null);

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
      return;
    }

    const token = localStorage.getItem('healthtrack_jwt_token');
    if (!token) return; // Local-only auth — no server sync possible

    const manager = getSyncManager();
    syncManagerRef.current = manager;

    // Set auth token and subscribe
    manager.setAuthToken(token);
    const unsubscribe = manager.onStatusChange((s) => {
      setStatus(s);
      if (s === 'idle' || s === 'error' || s === 'offline') {
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
    <SyncContext.Provider value={{ status, pendingCount, lastSyncTime, isOnline, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}
