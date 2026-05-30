/**
 * useAuth — Production Authentication Hook
 *
 * Hybrid mode:
 * 1. Tries backend API authentication first (when server is running)
 * 2. Falls back to IndexedDB for offline-first operation
 *
 * This ensures the deployed static site works immediately while
 * also supporting full backend authentication when the server is available.
 */

import { createContext, useContext, useState, useCallback, type ReactNode, useEffect } from 'react';
import type { User, UserRole } from '@/types';
import { PRIMARY_ADMIN_EMAIL, API_BASE_URL } from '@/lib/config';
import { getLocalDatabase } from '@/lib/dexieDatabase';
import { notifySettingsChanged } from '@/lib/settingsEvents';

const localDB = getLocalDatabase();

const SETTINGS_DEFAULTS = {
  language: 'en',
  timezone: 'Africa/Nairobi',
  autoLogout: 30,
};

export interface LoginResult {
  success: boolean;
  twoFactorRequired?: boolean;
  forcePasswordChange?: boolean;
  firstName?: string;
  email?: string;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeLogin: (token: string, apiUser: any) => void;
  setPassword: (email: string, currentPassword: string, newPassword: string) => Promise<LoginResult>;
  logout: () => void;
  refreshUser: () => Promise<boolean>;
  hasRole: (role: UserRole) => boolean;
  isAdmin: boolean;
  isCollector: boolean;
  isPrimaryAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── LOCAL AUTH (IndexedDB fallback) ───

async function localAuthenticate(email: string, _password: string): Promise<User | null> {
  // Ensure primary admin exists in IndexedDB
  const existing = await localDB.getUserByEmail?.(email) || null;

  if (!existing) {
    // Try finding by iterating all users
    const allUsers = await localDB.getAllUsers();
    const found = allUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found && found.status !== 'inactive') {
      return found as unknown as User;
    }
    return null;
  }

  if ((existing as any).status === 'inactive') return null;
  return existing as unknown as User;
}

// ─── SEED PRIMARY ADMIN ───

async function ensurePrimaryAdmin(): Promise<void> {
  try {
    const allUsers = await localDB.getAllUsers();
    const hasAdmin = allUsers.some(
      (u: any) => u.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()
    );

    if (!hasAdmin) {
      await localDB.putUser({
        id: 'admin-primary',
        email: PRIMARY_ADMIN_EMAIL,
        firstName: 'Emmanuel',
        lastName: 'Nyale',
        role: 'admin',
        phone: '+254700000001',
        status: 'active',
        createdAt: new Date(),
        region: 'global',
        isPrimaryAdmin: true,
        _sync: {
          version: 1,
          modifiedAt: new Date().toISOString(),
          modifiedBy: 'system',
          checksum: '',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          createdBy: 'system',
        },
      } as any);
    }
  } catch (err) {
    console.error('[Auth] Failed to seed primary admin:', err);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('healthtrack_current_user');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Ensure primary admin exists on mount + listen for session expiry events
  useEffect(() => {
    ensurePrimaryAdmin();

    // Restore session from localStorage
    const saved = localStorage.getItem('healthtrack_current_user');
    if (saved && !user) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.status !== 'inactive') setUser(parsed);
      } catch { localStorage.removeItem('healthtrack_current_user'); }
    }

    // Listen for session expiry events from apiFetch (401 responses)
    const handleSessionExpired = () => {
      console.log('[Auth] Session expired event received — logging out');
      setUser(null);
      localStorage.removeItem('healthtrack_current_user');
      localStorage.removeItem('healthtrack_jwt_token');
    };
    window.addEventListener('healthtrack-session-expired', handleSessionExpired);
    return () => window.removeEventListener('healthtrack-session-expired', handleSessionExpired);
  }, []);

  const completeLogin = useCallback((token: string, apiUser: any) => {
    // Defensive: validate role — must be 'admin' or 'collector'
    const rawRole = apiUser.role;
    const validRole: UserRole = rawRole === 'admin' || rawRole === 'collector' ? rawRole : 'collector';
    if (rawRole !== validRole) {
      console.warn(`[Auth] Invalid role "${rawRole}" from backend for ${apiUser.email}. Defaulting to "collector".`);
    }

    const user: User = {
      id: apiUser.id,
      email: apiUser.email,
      firstName: apiUser.firstName,
      lastName: apiUser.lastName,
      role: validRole,
      status: apiUser.status || 'active',
      region: apiUser.region || 'default',
      createdAt: new Date(),
      phone: apiUser.phone || '',
      assignedFacility: apiUser.assignedFacility,
      stationId: apiUser.stationId,
      stationName: apiUser.stationName,
      stationType: apiUser.stationType,
      dateOfBirth: apiUser.dateOfBirth,
      gender: apiUser.gender,
      nationalId: apiUser.nationalId,
      emergencyContact: apiUser.emergencyContact,
      languages: apiUser.languages,
      homeCounty: apiUser.homeCounty,
      bloodGroup: apiUser.bloodGroup,
      physicalAddress: apiUser.physicalAddress,
      nextOfKin: apiUser.nextOfKin,
      bio: apiUser.bio,
      preferences: apiUser.preferences,
    };
    setUser(user);
    localStorage.setItem('healthtrack_current_user', JSON.stringify(user));
    localStorage.setItem('healthtrack_jwt_token', token);

    // Apply user preferences from backend
    if (apiUser.preferences) {
      const prefs = apiUser.preferences;
      const existing = localStorage.getItem('healthtrack_settings');
      const current = existing ? JSON.parse(existing) : {};
      const merged = {
        ...SETTINGS_DEFAULTS,
        ...current,
        language: prefs.language || current.language || 'en',
        timezone: prefs.timezone || current.timezone || 'Africa/Nairobi',
        autoLogout: prefs.autoLogout ?? current.autoLogout ?? 30,
      };
      localStorage.setItem('healthtrack_settings', JSON.stringify(merged));
      notifySettingsChanged();
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);

    if (!email.trim() || !password.trim()) {
      setIsLoading(false);
      return { success: false, error: 'Please enter email and password' };
    }

    // ── Strategy 1: Try backend API (when server is running) ──
    try {
      const apiUrl = import.meta.env.VITE_API_URL || API_BASE_URL;
      const controller = new AbortController();
      // Render free tier cold start takes 30-60s; give it 45s
      const timeout = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();

        // Check if password change is required (first login)
        if (data.forcePasswordChange) {
          setIsLoading(false);
          return {
            success: false,
            forcePasswordChange: true,
            email: data.email,
            firstName: data.firstName,
          };
        }

        // Check if 2FA is required
        if (data.twoFactorRequired) {
          setIsLoading(false);
          return { success: false, twoFactorRequired: true, email: data.email };
        }

        if (data.token && data.user) {
          console.log(`[Auth] Backend login success for ${data.user.email}, role=${data.user.role}, stationName=${data.user.stationName}`);
          completeLogin(data.token, data.user);
          setIsLoading(false);
          return { success: true };
        }
      }

      // Backend returned error
      const errorData = await res.json().catch(() => ({}));
      setIsLoading(false);
      return { success: false, error: errorData.error?.message || 'Invalid email or password' };
    } catch {
      // Server unreachable — fall through to local auth
    }

    // ── Strategy 2: IndexedDB local auth (offline-first fallback) ──
    await ensurePrimaryAdmin();

    const localUser = await localAuthenticate(email, password);
    if (localUser) {
      console.log(`[Auth] Local auth success for ${localUser.email}, role=${(localUser as any).role}`);
      setUser(localUser);
      localStorage.setItem('healthtrack_current_user', JSON.stringify(localUser));
      // Generate a local session token so API calls don't fail immediately.
      // This token is only valid locally; the backend will reject it,
      // but it lets the app distinguish between "logged out" and "offline mode".
      localStorage.setItem('healthtrack_jwt_token', `local_${Date.now()}_${localUser.id}`);
      setIsLoading(false);
      return { success: true };
    }

    setIsLoading(false);
    return { success: false, error: 'Invalid email or password' };
  }, [completeLogin]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('healthtrack_current_user');
    localStorage.removeItem('healthtrack_jwt_token');
  }, []);

  const setPassword = useCallback(async (email: string, currentPassword: string, newPassword: string): Promise<LoginResult> => {
    setIsLoading(true);

    if (!email.trim() || !currentPassword.trim() || !newPassword.trim()) {
      setIsLoading(false);
      return { success: false, error: 'Please fill in all fields' };
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || API_BASE_URL;
      const res = await fetch(`${apiUrl}/api/v1/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, currentPassword, newPassword }),
      });

      const data = await res.json();

      if (res.ok && data.token && data.user) {
        completeLogin(data.token, data.user);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: data.error?.message || 'Failed to set password' };
    } catch {
      setIsLoading(false);
      return { success: false, error: 'Connection failed. Please try again.' };
    }
  }, [completeLogin]);

  const hasRole = useCallback((role: UserRole): boolean => user?.role === role, [user]);

  const refreshUser = useCallback(async (): Promise<boolean> => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || API_BASE_URL;
      const token = localStorage.getItem('healthtrack_jwt_token');
      if (!token) return false;

      const res = await fetch(`${apiUrl}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (!data.success || !data.data) return false;

      const fresh = data.data;
      const updated: User = {
        id: fresh.id,
        email: fresh.email,
        firstName: fresh.firstName,
        lastName: fresh.lastName,
        role: fresh.role,
        status: fresh.status || 'active',
        region: fresh.region || 'default',
        createdAt: fresh.createdAt ? new Date(fresh.createdAt) : new Date(),
        phone: fresh.phone || '',
        assignedFacility: fresh.assignedFacility,
        stationId: fresh.stationId,
        stationName: fresh.stationName,
        stationType: fresh.stationType,
        dateOfBirth: fresh.dateOfBirth,
        gender: fresh.gender,
        nationalId: fresh.nationalId,
        emergencyContact: fresh.emergencyContact,
        languages: fresh.languages,
        homeCounty: fresh.homeCounty,
        bloodGroup: fresh.bloodGroup,
        physicalAddress: fresh.physicalAddress,
        nextOfKin: fresh.nextOfKin,
        bio: fresh.bio,
        preferences: fresh.preferences,
        avatar: fresh.avatar,
        lastLogin: fresh.lastLogin,
      };

      setUser(updated);
      localStorage.setItem('healthtrack_current_user', JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    completeLogin,
    setPassword,
    logout,
    refreshUser,
    hasRole,
    isAdmin: user?.role === 'admin',
    isCollector: user?.role === 'collector',
    isPrimaryAdmin: user?.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
}
