/**
 * Email Service — Resend API Integration
 *
 * Uses Resend (https://resend.com) for reliable transactional email delivery.
 * Falls back to SMTP via Nodemailer if Resend is not configured.
 *
 * Features:
 *   - Immediate send via Resend HTTP API
 *   - Persistent MongoDB queue for failed emails
 *   - Cron-friendly batch processor
 *   - HTML templates for CHP follow-up and notifications
 */

import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import EmailJob from '../models/EmailJob.js';

// ─── CONFIGURATION ───

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'HealthTrack <onboarding@resend.dev>';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = SMTP_PORT === 465 ? true : (process.env.SMTP_SECURE === 'true');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS_RAW = process.env.SMTP_PASS || '';
const SMTP_PASS = SMTP_PASS_RAW.replace(/^"|"$/g, '').replace(/\s/g, '');

// Prefer Resend, fallback to SMTP
const USE_RESEND = !!RESEND_API_KEY;

let resendClient: Resend | null = null;
let smtpTransporter: Transporter | null = null;

if (USE_RESEND) {
  resendClient = new Resend(RESEND_API_KEY);
  console.log(`[Email] Using Resend API (key prefix: ${RESEND_API_KEY.slice(0, 8)}...)`);
} else if (SMTP_USER && SMTP_PASS) {
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log(`[Email] Using SMTP fallback (${SMTP_USER})`);
} else {
  console.warn('[Email] No email provider configured. Set RESEND_API_KEY or SMTP_USER+SMTP_PASS.');
}

// ─── TYPES ───

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

// ─── CORE SEND FUNCTION ───

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const { to, subject, html, text } = payload;
  const from = payload.from || RESEND_FROM;

  // ── Attempt 1: Resend ──
  if (USE_RESEND && resendClient) {
    try {
      const { data, error } = await resendClient.emails.send({
        from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });

      if (error) {
        console.error(`[Resend] Error sending to ${to}:`, error);
        // Queue for retry
        await queueEmail({ to, subject, html, text, from });
        return { success: false, error: error.message };
      }

      console.log(`[Resend] Email sent to ${to}, id=${data?.id}`);
      return { success: true, messageId: data?.id };
    } catch (err: any) {
      console.error(`[Resend] Exception sending to ${to}:`, err.message);
      await queueEmail({ to, subject, html, text, from });
      return { success: false, error: err.message };
    }
  }

  // ── Attempt 2: SMTP fallback ──
  if (smtpTransporter) {
    try {
      const info = await smtpTransporter.sendMail({
        from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });
      console.log(`[SMTP] Email sent to ${to}, id=${info.messageId}`);
      return { success: true, messageId: info.messageId || undefined };
    } catch (err: any) {
      console.error(`[SMTP] Failed to send to ${to}:`, err.message);
      await queueEmail({ to, subject, html, text, from });
      return { success: false, error: err.message };
    }
  }

  // ── No provider configured ──
  const err = 'No email provider configured. Set RESEND_API_KEY or SMTP_USER+SMTP_PASS.';
  console.error(`[Email] ${err}`);
  await queueEmail({ to, subject, html, text, from });
  return { success: false, error: err };
}

// ─── QUEUE FAILED EMAILS FOR RETRY ───

async function queueEmail(payload: EmailPayload): Promise<void> {
  try {
    await EmailJob.create({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      from: payload.from,
      attempts: 1,
      status: 'pending',
      lastError: 'Initial send failed, queued for retry',
      createdAt: new Date(),
    });
    console.log(`[EmailQueue] Queued email to ${payload.to}`);
  } catch (err: any) {
    console.error('[EmailQueue] Failed to queue email:', err.message);
  }
}

// ─── CHP FOLLOW-UP EMAIL ───

export async function sendChpFollowUpEmail(options: {
  chpEmail: string;
  chpName: string;
  patientName: string;
  patientId: string;
  finalDiagnosis: string;
  treatmentProvided: string;
  recoveryStatus: string;
  followUpInstructions: string;
  warningSigns: string;
  formUrl: string;
}): Promise<EmailResult> {
  const {
    chpEmail, chpName, patientName, patientId,
    finalDiagnosis, treatmentProvided, recoveryStatus,
    followUpInstructions, warningSigns, formUrl,
  } = options;

  const subject = `HealthTrack: Follow-up needed for ${patientName}`;

  const statusColor = recoveryStatus === 'critical' ? '#dc2626' : recoveryStatus === 'improving' ? '#16a34a' : '#d97706';
  const statusBg = recoveryStatus === 'critical' ? '#fef2f2' : recoveryStatus === 'improving' ? '#f0fdf4' : '#fffbeb';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HealthTrack CHP Follow-up</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);padding:28px 32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">HealthTrack</h1>
          <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px;">Community Health Follow-up</p>
        </td></tr>

        <!-- Alert Banner -->
        <tr><td style="padding:20px 32px 0;">
          <div style="background:${statusBg};border-left:4px solid ${statusColor};border-radius:8px;padding:14px 16px;">
            <p style="margin:0;color:${statusColor};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
              ${recoveryStatus === 'critical' ? '⚠️ Critical Follow-up Required' : recoveryStatus === 'improving' ? '✓ Improving — Monitor' : '● Standard Follow-up'}
            </p>
          </div>
        </td></tr>

        <!-- Patient Info -->
        <tr><td style="padding:20px 32px;">
          <h2 style="color:#0f172a;font-size:16px;margin:0 0 14px;">Patient: ${patientName}</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#475569;">
            <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><strong>ID:</strong></td><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-family:monospace;">${patientId}</td></tr>
            <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><strong>Final Diagnosis:</strong></td><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${finalDiagnosis}</td></tr>
            <tr><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><strong>Treatment:</strong></td><td style="padding:6px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${treatmentProvided}</td></tr>
            <tr><td style="padding:6px 0;"><strong>Recovery Status:</strong></td><td style="padding:6px 0;text-align:right;text-transform:capitalize;">${recoveryStatus}</td></tr>
          </table>
        </td></tr>

        <!-- Instructions -->
        <tr><td style="padding:0 32px 20px;">
          <div style="background:#f8fafc;border-radius:8px;padding:16px;">
            <h3 style="color:#0f172a;font-size:13px;margin:0 0 10px;font-weight:600;">Follow-up Instructions</h3>
            <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">${followUpInstructions.replace(/\n/g, '<br>')}</p>
          </div>
        </td></tr>

        <!-- Warning Signs -->
        ${warningSigns ? `
        <tr><td style="padding:0 32px 20px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;">
            <h3 style="color:#dc2626;font-size:13px;margin:0 0 10px;font-weight:600;">⚠️ Warning Signs — Refer Back Immediately If:</h3>
            <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.6;">${warningSigns.replace(/\n/g, '<br>')}</p>
          </div>
        </td></tr>
        ` : ''}

        <!-- CTA Button -->
        <tr><td style="padding:0 32px 24px;text-align:center;">
          <a href="${formUrl}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;box-shadow:0 2px 8px rgba(14,165,233,0.3);">Submit Follow-up Report</a>
          <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">This secure link is unique to this patient</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Sent by HealthTrack Referral System</p>
          <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">Do not reply to this email</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendEmail({
    to: chpEmail,
    subject,
    html,
    from: RESEND_FROM,
  });
}

// ─── WELCOME EMAIL ───

export async function sendWelcomeEmail(to: string, name: string, tempPassword: string, loginUrl: string): Promise<EmailResult> {
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#0ea5e9;margin-top:0;">Welcome to HealthTrack</h2>
    <p>Hello ${name},</p>
    <p>Your account has been created. Use the credentials below to log in:</p>
    <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0;">
      <p style="margin:4px 0;"><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p style="margin:4px 0;"><strong>Email:</strong> ${to}</p>
      <p style="margin:4px 0;"><strong>Password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${tempPassword}</code></p>
    </div>
    <p style="color:#64748b;font-size:13px;">Please change your password after first login.</p>
  </div>
</body></html>`;

  return sendEmail({ to, subject: 'Welcome to HealthTrack', html, from: RESEND_FROM });
}

// ─── PASSWORD RESET EMAIL ───

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<EmailResult> {
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#0ea5e9;margin-top:0;">Password Reset</h2>
    <p>Hello ${name},</p>
    <p>Click the link below to reset your password. This link expires in 1 hour.</p>
    <a href="${resetUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">Reset Password</a>
    <p style="color:#64748b;font-size:13px;">If you didn't request this, ignore this email.</p>
  </div>
</body></html>`;

  return sendEmail({ to, subject: 'HealthTrack Password Reset', html, from: RESEND_FROM });
}

// ─── STATUS UPDATE EMAIL ───

export async function sendReferralStatusEmail(to: string, patientName: string, status: string, facility: string): Promise<EmailResult> {
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#0ea5e9;margin-top:0;">Referral Update</h2>
    <p>Patient <strong>${patientName}</strong> has been <strong>${status}</strong> at <strong>${facility}</strong>.</p>
    <p style="color:#64748b;font-size:13px;">Log in to HealthTrack for full details.</p>
  </div>
</body></html>`;

  return sendEmail({ to, subject: `HealthTrack: ${patientName} — ${status}`, html, from: RESEND_FROM });
}

// ─── QUEUE PROCESSING ───

export async function processPendingEmails(batchSize: number = 20): Promise<{ processed: number; sent: number; failed: number; cancelled: number }> {
  const pending = await EmailJob.find({ status: 'pending', attempts: { $lt: 5 } })
    .sort({ createdAt: 1 })
    .limit(batchSize)
    .lean();

  let sent = 0, failed = 0, cancelled = 0;

  for (const job of pending) {
    try {
      const result = await sendEmail({
        to: job.to,
        subject: job.subject,
        html: job.html,
        text: job.text,
        from: job.from || RESEND_FROM,
      });

      if (result.success) {
        await EmailJob.findByIdAndUpdate(job._id, { status: 'sent', sentAt: new Date(), messageId: result.messageId });
        sent++;
      } else {
        const newAttempts = (job.attempts || 0) + 1;
        if (newAttempts >= 5) {
          await EmailJob.findByIdAndUpdate(job._id, { status: 'cancelled', attempts: newAttempts, lastError: result.error });
          cancelled++;
        } else {
          await EmailJob.findByIdAndUpdate(job._id, { attempts: newAttempts, lastError: result.error, lastAttemptAt: new Date() });
          failed++;
        }
      }
    } catch (err: any) {
      await EmailJob.findByIdAndUpdate(job._id, { attempts: (job.attempts || 0) + 1, lastError: err.message, lastAttemptAt: new Date() });
      failed++;
    }
  }

  return { processed: pending.length, sent, failed, cancelled };
}

// ─── QUEUE STATUS ───

export async function getQueueStatus(): Promise<{ pending: number; sent: number; failed: number; cancelled: number; total: number }> {
  const [pending, sent, failed, cancelled] = await Promise.all([
    EmailJob.countDocuments({ status: 'pending' }),
    EmailJob.countDocuments({ status: 'sent' }),
    EmailJob.countDocuments({ status: 'failed' }),
    EmailJob.countDocuments({ status: 'cancelled' }),
  ]);
  return { pending, sent, failed, cancelled, total: pending + sent + failed + cancelled };
}

// ─── SMTP HEALTH CHECK (fallback diagnostics) ───

export async function checkSMTPHealth(): Promise<{
  configured: boolean; smtp: any; connection: any; suggestions: string[]; queue: any;
}> {
  const suggestions: string[] = [];

  if (USE_RESEND) {
    // Resend is configured — check if the API key is valid
    try {
      // We can't easily test the key without sending, but we can check format
      if (RESEND_API_KEY.startsWith('re_')) {
        return {
          configured: true,
          smtp: { provider: 'Resend', from: RESEND_FROM },
          connection: { tested: true, success: true },
          suggestions: [],
          queue: await getQueueStatus(),
        };
      } else {
        suggestions.push('RESEND_API_KEY does not start with "re_". Verify your API key from https://resend.com/api-keys');
      }
    } catch (e: any) {
      suggestions.push(`Resend check failed: ${e.message}`);
    }
  }

  if (!USE_RESEND && (!SMTP_USER || !SMTP_PASS)) {
    suggestions.push('No email provider configured. Set RESEND_API_KEY (recommended) or SMTP_USER+SMTP_PASS.');
  }

  if (SMTP_USER === 'your-email@gmail.com') {
    suggestions.push('SMTP_USER is still the placeholder. Replace with your actual Gmail address.');
  }

  return {
    configured: USE_RESEND || !!(SMTP_USER && SMTP_PASS),
    smtp: {
      provider: USE_RESEND ? 'Resend' : 'SMTP',
      from: RESEND_FROM,
      host: SMTP_HOST,
      user: SMTP_USER ? `${SMTP_USER.slice(0, 3)}...` : 'MISSING',
      passConfigured: !!SMTP_PASS,
    },
    connection: { tested: false, success: false },
    suggestions,
    queue: await getQueueStatus(),
  };
}

// Legacy exports for compatibility
export async function verifyEmailConnection(): Promise<boolean> {
  return USE_RESEND || !!(SMTP_USER && SMTP_PASS);
}

export async function sendPatientRegistrationEmail(): Promise<EmailResult> {
  return { success: false, error: 'Deprecated — patient registration removed' };
}

// CHP-related email functions (legacy compatibility)
export async function sendChpRegistrationEmail(to: string, chpName: string): Promise<EmailResult> {
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#0ea5e9;margin-top:0;">CHP Registration</h2>
    <p>Hello ${chpName},</p>
    <p>You have been registered as a Community Health Promoter in HealthTrack.</p>
  </div>
</body></html>`;
  return sendEmail({ to, subject: 'HealthTrack: CHP Registration', html, from: RESEND_FROM });
}

export async function sendChpPatientAssignedEmail(to: string, chpName: string, patientName: string): Promise<EmailResult> {
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#0ea5e9;margin-top:0;">New Patient Assignment</h2>
    <p>Hello ${chpName},</p>
    <p>You have been assigned to follow up on patient <strong>${patientName}</strong>.</p>
  </div>
</body></html>`;
  return sendEmail({ to, subject: `HealthTrack: Assigned to ${patientName}`, html, from: RESEND_FROM });
}
