/**
 * SMS Service — Africa's Talking Integration
 *
 * Sends counter-referral notifications to CHPs via SMS.
 * Falls back gracefully if SMS is not configured.
 *
 * Setup:
 *   1. Create account at https://africastalking.com
 *   2. Get API key from dashboard
 *   3. Set AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME env vars
 *   4. (Optional) Set AFRICASTALKING_SENDER_ID for branded SMS
 *
 * Cost: ~KES 0.80 per SMS (pay-as-you-go)
 */

import AfricasTalking from 'africastalking';

const API_KEY = process.env.AFRICASTALKING_API_KEY || '';
const USERNAME = process.env.AFRICASTALKING_USERNAME || 'sandbox';
const SENDER_ID = process.env.AFRICASTALKING_SENDER_ID || '';

const USE_SMS = !!API_KEY;

let smsClient: any = null;

if (USE_SMS) {
  smsClient = AfricasTalking({
    apiKey: API_KEY,
    username: USERNAME,
  });
  console.log(`[SMS] Africa's Talking configured (username: ${USERNAME})`);
} else {
  console.log('[SMS] Africa\'s Talking not configured. Set AFRICASTALKING_API_KEY to enable SMS.');
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── SEND COUNTER-REFERRAL SMS TO CHP ───

export async function sendChpCounterReferralSMS(options: {
  chpPhone: string;
  chpName: string;
  patientName: string;
  patientId: string;
  finalDiagnosis: string;
  formUrl: string;
}): Promise<SMSResult> {
  const { chpPhone, chpName, patientName, finalDiagnosis, formUrl } = options;

  if (!USE_SMS || !smsClient) {
    return { success: false, error: 'SMS not configured. Set AFRICASTALKING_API_KEY.' };
  }

  // Normalize Kenyan phone number
  const normalizedPhone = normalizePhoneNumber(chpPhone);
  if (!normalizedPhone) {
    return { success: false, error: `Invalid phone number: ${chpPhone}` };
  }

  // Shorten the message (SMS limit ~320 chars for concatenated)
  // Extract token from formUrl for USSD option
  const tokenMatch = formUrl.match(/chp-feedback\/(.+)$/);
  const token = tokenMatch ? tokenMatch[1] : '';
  const ussdOption = token ? ` Or dial *384*53795# then enter: ${token}` : '';
  const message = `HealthTrack: Hello ${chpName}, patient ${patientName} referred back. Diagnosis: ${truncate(finalDiagnosis, 50)}. Report: ${formUrl}${truncate(ussdOption, 100)}`;

  try {
    const sms = smsClient.SMS;
    const sendOpts: any = {
      to: [normalizedPhone],
      message,
      // Optional: set sender ID if verified on Africa's Talking
      ...(SENDER_ID ? { from: SENDER_ID } : {}),
    };

    const response = await sms.send(sendOpts);
    const result = response.SMSMessageData?.Recipients?.[0];

    if (result && result.status === 'Success') {
      console.log(`[SMS] Sent to ${normalizedPhone}, messageId=${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } else {
      const err = result?.status || 'Unknown error';
      console.error(`[SMS] Failed to ${normalizedPhone}: ${err}`);
      return { success: false, error: err };
    }
  } catch (err: any) {
    console.error(`[SMS] Exception sending to ${normalizedPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── SEND ESCALATION ALERT SMS ───

export async function sendChpEscalationAlert(options: {
  chpPhone: string;
  chpName: string;
  patientName: string;
  priority: 'emergency' | 'urgent' | 'routine';
  symptomsObserved?: string;
  formUrl: string;
}): Promise<SMSResult> {
  const { chpPhone, chpName, patientName, priority, symptomsObserved, formUrl } = options;

  if (!USE_SMS || !smsClient) {
    return { success: false, error: 'SMS not configured' };
  }

  const normalizedPhone = normalizePhoneNumber(chpPhone);
  if (!normalizedPhone) {
    return { success: false, error: `Invalid phone number: ${chpPhone}` };
  }

  const prefix = priority === 'emergency' ? 'URGENT' : priority === 'urgent' ? 'ATTENTION' : 'HealthTrack';
  const symptoms = symptomsObserved ? ` Symptoms: ${truncate(symptomsObserved, 50)}.` : '';
  const message = `${prefix}: ${chpName}, patient ${patientName} needs medical attention.${symptoms} Report: ${formUrl}`;

  try {
    const response = await smsClient.SMS.send({
      to: [normalizedPhone],
      message,
      ...(SENDER_ID ? { from: SENDER_ID } : {}),
    });
    const result = response.SMSMessageData?.Recipients?.[0];
    if (result?.status === 'Success') {
      return { success: true, messageId: result.messageId };
    }
    return { success: false, error: result?.status || 'Failed' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── HELPER: Normalize Kenyan Phone Number ───

function normalizePhoneNumber(phone: string): string | null {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Kenyan number patterns:
  // 2547XXXXXXXX (international with country code)
  // 07XXXXXXXX (local format)
  // 7XXXXXXXX (without leading 0)
  // +2547XXXXXXXX (with plus)

  if (digits.length === 12 && digits.startsWith('2547')) {
    // Already in international format: 2547XXXXXXXX
    return `+${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('2541')) {
    // Airtel format: 2541XXXXXXXX
    return `+${digits}`;
  }

  if (digits.length === 10 && digits.startsWith('07')) {
    // Local Safaricom: 07XXXXXXXX → +2547XXXXXXXX
    return `+254${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith('01')) {
    // Local Airtel: 01XXXXXXXX → +2541XXXXXXXX
    return `+254${digits.slice(1)}`;
  }

  if (digits.length === 9 && digits.startsWith('7')) {
    // Without leading 0: 7XXXXXXXX → +2547XXXXXXXX
    return `+254${digits}`;
  }

  if (digits.length === 9 && digits.startsWith('1')) {
    // Airtel without leading 0: 1XXXXXXXX → +2541XXXXXXXX
    return `+254${digits}`;
  }

  // If it already starts with +, return as-is (strip any extra +)
  if (digits.length === 13 && digits.startsWith('254')) {
    return `+${digits}`;
  }

  // Could not normalize
  console.error(`[SMS] Could not normalize phone number: "${phone}" (digits: ${digits})`);
  return null;
}

// ─── HELPER: Truncate text ───

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

// ─── SEND WELCOME SMS TO NEW USER ───

export async function sendWelcomeSMS(options: {
  phone: string;
  firstName: string;
  tempPassword: string;
  loginUrl: string;
  role: string;
}): Promise<SMSResult> {
  const { phone, firstName, tempPassword, loginUrl, role } = options;

  if (!USE_SMS || !smsClient) {
    return { success: false, error: 'SMS not configured. Set AFRICASTALKING_API_KEY.' };
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { success: false, error: `Invalid phone number: ${phone}` };
  }

  const roleLabel = role === 'admin' ? 'Admin' : 'Collector';
  const message = `HealthTrack: Welcome ${firstName}! Your ${roleLabel} account is ready. Temp password: ${tempPassword}. Login at ${loginUrl}. Change your password after first login.`;

  try {
    const response = await smsClient.SMS.send({
      to: [normalizedPhone],
      message,
      ...(SENDER_ID ? { from: SENDER_ID } : {}),
    });
    const result = response.SMSMessageData?.Recipients?.[0];

    if (result && result.status === 'Success') {
      console.log(`[SMS] Welcome SMS sent to ${normalizedPhone}, messageId=${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } else {
      const err = result?.status || 'Unknown error';
      console.error(`[SMS] Welcome SMS failed to ${normalizedPhone}: ${err}`);
      return { success: false, error: err };
    }
  } catch (err: any) {
    console.error(`[SMS] Welcome SMS exception to ${normalizedPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── SEND VERIFICATION CODE SMS ───

export async function sendVerificationCodeSMS(options: {
  phone: string;
  firstName: string;
  code: string;
}): Promise<SMSResult> {
  const { phone, firstName, code } = options;

  if (!USE_SMS || !smsClient) {
    return { success: false, error: 'SMS not configured. Set AFRICASTALKING_API_KEY.' };
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { success: false, error: `Invalid phone number: ${phone}` };
  }

  const message = `HealthTrack: Hello ${firstName}, your verification code is: ${code}. Valid for 15 minutes. Do not share this code with anyone.`;

  try {
    const response = await smsClient.SMS.send({
      to: [normalizedPhone],
      message,
      ...(SENDER_ID ? { from: SENDER_ID } : {}),
    });
    const result = response.SMSMessageData?.Recipients?.[0];

    if (result && result.status === 'Success') {
      console.log(`[SMS] Verification code sent to ${normalizedPhone}`);
      return { success: true, messageId: result.messageId };
    } else {
      const err = result?.status || 'Unknown error';
      return { success: false, error: err };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── SEND PASSWORD RESET CODE SMS ───

export async function sendPasswordResetSMS(options: {
  phone: string;
  firstName: string;
  resetCode: string;
}): Promise<SMSResult> {
  const { phone, firstName, resetCode } = options;

  if (!USE_SMS || !smsClient) {
    return { success: false, error: 'SMS not configured. Set AFRICASTALKING_API_KEY.' };
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { success: false, error: `Invalid phone number: ${phone}` };
  }

  const message = `HealthTrack: Hello ${firstName}, your password reset code is: ${resetCode}. Valid for 15 minutes. If you didn't request this, contact your administrator.`;

  try {
    const response = await smsClient.SMS.send({
      to: [normalizedPhone],
      message,
      ...(SENDER_ID ? { from: SENDER_ID } : {}),
    });
    const result = response.SMSMessageData?.Recipients?.[0];

    if (result && result.status === 'Success') {
      console.log(`[SMS] Password reset code sent to ${normalizedPhone}`);
      return { success: true, messageId: result.messageId };
    } else {
      const err = result?.status || 'Unknown error';
      return { success: false, error: err };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── NOTIFY ORIGINAL COLLECTOR THAT PATIENT WAS DISCHARGED ───

export async function sendCollectorDischargeSMS(options: {
  collectorPhone: string;
  collectorName: string;
  patientName: string;
  patientId: string;
  destinationFacility: string;
  finalDiagnosis: string;
  chpName: string;
  recoveryStatus: string;
}): Promise<SMSResult> {
  const { collectorPhone, collectorName, patientName, patientId, destinationFacility, finalDiagnosis, chpName, recoveryStatus } = options;

  if (!USE_SMS || !smsClient) {
    return { success: false, error: 'SMS not configured. Set AFRICASTALKING_API_KEY.' };
  }

  const normalizedPhone = normalizePhoneNumber(collectorPhone);
  if (!normalizedPhone) {
    return { success: false, error: `Invalid collector phone number: ${collectorPhone}` };
  }

  // Format recovery status for SMS
  const statusMap: Record<string, string> = {
    'fully-recovered': 'Fully Recovered',
    'partially-recovered': 'Partially Recovered',
    'still-unwell': 'Still Unwell',
    'deceased': 'Deceased',
    'lost-to-follow-up': 'Lost to Follow-up',
  };
  const readableStatus = statusMap[recoveryStatus] || recoveryStatus;

  const message = `HealthTrack: Hello ${collectorName}, your patient ${patientName} (ID: ${patientId}) has been discharged from ${destinationFacility}. Diagnosis: ${truncate(finalDiagnosis, 50)}. Status: ${readableStatus}. CHP ${chpName} assigned for community follow-up. Thank you.`;

  try {
    const response = await smsClient.SMS.send({
      to: [normalizedPhone],
      message,
      ...(SENDER_ID ? { from: SENDER_ID } : {}),
    });
    const result = response.SMSMessageData?.Recipients?.[0];

    if (result && result.status === 'Success') {
      console.log(`[SMS] Discharge notification sent to collector ${normalizedPhone}, messageId=${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } else {
      const err = result?.status || 'Unknown error';
      console.error(`[SMS] Discharge notification failed to collector ${normalizedPhone}: ${err}`);
      return { success: false, error: err };
    }
  } catch (err: any) {
    console.error(`[SMS] Discharge notification exception to collector ${normalizedPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── HEALTH CHECK ───

export function checkSMSHealth(): { configured: boolean; provider: string; username: string } {
  return {
    configured: USE_SMS,
    provider: USE_SMS ? "Africa's Talking" : 'None',
    username: USERNAME,
  };
}
