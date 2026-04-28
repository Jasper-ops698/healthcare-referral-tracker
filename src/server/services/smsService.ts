/**
 * SMS Service — Healthcare Notification via Africa's Talking
 *
 * Best practice for Kenya: Africa's Talking offers local routes,
 * affordable pricing (KES 0.3-1.2/SMS), and reliable delivery.
 *
 * Environment variables:
 *   AT_API_KEY    — Africa's Talking API key
 *   AT_USERNAME   — Africa's Talking username (default: sandbox)
 *   AT_FROM       — Sender ID (optional)
 */

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const AT_API_KEY = process.env.AT_API_KEY || '';
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const AT_FROM = process.env.AT_FROM || '';

/**
 * Send SMS via Africa's Talking REST API.
 * Falls back gracefully if credentials are not configured.
 */
export async function sendSMS(to: string, message: string): Promise<SMSResult> {
  if (!AT_API_KEY) {
    console.warn('[SMS] Africa\'s Talking API key not configured. SMS not sent.');
    return { success: false, error: 'SMS provider not configured' };
  }

  // Normalize phone: ensure +254 prefix for Kenya
  let phone = to.trim();
  if (phone.startsWith('0')) {
    phone = '+254' + phone.substring(1);
  }
  if (!phone.startsWith('+')) {
    phone = '+' + phone;
  }

  try {
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': AT_API_KEY,
      },
      body: new URLSearchParams({
        username: AT_USERNAME,
        to: phone,
        message: message.substring(0, 480), // GSM limit safeguard
        ...(AT_FROM ? { from: AT_FROM } : {}),
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();
    const msg = data.SMSMessageData?.Recipients?.[0];

    if (msg && msg.status === 'Success') {
      console.log(`[SMS] Sent to ${phone}: ${msg.messageId}`);
      return { success: true, messageId: msg.messageId };
    } else {
      const status = msg?.status || 'Unknown';
      throw new Error(`Delivery status: ${status}`);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SMS] Failed to ${phone}: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

/**
 * Send referral notification SMS — short, actionable message.
 */
export async function sendReferralSMS(
  to: string,
  patientName: string,
  status: string,
  facility: string,
): Promise<SMSResult> {
  const msg = `HealthTrack: Referral for ${patientName} is now ${status.toUpperCase()} at ${facility}. Log in for details.`;
  return sendSMS(to, msg);
}

/**
 * Send patient registration confirmation SMS.
 */
export async function sendPatientRegistrationSMS(
  to: string,
  patientName: string,
  patientId: string,
  chpName: string,
): Promise<SMSResult> {
  const msg = `HealthTrack: Patient ${patientName} (ID: ${patientId}) registered by ${chpName}. Record saved successfully.`;
  return sendSMS(to, msg);
}

/**
 * Send welcome SMS with login credentials.
 */
export async function sendWelcomeSMS(
  to: string,
  firstName: string,
  role: string,
): Promise<SMSResult> {
  const msg = `Welcome to HealthTrack, ${firstName}! Your ${role} account is active. Login at the web portal.`;
  return sendSMS(to, msg);
}

/**
 * Send security alert SMS (password changed, etc).
 */
export async function sendSecurityAlertSMS(
  to: string,
  alert: string,
): Promise<SMSResult> {
  const msg = `HealthTrack Security: ${alert}. If this wasn't you, contact your administrator immediately.`;
  return sendSMS(to, msg);
}

/**
 * Health check for SMS service.
 */
export function isSMSEnabled(): boolean {
  return !!AT_API_KEY && AT_USERNAME !== 'sandbox';
}
