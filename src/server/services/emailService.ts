/**
 * Email Service — Production-Ready SMTP with Persistent Retry Queue
 *
 * Features:
 *   - Immediate send attempt via Gmail SMTP (SSL 465, fallback TLS 587)
 *   - Persistent MongoDB queue for failed emails
 *   - Cron-friendly batch processor
 *   - Delivery status tracking per email
 *   - HTML templates for all notification types
 *   - SMTP health check with detailed diagnostics
 */

import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import EmailJob from '../models/EmailJob.js';

// ─── CONFIGURATION ───

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
// CRITICAL: Port 465 requires SSL (secure=true). Port 587 uses STARTTLS (secure=false).
// Force correct setting based on port to prevent "Connection closed" errors.
const SMTP_SECURE = SMTP_PORT === 465 ? true : (process.env.SMTP_SECURE === 'true');
const SMTP_USER = process.env.SMTP_USER || 'bkitib@gmail.com';
// Remove ALL spaces from Gmail app passwords (e.g., "ab cd ef gh" -> "abcdefgh")
const SMTP_PASS_RAW = process.env.SMTP_PASS || '';
const SMTP_PASS = SMTP_PASS_RAW.replace(/^"|"$/g, '').replace(/\s/g, '');
const SMTP_FROM = process.env.SMTP_FROM || 'Healthcare Referral Tracker <bkitib@gmail.com>';

console.log(`[Email Config] Host: ${SMTP_HOST}, Port: ${SMTP_PORT}, Secure: ${SMTP_SECURE} (forced for port ${SMTP_PORT}), User: ${SMTP_USER}, Pass length: ${SMTP_PASS.length}`);

// ─── TRANSPORTER ───

let transporter: Transporter | null = null;
let transportError: string | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    // Validate credentials before creating
    if (!SMTP_USER || !SMTP_PASS) {
      throw new Error(`SMTP credentials missing: USER=${SMTP_USER ? 'set' : 'MISSING'}, PASS=${SMTP_PASS ? 'set (' + SMTP_PASS.length + ' chars)' : 'MISSING'}. Set SMTP_USER and SMTP_PASS environment variables.`);
    }
    if (SMTP_PASS.length !== 16) {
      console.warn(`[Email] SMTP_PASS is ${SMTP_PASS.length} chars (expected 16 for Gmail App Password). Verify your App Password is correct.`);
    }

    const config: any = {
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: true,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development',
    };

    // Gmail-specific: if using port 587, disable secure and enable STARTTLS
    if (SMTP_PORT === 587) {
      config.secure = false;
      config.tls = { rejectUnauthorized: true, ciphers: 'SSLv3' };
      config.requireTLS = true;
    }

    transporter = nodemailer.createTransport(config);
  }
  return transporter;
}

// ─── TYPES ───

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  jobId?: string;
}

export interface WelcomeEmailData {
  firstName: string;
  email: string;
  role: string;
  tempPassword?: string;
  loginUrl: string;
}

export interface PatientRegistrationEmailData {
  to: string;
  patientName: string;
  patientId: string;
  chpName: string;
  facilityName: string;
  registrationDate: string;
}

export interface ReferralStatusEmailData {
  to: string;
  patientName: string;
  status: string;
  fromFacility: string;
  toFacility: string;
  updatedBy: string;
  notes?: string;
}

export interface PasswordResetEmailData {
  to: string;
  firstName: string;
  resetToken: string;
  resetUrl: string;
  expiresIn: string;
}

export interface ChpRegistrationEmailData {
  to: string;
  chpName: string;
  chpId: string;
  facilityName: string;
  registeredBy: string;
  phone: string;
  village: string;
  county: string;
}

export interface ChpPatientAssignedEmailData {
  to: string;
  chpName: string;
  patientName: string;
  patientId: string;
  patientPhone: string;
  patientCondition: string;
  collectorName: string;
  facilityName: string;
  assignedDate: string;
}

export interface SMTPHealthResult {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passConfigured: boolean;
  passLength: number;
  connectionTested: boolean;
  connectionSuccess: boolean;
  error?: string;
  suggestions?: string[];
}

// ─── HEALTH CHECK ───

export async function checkSMTPHealth(): Promise<SMTPHealthResult> {
  const result: SMTPHealthResult = {
    configured: !!(SMTP_HOST && SMTP_USER && SMTP_PASS),
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    user: SMTP_USER,
    passConfigured: !!SMTP_PASS,
    passLength: SMTP_PASS.length,
    connectionTested: false,
    connectionSuccess: false,
    suggestions: [],
  };

  if (!SMTP_PASS) {
    result.error = 'SMTP_PASS not configured. Add it in Render dashboard Environment settings.';
    result.suggestions?.push('Go to Render Dashboard → your service → Environment → Add SMTP_PASS');
    result.suggestions?.push('Generate App Password at https://myaccount.google.com/apppasswords (requires 2-Step Verification)');
    return result;
  }

  // Warn about common port/security mismatches
  if (SMTP_PORT === 465 && !SMTP_SECURE) {
    result.suggestions?.push('Note: Port 465 forced SSL on. If connection still fails, try port 587 with SMTP_SECURE=false.');
  }

  if (SMTP_PASS.length !== 16) {
    result.suggestions?.push(`Warning: App Password is ${SMTP_PASS.length} chars. Gmail App Passwords are exactly 16 characters.`);
  }

  try {
    const transport = getTransporter();
    await transport.verify();
    result.connectionTested = true;
    result.connectionSuccess = true;
    console.log('[Email] SMTP connection verified successfully');
  } catch (err) {
    result.connectionTested = true;
    result.connectionSuccess = false;
    const errMsg = err instanceof Error ? err.message : String(err);
    result.error = errMsg;

    if (errMsg.includes('Invalid login')) {
      result.suggestions?.push('Invalid login: Use a Gmail App Password (not your regular Gmail password)');
      result.suggestions?.push('Generate one at https://myaccount.google.com/apppasswords');
      result.suggestions?.push('Make sure 2-Step Verification is enabled on the Gmail account');
    }
    if (errMsg.includes('Application-specific password required')) {
      result.suggestions?.push('Google requires an App Password. Go to https://myaccount.google.com/apppasswords');
    }
    if (errMsg.includes('connect') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED')) {
      result.suggestions?.push(`Connection failed on port ${SMTP_PORT}. Try port 587 with SMTP_SECURE=false (STARTTLS)`);
      result.suggestions?.push('Alternative: Try port 465 with SMTP_SECURE=true (SSL)');
    }
    if (errMsg.includes(' Less secure')) {
      result.suggestions?.push('"Less secure app access" is disabled. Use an App Password instead.');
    }

    console.error(`[Email] SMTP health check FAILED: ${errMsg}`);
  }

  return result;
}

// ─── CORE SEND ─——

export async function sendEmail(
  options: SendMailOptions,
  emailType?: string,
  userId?: string,
  patientId?: string,
  relatedEntity?: string
): Promise<EmailResult> {
  try {
    const transport = getTransporter();
    const result = await transport.sendMail({ from: SMTP_FROM, ...options });
    console.log(`[Email] SENT: ${result.messageId} to ${options.to}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] FAILED to send to ${options.to}: ${errMsg}`);

    try {
      const job = await EmailJob.create({
        to: String(options.to || ''),
        subject: String(options.subject || ''),
        html: String(options.html || ''),
        text: options.text ? String(options.text) : undefined,
        status: 'pending',
        retries: 0,
        maxRetries: 5,
        lastError: errMsg,
        scheduledFor: new Date(Date.now() + 60_000),
        emailType: emailType || 'notification',
        userId,
        patientId,
        relatedEntity,
      });
      console.log(`[Email] Queued for retry: jobId=${job._id}`);
      return { success: false, error: errMsg, jobId: String(job._id) };
    } catch (queueError) {
      const queueErr = queueError instanceof Error ? queueError.message : String(queueError);
      console.error(`[Email] CRITICAL: Failed to queue email: ${queueErr}`);
      return { success: false, error: `Send failed: ${errMsg}. Queue failed: ${queueErr}` };
    }
  }
}

export async function verifyEmailConnection(): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.verify();
    return true;
  } catch {
    return false;
  }
}

// ─── CRON PROCESSOR ───

export async function processPendingEmails(batchSize = 10): Promise<{
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0, cancelled: 0 };

  try {
    const now = new Date();
    const pendingJobs = await EmailJob.find({
      status: { $in: ['pending', 'failed'] },
      scheduledFor: { $lte: now },
    }).sort({ createdAt: 1 }).limit(batchSize).exec();

    for (const job of pendingJobs) {
      stats.processed++;
      if (job.retries >= job.maxRetries) {
        job.status = 'cancelled';
        await job.save();
        stats.cancelled++;
        console.error(`[Email] Max retries exceeded for ${job.to}: jobId=${job._id}`);
        continue;
      }
      try {
        const transport = getTransporter();
        const result = await transport.sendMail({
          from: SMTP_FROM,
          to: job.to,
          subject: job.subject,
          html: job.html,
          text: job.text,
        });
        job.status = 'sent';
        job.messageId = result.messageId;
        job.sentAt = new Date();
        job.lastError = undefined;
        await job.save();
        stats.sent++;
        console.log(`[Email] DELIVERED: ${result.messageId} jobId=${job._id}`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown';
        job.retries++;
        job.lastError = errMsg;
        job.status = 'failed';
        job.scheduledFor = new Date(Date.now() + Math.pow(2, job.retries) * 60_000);
        await job.save();
        stats.failed++;
        console.warn(`[Email] Retry ${job.retries}/${job.maxRetries} failed: ${errMsg} jobId=${job._id}`);
      }
    }

    return stats;
  } catch (err) {
    console.error('[Email] processPendingEmails error:', err);
    return stats;
  }
}

// ─── STATS ───

export async function getEmailStats(userEmail: string): Promise<{
  pending: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const [pending, sent, failed, cancelled] = await Promise.all([
    EmailJob.countDocuments({ to: userEmail, status: 'pending' }),
    EmailJob.countDocuments({ to: userEmail, status: 'sent' }),
    EmailJob.countDocuments({ to: userEmail, status: 'failed' }),
    EmailJob.countDocuments({ to: userEmail, status: 'cancelled' }),
  ]);
  return { pending, sent, failed, cancelled };
}

export async function getQueueStatus(): Promise<{
  pending: number;
  sent: number;
  failed: number;
  cancelled: number;
  total: number;
}> {
  const [pending, sent, failed, cancelled] = await Promise.all([
    EmailJob.countDocuments({ status: 'pending' }),
    EmailJob.countDocuments({ status: 'sent' }),
    EmailJob.countDocuments({ status: 'failed' }),
    EmailJob.countDocuments({ status: 'cancelled' }),
  ]);
  return { pending, sent, failed, cancelled, total: pending + sent + failed + cancelled };
}

// ─── TEMPLATES ───

function baseTemplate(title: string, content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
<style>body{margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;}.container{max-width:600px;margin:0 auto;background:#ffffff;}.header{background:linear-gradient(135deg,#0c4a6e 0%,#0d9488 100%);padding:32px;text-align:center;}.header h1{color:#ffffff;margin:0;font-size:22px;font-weight:600;}.body{padding:32px;}.body h2{color:#0f172a;margin:0 0 16px;font-size:18px;}.body p{color:#475569;line-height:1.6;margin:0 0 12px;}.box{background:#f1f5f9;border-radius:8px;padding:20px;margin:20px 0;}.box p{color:#334155;margin:6px 0;font-size:14px;}.password-box{background:#0c4a6e;border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center;}.password-box code{color:#ffffff;font-family:'Courier New',monospace;font-size:20px;font-weight:600;letter-spacing:1px;}.btn{display:inline-block;background:#0c4a6e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:500;margin:16px 0;}.footer{padding:20px;text-align:center;background:#f1f5f9;}.footer p{color:#94a3b8;font-size:12px;margin:0;}</style>
</head><body><div class="container"><div class="header"><h1>Healthcare Referral Tracker</h1></div><div class="body">${content}</div><div class="footer"><p>This is an automated message from Healthcare Referral Tracker &copy; ${new Date().getFullYear()}</p><p style="margin-top:8px;">NCMTC | National Centre for Medical Training & Consultancy</p></div></div></body></html>`;
}

export function buildWelcomeEmail(data: WelcomeEmailData): SendMailOptions {
  const subject = 'Welcome to Healthcare Referral Tracker - Your Account is Ready';
  const content = `
    <h2>Hello ${data.firstName},</h2>
    <p>Your account has been created on the <strong>Healthcare Referral Tracker</strong> system.</p>
    <p>You have been assigned the role of <strong>${data.role === 'admin' ? 'Administrator' : 'Collector'}</strong>.</p>
    ${data.tempPassword ? `
    <p>Here is your temporary password to sign in:</p>
    <div class="password-box">
      <code>${data.tempPassword}</code>
    </div>
    <p style="color:#dc2626;font-weight:600;font-size:13px;">For security, you will be required to change this password on your first login.</p>
    ` : ''}
    <div class="box">
      <p><strong>Sign-in URL:</strong> <a href="${data.loginUrl}">${data.loginUrl}</a></p>
      <p><strong>Email:</strong> ${data.email}</p>
      ${data.tempPassword ? `<p><strong>Temp Password:</strong> ${data.tempPassword}</p>` : ''}
    </div>
    <a href="${data.loginUrl}" class="btn">Sign In Now</a>
    <p style="font-size:12px;color:#94a3b8;margin-top:20px;">If you did not request this account, please contact your administrator immediately.</p>
  `;

  return {
    to: data.email,
    subject,
    html: baseTemplate(subject, content),
    text: `Welcome to Healthcare Referral Tracker, ${data.firstName}! Role: ${data.role} Email: ${data.email} ${data.tempPassword ? `Temp Password: ${data.tempPassword} (must change on first login)` : ''} Sign in: ${data.loginUrl}`,
  };
}

export function buildPatientRegistrationEmail(data: PatientRegistrationEmailData): SendMailOptions {
  const subject = `New Patient Registered - ${data.patientName}`;
  const content = `
    <h2>New Patient Registration</h2>
    <p>A new patient has been registered in the system.</p>
    <div class="box">
      <p><strong>Patient:</strong> ${data.patientName}</p>
      <p><strong>Patient ID:</strong> ${data.patientId}</p>
      <p><strong>Registered by:</strong> ${data.chpName}</p>
      <p><strong>Facility:</strong> ${data.facilityName}</p>
      <p><strong>Date:</strong> ${data.registrationDate}</p>
    </div>
  `;

  return {
    to: data.to,
    subject,
    html: baseTemplate(subject, content),
    text: `New patient registered: ${data.patientName} (${data.patientId}) by ${data.chpName} at ${data.facilityName} on ${data.registrationDate}.`,
  };
}

export function buildReferralStatusEmail(data: ReferralStatusEmailData): SendMailOptions {
  const subject = `Referral Update - ${data.patientName} is now ${data.status}`;
  const content = `
    <h2>Referral Status Update</h2>
    <p>The referral for <strong>${data.patientName}</strong> has been updated.</p>
    <div class="box">
      <p><strong>Status:</strong> ${data.status}</p>
      <p><strong>From:</strong> ${data.fromFacility}</p>
      <p><strong>To:</strong> ${data.toFacility}</p>
      <p><strong>Updated by:</strong> ${data.updatedBy}</p>
      ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
    </div>
  `;

  return {
    to: data.to,
    subject,
    html: baseTemplate(subject, content),
    text: `Referral update for ${data.patientName}: now ${data.status}. From ${data.fromFacility} to ${data.toFacility}. Updated by ${data.updatedBy}.`,
  };
}

export function buildPasswordResetEmail(data: PasswordResetEmailData): SendMailOptions {
  const subject = 'Password Reset Request - Healthcare Referral Tracker';
  const content = `
    <h2>Password Reset</h2>
    <p>Hello ${data.firstName},</p>
    <p>A password reset was requested for your account.</p>
    <div class="box">
      <p><strong>Reset URL:</strong> <a href="${data.resetUrl}">${data.resetUrl}</a></p>
      <p><strong>Expires in:</strong> ${data.expiresIn}</p>
    </div>
    <p>If you did not request this reset, please ignore this email or contact your administrator.</p>
  `;

  return {
    to: data.to,
    subject,
    html: baseTemplate(subject, content),
    text: `Password reset for ${data.firstName}. Use this link: ${data.resetUrl} (expires in ${data.expiresIn}). If you didn't request this, contact your administrator.`,
  };
}

// ─── SEND WRAPPERS ───

export function sendWelcomeEmail(data: WelcomeEmailData): Promise<EmailResult> {
  const options = buildWelcomeEmail(data);
  return sendEmail(options, 'welcome', data.email, undefined, data.role);
}

export function sendPatientRegistrationEmail(data: PatientRegistrationEmailData): Promise<EmailResult> {
  const options = buildPatientRegistrationEmail(data);
  return sendEmail(options, 'patient_registered', undefined, data.patientId, data.facilityName);
}

export function sendReferralStatusEmail(data: ReferralStatusEmailData): Promise<EmailResult> {
  const options = buildReferralStatusEmail(data);
  return sendEmail(options, 'referral_update', undefined, data.patientName, data.toFacility);
}

export function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<EmailResult> {
  const options = buildPasswordResetEmail(data);
  return sendEmail(options, 'password_reset', data.to);
}

export function resendWelcomeEmail(data: WelcomeEmailData): Promise<EmailResult> {
  return sendWelcomeEmail(data);
}

// ═══════════════════════════════════════════════════════════════════════
// CHP EMAILS
// ═══════════════════════════════════════════════════════════════════════

export function buildChpRegistrationEmail(data: ChpRegistrationEmailData): SendMailOptions {
  const subject = 'Welcome to HealthTrack — CHP Registration Confirmed';
  const content = `
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:20px;margin:20px 0;">
      <h3 style="color:#065f46;margin-top:0;">Dear ${data.chpName},</h3>
      <p style="font-size:15px;">
        You have been successfully registered as a <strong>Community Health Promoter (CHP)</strong>
        in the HealthTrack system by <strong>${data.registeredBy}</strong>.
      </p>
      <div style="background:#fff;border-radius:6px;padding:15px;margin-top:15px;">
        <h4 style="color:#374151;margin-top:0;">Your Registration Details</h4>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;width:40%;"><strong>CHP ID:</strong></td><td style="padding:6px 0;">${data.chpId}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Full Name:</strong></td><td style="padding:6px 0;">${data.chpName}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Phone:</strong></td><td style="padding:6px 0;">${data.phone}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Location:</strong></td><td style="padding:6px 0;">${data.village}, ${data.county}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Facility:</strong></td><td style="padding:6px 0;">${data.facilityName || 'Not assigned yet'}</td></tr>
        </table>
      </div>
      <p style="margin-top:20px;font-size:14px;color:#4b5563;">
        As a registered CHP, you will be assigned patients who need accompaniment
        through their referral journey. You will receive an email notification each
        time a new patient is assigned to you.
      </p>
      <p style="font-size:13px;color:#6b7280;">
        If you have any questions, please contact your supervisor or the facility administrator.
      </p>
    </div>
  `;
  return {
    to: data.to,
    subject,
    html: baseTemplate(subject, content),
    text: `Dear ${data.chpName}, you have been registered as a CHP in HealthTrack. CHP ID: ${data.chpId}. Facility: ${data.facilityName || 'Not assigned'}. Phone: ${data.phone}.`,
  };
}

export function buildChpPatientAssignedEmail(data: ChpPatientAssignedEmailData): SendMailOptions {
  const subject = `New Patient Assigned — ${data.patientName}`;
  const content = `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;margin:20px 0;">
      <h3 style="color:#1e40af;margin-top:0;">Dear ${data.chpName},</h3>
      <p style="font-size:15px;">
        A new patient has been <strong>assigned to you</strong> by <strong>${data.collectorName}</strong>
        at <strong>${data.facilityName}</strong>.
      </p>
      <div style="background:#fff;border-radius:6px;padding:15px;margin-top:15px;">
        <h4 style="color:#374151;margin-top:0;">Patient Details</h4>
        <table style="width:100%;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;width:40%;"><strong>Patient ID:</strong></td><td style="padding:6px 0;">${data.patientId}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Full Name:</strong></td><td style="padding:6px 0;">${data.patientName}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Phone:</strong></td><td style="padding:6px 0;">${data.patientPhone || 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Condition:</strong></td><td style="padding:6px 0;">${data.patientCondition || 'Not specified'}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;"><strong>Assigned Date:</strong></td><td style="padding:6px 0;">${data.assignedDate}</td></tr>
        </table>
      </div>
      <p style="margin-top:20px;font-size:14px;color:#4b5563;">
        Please follow up with this patient and ensure they receive the care they need
        throughout their referral journey. Update their referral stages in the HealthTrack
        system as they progress.
      </p>
    </div>
  `;
  return {
    to: data.to,
    subject,
    html: baseTemplate(subject, content),
    text: `Dear ${data.chpName}, a new patient ${data.patientName} (${data.patientId}) has been assigned to you by ${data.collectorName} at ${data.facilityName}.`,
  };
}

// ─── CHP SEND WRAPPERS ───

export function sendChpRegistrationEmail(data: ChpRegistrationEmailData): Promise<EmailResult> {
  const options = buildChpRegistrationEmail(data);
  return sendEmail(options, 'chp_registration', data.to);
}

export function sendChpPatientAssignedEmail(data: ChpPatientAssignedEmailData): Promise<EmailResult> {
  const options = buildChpPatientAssignedEmail(data);
  return sendEmail(options, 'chp_patient_assigned', data.to, data.patientId, data.facilityName);
}

// ═══════════════════════════════════════════════════════════════════════

export function buildNotificationEmail(
  to: string,
  notification: { title: string; body: string; priority: 'low' | 'normal' | 'high' }
): SendMailOptions {
  const priorityColors = { low: '#3b82f6', normal: '#8b5cf6', high: '#ef4444' };
  const subject = `${notification.priority === 'high' ? '🔴 ' : ''}${notification.title}`;
  const content = `
    <h2>${notification.title}</h2>
    <p style="color:${priorityColors[notification.priority]};font-weight:600;">
      Priority: ${notification.priority.toUpperCase()}
    </p>
    <p>${notification.body}</p>
  `;

  return {
    to,
    subject,
    html: baseTemplate(notification.title, content),
    text: `${notification.title}\nPriority: ${notification.priority}\n\n${notification.body}`,
  };
}
