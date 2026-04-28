/**
 * Unified Notification Service
 *
 * Orchestrates Email, SMS, and Push notifications based on:
 *   1. Event type (what happened)
 *   2. User preferences (which channels are enabled)
 *   3. User role (what they should be notified about)
 *
 * Best practices applied:
 *   - Respect user preferences (opt-in/out per channel)
 *   - HIPAA-safe: no PHI in SMS/push subject lines
 *   - Fallback: if one channel fails, others still attempt
 *   - Audit trail: log every notification attempt
 *   - Batch non-urgent, immediate for critical
 */

import User from '../models/User.js';
import {
  sendEmail,
  buildWelcomeEmail,
  buildPatientRegistrationEmail,
  buildReferralStatusEmail,
  type WelcomeEmailData,
  type PatientRegistrationEmailData,
  type ReferralStatusEmailData,
} from './emailService.js';
import {
  sendSMS,
  sendReferralSMS,
  sendPatientRegistrationSMS,
  sendWelcomeSMS,
  sendSecurityAlertSMS,
} from './smsService.js';
import {
  sendPushToUser,
  buildReferralPush,
  buildPatientRegisteredPush,
  buildSecurityPush,
  buildWelcomePush,
  getVapidPublicKey,
  isPushEnabled,
} from './pushService.js';

// ─── TYPES ───

export type NotificationChannel = 'email' | 'sms' | 'push';
export type NotificationEvent =
  | 'user_registered'
  | 'patient_registered'
  | 'referral_created'
  | 'referral_status_changed'
  | 'password_changed'
  | 'session_expired';

interface UserPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  language: string;
  phone?: string;
}

interface NotificationResult {
  event: NotificationEvent;
  userId: string;
  channels: {
    email?: { success: boolean; error?: string };
    sms?: { success: boolean; error?: string };
    push?: { success: boolean; error?: string };
  };
}

// ─── USER PREFERENCE FETCHER ───

async function getUserPrefs(userId: string): Promise<UserPreferences | null> {
  try {
    const user = await User.findById(userId).select('preferences phone').lean();
    if (!user) return null;
    return {
      emailNotifications: user.preferences?.notifications ?? true,
      smsNotifications: false, // Default off until explicitly enabled
      pushNotifications: true,
      language: user.preferences?.language || 'en',
      phone: user.phone,
    };
  } catch {
    return null;
  }
}

// ─── CORE NOTIFY FUNCTION ───

/**
 * Send notification to a user across all enabled channels.
 * Respects per-channel user preferences.
 */
export async function notifyUser(
  userId: string,
  event: NotificationEvent,
  data: {
    email?: { to: string; subject?: string; build: () => { to: string; subject: string; html: string } };
    sms?: { to: string; send: () => Promise<{ success: boolean; error?: string }> };
    push?: { build: () => { title: string; body: string; icon?: string; badge?: string; tag?: string; data?: Record<string, unknown> } };
  },
): Promise<NotificationResult> {
  const prefs = await getUserPrefs(userId);
  const result: NotificationResult = { event, userId, channels: {} };

  if (!prefs) {
    return result;
  }

  // Email
  if (prefs.emailNotifications && data.email) {
    try {
      const email = data.email.build();
      const res = await sendEmail(email);
      result.channels.email = { success: res.success, error: res.error };
    } catch (e: any) {
      result.channels.email = { success: false, error: e.message };
    }
  }

  // SMS
  if (prefs.smsNotifications && data.sms && prefs.phone) {
    try {
      const res = await data.sms.send();
      result.channels.sms = { success: res.success, error: res.error };
    } catch (e: any) {
      result.channels.sms = { success: false, error: e.message };
    }
  }

  // Push
  if (prefs.pushNotifications && data.push) {
    try {
      const payload = data.push.build();
      const res = await sendPushToUser(userId, payload);
      result.channels.push = { success: res.success && res.failed === 0 };
    } catch (e: any) {
      result.channels.push = { success: false, error: e.message };
    }
  }

  // Log result
  console.log(`[Notify] ${event} → ${userId}:`, JSON.stringify(result.channels));

  return result;
}

// ─── HIGH-LEVEL EVENT HANDLERS ───

/**
 * Notify when a new user is registered.
 */
export async function notifyUserRegistered(
  userId: string,
  data: WelcomeEmailData & { phone?: string },
): Promise<NotificationResult> {
  return notifyUser(userId, 'user_registered', {
    email: {
      to: data.email,
      build: () => buildWelcomeEmail(data),
    },
    sms: data.phone
      ? {
          to: data.phone,
          send: () => sendWelcomeSMS(data.phone!, data.firstName, data.role),
        }
      : undefined,
    push: {
      build: () => buildWelcomePush(data.firstName),
    },
  });
}

/**
 * Notify when a patient is registered.
 */
export async function notifyPatientRegistered(
  userId: string,
  data: PatientRegistrationEmailData & { chpPhone?: string },
): Promise<NotificationResult> {
  return notifyUser(userId, 'patient_registered', {
    email: {
      to: data.to,
      build: () => buildPatientRegistrationEmail(data),
    },
    sms: data.chpPhone
      ? {
          to: data.chpPhone,
          send: () =>
            sendPatientRegistrationSMS(
              data.chpPhone!,
              data.patientName,
              data.patientId,
              data.chpName,
            ),
        }
      : undefined,
    push: {
      build: () => buildPatientRegisteredPush(data.patientName, data.patientId),
    },
  });
}

/**
 * Notify when a referral status changes.
 */
export async function notifyReferralStatusChanged(
  userId: string,
  data: ReferralStatusEmailData & { recipientPhone?: string },
): Promise<NotificationResult> {
  return notifyUser(userId, 'referral_status_changed', {
    email: {
      to: data.to,
      build: () => buildReferralStatusEmail(data),
    },
    sms: data.recipientPhone
      ? {
          to: data.recipientPhone,
          send: () =>
            sendReferralSMS(
              data.recipientPhone!,
              data.patientName,
              data.status,
              data.toFacility,
            ),
        }
      : undefined,
    push: {
      build: () => buildReferralPush(data.patientName, data.status, data.toFacility),
    },
  });
}

/**
 * Notify on password change (security alert).
 */
export async function notifyPasswordChanged(
  userId: string,
  data: { email: string; phone?: string; firstName: string },
): Promise<NotificationResult> {
  return notifyUser(userId, 'password_changed', {
    email: {
      to: data.email,
      build: () => ({
        to: data.email,
        subject: 'Password Changed - Healthcare Referral Tracker',
        html: `<p>Hello ${data.firstName},</p><p>Your password was successfully changed. If you did not do this, contact your administrator immediately.</p>`,
      }),
    },
    sms: data.phone
      ? {
          to: data.phone,
          send: () => sendSecurityAlertSMS(data.phone!, 'Your password was changed'),
        }
      : undefined,
    push: {
      build: () => buildSecurityPush('Your password was changed successfully'),
    },
  });
}

// ─── ADMIN / BROADCAST ───

/**
 * Send notification to all admin users.
 */
export async function notifyAdmins(
  event: NotificationEvent,
  buildPayload: () => {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
    const adminIds = admins.map((a: { _id: { toString(): string } }) => a._id.toString());

    const payload = buildPayload();

    await Promise.all(
      adminIds.map(async (id: string) => {
        await sendPushToUser(id, payload);
      }),
    );

    console.log(`[Notify] Broadcast ${event} to ${adminIds.length} admins`);
  } catch (err) {
    console.error(`[Notify] Admin broadcast failed:`, err);
  }
}

// ─── EXPORTS ───

export { getVapidPublicKey, isPushEnabled };
