/**
 * API Client — Frontend-to-Backend Communication
 *
 * Handles JWT authentication, automatic retries, error handling,
 * and request/response interceptors for the Healthcare Referral Tracker.
 *
 * Features:
 *   - Automatic JWT injection from localStorage
 *   - 401 redirect to login on token expiry
 *   - Exponential backoff retry for 5xx errors
 *   - Request/response logging in development
 *   - Base URL configured via environment variable
 */

import { API_BASE_URL } from '@/lib/config';

// ─── CONFIG ───

const BASE_URL = API_BASE_URL;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

// ─── TYPES ───

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface LoginCredentials {
  email?: string;
  phone?: string;
  password: string;
}

export interface LoginResponse {
  success?: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    region: string;
    isPrimaryAdmin: boolean;
    preferences?: Record<string, unknown>;
  };
  twoFactorRequired?: boolean;
  email?: string;
  message?: string;
  error?: { code: string; message: string };
}

// ─── REQUEST HELPERS ───

function getToken(): string | null {
  return localStorage.getItem('healthtrack_jwt_token');
}

function setToken(token: string): void {
  localStorage.setItem('healthtrack_jwt_token', token);
}

function clearToken(): void {
  localStorage.removeItem('healthtrack_jwt_token');
  localStorage.removeItem('healthtrack_current_user');
}

function getDelay(attempt: number): number {
  const jitter = Math.random() * 0.3 + 0.85;
  return Math.round(BASE_DELAY_MS * Math.pow(2, attempt) * jitter);
}

// ─── CORE FETCH ─——

async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  attempt = 0
): Promise<Response> {
  const url = `${BASE_URL}${endpoint}`;
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add region header if available
  const userStr = localStorage.getItem('healthtrack_current_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.region) headers['X-Region'] = user.region;
    } catch { /* ignore */ }
  }

  if (import.meta.env.DEV) {
    console.log(`[API] ${options.method || 'GET'} ${url}`);
  }

  try {
    const res = await fetch(url, { ...options, headers });

    // Handle 401 — token expired or invalid
    if (res.status === 401) {
      const token = getToken();
      if (token) {
        // Use a flag to prevent cascade — only fire session-expired once
        const alreadyFired = (window as any).__healthtrack_session_expired_fired;
        if (!alreadyFired) {
          (window as any).__healthtrack_session_expired_fired = true;
          console.error(`[apiFetch] 401 for ${url} — session expired, firing logout event`);
          window.dispatchEvent(new CustomEvent('healthtrack-session-expired'));
        }
      }
      throw new Error('Session expired. Please log in again.');
    }

    // Retry 5xx errors
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, getDelay(attempt)));
      return apiFetch(endpoint, options, attempt + 1);
    }

    return res;
  } catch (err) {
    // Network error — retry
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, getDelay(attempt)));
      return apiFetch(endpoint, options, attempt + 1);
    }
    throw err;
  }
}

// ─── AUTH API ─——

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const res = await apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Login failed');
  }

  const data: LoginResponse = await res.json();
  if (data.token) setToken(data.token);
  if (data.user) localStorage.setItem('healthtrack_current_user', JSON.stringify(data.user));
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return res.json();
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
  } catch { /* ignore */ }
  clearToken();
}

export async function me(): Promise<LoginResponse['user'] | null> {
  try {
    const res = await apiFetch('/api/v1/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export interface UserSettings {
  language?: string;
  timezone?: string;
  autoLogout?: number;
  notifications?: boolean;
  theme?: string;
  dataRetention?: number;
}

export async function saveSettings(settings: UserSettings): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/auth/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return res.json();
}

// ─── PHONE VERIFICATION ───

export async function requestVerificationCode(phone: string): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/auth/request-verification-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
  return res.json();
}

export async function verifyPhone(phone: string, code: string): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/auth/verify-phone', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
  return res.json();
}

// ─── 2FA ───

export async function get2FAStatus(): Promise<{ enabled: boolean }> {
  const res = await apiFetch('/api/v1/auth/2fa/status');
  const data = await res.json();
  return data.data || { enabled: false };
}

export async function setup2FA(): Promise<{ qrCode: string; secret: string; message: string }> {
  const res = await apiFetch('/api/v1/auth/2fa/setup', { method: 'POST' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Setup failed');
  return data.data;
}

export async function verify2FASetup(token: string): Promise<{ backupCodes: string[]; message: string }> {
  const res = await apiFetch('/api/v1/auth/2fa/verify-setup', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Verification failed');
  return data.data;
}

export async function disable2FA(password: string): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  return res.json();
}

// ─── SYSTEM CONFIG ───

export interface SystemConfig {
  dataRetentionDays: number;
  autoBackupsEnabled: boolean;
  auditLoggingEnabled: boolean;
  lastBackupAt?: string;
  backupCount: number;
  updatedAt: string;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  const res = await apiFetch('/api/v1/system/config');
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  return data.data;
}

export async function updateSystemConfig(updates: Partial<SystemConfig>): Promise<SystemConfig> {
  const res = await apiFetch('/api/v1/system/config', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  return data.data;
}

// ─── DATA EXPORTS ───

export async function exportPatients(format: 'csv' | 'json' = 'json'): Promise<Blob> {
  const res = await apiFetch(`/api/v1/system/export/patients?format=${format}`);
  return res.blob();
}

export async function exportAuditLogs(): Promise<Blob> {
  const res = await apiFetch('/api/v1/system/export/audit-logs');
  return res.blob();
}

export async function verify2FALogin(identifier: string, token: string, backupCode?: string): Promise<LoginResponse> {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const payload: Record<string, string> = { token };
  if (isEmail) payload.email = identifier;
  else payload.phone = identifier;
  if (backupCode) payload.backupCode = backupCode;

  const res = await apiFetch('/api/v1/auth/2fa/login-verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ─── SYNC API ─——

export async function syncPush(body: {
  clientVersion: number;
  deviceId: string;
  region: string;
  changes: unknown[];
}): Promise<ApiResponse> {
  const res = await apiFetch('/sync/push', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function syncPull(body: {
  clientVersion: number;
  deviceId: string;
  region: string;
  entityTypes?: string[];
  limit?: number;
}): Promise<ApiResponse> {
  const res = await apiFetch('/sync/pull', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function syncStatus(): Promise<ApiResponse> {
  const res = await apiFetch('/sync/status');
  return res.json();
}

// ─── EMAIL API ─——

export async function sendWelcomeEmailApi(data: {
  firstName: string;
  email: string;
  role: string;
  tempPassword?: string;
  loginUrl?: string;
}): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/email/welcome', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function sendPatientRegistrationEmailApi(data: {
  to: string;
  patientName: string;
  patientId: string;
  chpName?: string;
  facilityName?: string;
  registrationDate?: string;
}): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/email/patient-registered', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

// ─── USER API ─——

export async function getUsers(): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/users');
  return res.json();
}

export async function getCollectorStations(): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/users/stations');
  return res.json();
}

export async function createUser(data: Record<string, unknown>): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateUser(id: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.json();
}

// ─── PATIENT API ─——

export async function getPatients(): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/patients');
  return res.json();
}

export async function createPatient(data: Record<string, unknown>): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/patients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

// ─── HEALTH CHECK ─——

export async function healthCheck(): Promise<{ ok: boolean; status?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: data.status === 'ok', status: data.status };
  } catch {
    return { ok: false };
  }
}

// ─── REFERRAL V2 API ─——

export async function createReferralV2(data: Record<string, unknown>): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/referrals-v2', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getIncomingReferrals(stationId: string, status?: string, stationName?: string): Promise<ApiResponse> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (stationName) params.append('stationName', stationName);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/v1/referrals-v2/incoming/${stationId}${query}`);
  return res.json();
}

export async function getOutgoingReferrals(stationId: string, status?: string): Promise<ApiResponse> {
  const query = status ? `?status=${status}` : '';
  const res = await apiFetch(`/api/v1/referrals-v2/outgoing/${stationId}${query}`);
  return res.json();
}

export async function acceptReferralV2(id: string): Promise<ApiResponse> {
  const res = await apiFetch(`/api/v1/referrals-v2/${id}/accept`, { method: 'POST' });
  return res.json();
}

export async function updateReferralV2Status(id: string, status: string, rejectedReason?: string): Promise<ApiResponse> {
  const body: Record<string, unknown> = { status };
  if (rejectedReason) body.rejectedReason = rejectedReason;
  const res = await apiFetch(`/api/v1/referrals-v2/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getReferralV2Stats(stationId: string, period?: string): Promise<ApiResponse> {
  const query = period ? `?period=${period}` : '';
  const res = await apiFetch(`/api/v1/referrals-v2/stats/${stationId}${query}`);
  return res.json();
}

export async function getAllReferralsV2(filters?: { status?: string; stationId?: string; period?: string }): Promise<ApiResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.stationId) params.append('stationId', filters.stationId);
  if (filters?.period) params.append('period', filters.period);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/v1/referrals-v2/all${query}`);
  return res.json();
}

// ─── COUNTER-REFERRAL API ─——

export async function createCounterReferral(data: Record<string, unknown>): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/counter-referrals', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getCounterReferralsByStation(stationId: string, status?: string): Promise<ApiResponse> {
  const query = status ? `?status=${status}` : '';
  const res = await apiFetch(`/api/v1/counter-referrals/station/${stationId}${query}`);
  return res.json();
}

export async function getCounterReferralStats(period?: string): Promise<ApiResponse> {
  const query = period ? `?period=${period}` : '';
  const res = await apiFetch(`/api/v1/counter-referrals/stats${query}`);
  return res.json();
}

export async function submitChpFeedback(token: string, data: { recoveryStatus: string; recoveryNotes?: string }): Promise<ApiResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/counter-referrals/chp-form/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getChpFormData(token: string): Promise<ApiResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/chp-feedback/${token}`);
  return res.json();
}

// ─── STATION API ─——

export async function getStations(): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/stations');
  return res.json();
}

export async function seedStations(): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/stations/seed', { method: 'POST' });
  return res.json();
}

// ─── DAILY VISIT API ─——

export async function upsertDailyVisit(data: Record<string, unknown>): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/daily-visits', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function getDailyVisits(stationId?: string): Promise<ApiResponse> {
  const query = stationId ? `?stationId=${stationId}` : '';
  const res = await apiFetch(`/api/v1/daily-visits${query}`);
  return res.json();
}

export async function getDailyVisitStats(stationId: string): Promise<ApiResponse> {
  const res = await apiFetch(`/api/v1/daily-visits/stats/${stationId}`);
  return res.json();
}

export async function deleteDailyVisit(id: string): Promise<ApiResponse> {
  const res = await apiFetch(`/api/v1/daily-visits/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function updateProfile(data: Record<string, unknown>): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/users/me', { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

// ─── AI REPORT API ─——

export async function generateAIReport(type: string, period?: string): Promise<ApiResponse> {
  const query = new URLSearchParams();
  query.append('type', type);
  if (period) query.append('period', period);
  const res = await apiFetch(`/api/v1/referrals-v2/ai-report?${query.toString()}`);
  return res.json();
}

// ─── EXPORT ─——

// ─── AI CHAT API ───

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function sendAIChat(messages: ChatMessage[], context?: { period?: string; stationId?: string }): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, context }),
  });
  return res.json();
}

export async function getChpFollowUpStats(period?: 'monthly' | 'yearly'): Promise<ApiResponse> {
  const query = period ? `?period=${period}` : '';
  const res = await apiFetch(`/api/v1/counter-referrals/stats/all${query}`);
  return res.json();
}

export async function analyzeDiseaseIncidence(period?: 'monthly' | 'yearly', villages?: string[]): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/disease-incidence/analyze', {
    method: 'POST',
    body: JSON.stringify({ period, villages }),
  });
  return res.json();
}

export async function generateAIExportReport(prompt: string, format: 'html' | 'markdown' = 'html'): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/ai/export', {
    method: 'POST',
    body: JSON.stringify({ prompt, format }),
  });
  return res.json();
}

// ─── EMAIL HEALTH API ───

export interface EmailHealthResponse {
  success: boolean;
  configured: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    passConfigured: boolean;
    passLength: number;
  };
  connection: {
    tested: boolean;
    success: boolean;
    error?: string;
  };
  suggestions: string[];
  queue: {
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
    total: number;
  };
}

export async function checkEmailHealth(): Promise<ApiResponse<EmailHealthResponse>> {
  const res = await apiFetch('/api/v1/email/health');
  return res.json();
}

export async function retryQueuedEmails(): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/email/retry', { method: 'POST' });
  return res.json();
}

// ─── CHP ALERT API ───

export async function getChpAlerts(status?: string, priority?: string): Promise<ApiResponse> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (priority) params.append('priority', priority);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/v1/chp-alerts${query}`);
  return res.json();
}

export async function getChpAlertJourney(id: string): Promise<ApiResponse> {
  const res = await apiFetch(`/api/v1/chp-alerts/${id}/journey`);
  return res.json();
}

export async function acknowledgeChpAlert(id: string): Promise<ApiResponse> {
  const res = await apiFetch(`/api/v1/chp-alerts/${id}/ack`, { method: 'PATCH' });
  return res.json();
}

export async function resolveChpAlert(id: string, data?: { resolutionAction?: string; resolutionNotes?: string; followUpReferralId?: string }): Promise<ApiResponse> {
  const res = await apiFetch(`/api/v1/chp-alerts/${id}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify(data || {}),
  });
  return res.json();
}

export async function getChpAlertStats(): Promise<ApiResponse> {
  const res = await apiFetch('/api/v1/chp-alerts/stats');
  return res.json();
}

// ─── EXPORT ───

export { getToken, setToken, clearToken };
export { BASE_URL };
