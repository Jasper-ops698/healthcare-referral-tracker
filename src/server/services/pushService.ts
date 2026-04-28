/**
 * Push Notification Service — Web Push API
 *
 * Uses web-push library with VAPID keys for secure push delivery.
 * Stores subscriptions in memory (extend to MongoDB for production scale).
 *
 * Environment variables:
 *   VAPID_PUBLIC_KEY   — Base64url-encoded VAPID public key
 *   VAPID_PRIVATE_KEY  — Base64url-encoded VAPID private key
 *   VAPID_SUBJECT      — mailto: or https: contact URL
 */

import webpush from 'web-push';

// ─── CONFIGURATION ───

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:bkitib@gmail.com';

// In-memory subscription store (userId → PushSubscription[])
// For production, persist to MongoDB
const subscriptions = new Map<string, PushSubscription[]>();

let vapidConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  console.log('[Push] VAPID keys configured');
} else {
  console.warn('[Push] VAPID keys not configured. Push notifications disabled.');
}

// ─── TYPES ───

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: { action: string; title: string }[];
}

export interface PushResult {
  success: boolean;
  sent: number;
  failed: number;
  error?: string;
}

// ─── SUBSCRIPTION MANAGEMENT ───

/**
 * Save a push subscription for a user.
 */
export function saveSubscription(userId: string, subscription: PushSubscription): void {
  const existing = subscriptions.get(userId) || [];
  // Deduplicate by endpoint
  const filtered = existing.filter(s => s.endpoint !== subscription.endpoint);
  filtered.push(subscription);
  subscriptions.set(userId, filtered);
  console.log(`[Push] Subscription saved for user ${userId}`);
}

/**
 * Remove a push subscription.
 */
export function removeSubscription(userId: string, endpoint: string): void {
  const existing = subscriptions.get(userId) || [];
  const filtered = existing.filter(s => s.endpoint !== endpoint);
  if (filtered.length === 0) {
    subscriptions.delete(userId);
  } else {
    subscriptions.set(userId, filtered);
  }
}

/**
 * Get all subscriptions for a user.
 */
export function getUserSubscriptions(userId: string): PushSubscription[] {
  return subscriptions.get(userId) || [];
}

// ─── SENDING ───

/**
 * Send push notification to a specific user.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  if (!vapidConfigured) {
    return { success: false, sent: 0, failed: 0, error: 'Push not configured' };
  }

  const subs = getUserSubscriptions(userId);
  if (subs.length === 0) {
    return { success: true, sent: 0, failed: 0 };
  }

  const pushPayload = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as any, pushPayload);
        sent++;
      } catch (error: any) {
        failed++;
        // 410 Gone = subscription expired, remove it
        if (error.statusCode === 410) {
          removeSubscription(userId, sub.endpoint);
        }
        console.warn(`[Push] Failed for ${userId}: ${error.message}`);
      }
    })
  );

  return { success: failed === 0, sent, failed };
}

/**
 * Send push notification to multiple users.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
  const results = await Promise.all(userIds.map(id => sendPushToUser(id, payload)));
  return {
    success: results.every(r => r.success),
    sent: results.reduce((sum, r) => sum + r.sent, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
  };
}

// ─── PREFABRICATED NOTIFICATIONS ───

export function buildReferralPush(patientName: string, status: string, facility: string): PushPayload {
  return {
    title: 'Referral Update',
    body: `${patientName} — status changed to ${status} at ${facility}`,
    icon: '/brand-logo.png',
    badge: '/brand-logo.png',
    tag: 'referral-update',
    data: { type: 'referral', patientName, status },
  };
}

export function buildPatientRegisteredPush(patientName: string, patientId: string): PushPayload {
  return {
    title: 'Patient Registered',
    body: `${patientName} (ID: ${patientId}) has been registered.`,
    icon: '/brand-logo.png',
    badge: '/brand-logo.png',
    tag: 'patient-registered',
    data: { type: 'patient', patientName, patientId },
  };
}

export function buildSecurityPush(alert: string): PushPayload {
  return {
    title: 'Security Alert',
    body: alert,
    icon: '/brand-logo.png',
    badge: '/brand-logo.png',
    tag: 'security-alert',
    data: { type: 'security' },
  };
}

export function buildWelcomePush(firstName: string): PushPayload {
  return {
    title: 'Welcome to HealthTrack',
    body: `Hello ${firstName}, your account is now active.`,
    icon: '/brand-logo.png',
    badge: '/brand-logo.png',
    tag: 'welcome',
    data: { type: 'welcome' },
  };
}

// ─── HEALTH CHECK ───

export function isPushEnabled(): boolean {
  return vapidConfigured;
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}
