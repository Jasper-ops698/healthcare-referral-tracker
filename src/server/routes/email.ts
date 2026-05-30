/**
 * Email API Routes — Secure endpoint for sending notifications
 *
 * All routes require admin authentication.
 * The actual SMTP credentials never leave the server.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  sendWelcomeEmail,
  sendPatientRegistrationEmail,
  sendReferralStatusEmail,
  sendPasswordResetEmail,
  verifyEmailConnection,
  getQueueStatus,
  checkSMTPHealth,
  sendEmail,
  processPendingEmails,
} from '../services/emailService.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

const router = Router();

// ─── HEALTH CHECK ───

router.get('/health', async (_req: Request, res: Response) => {
  const health = await checkSMTPHealth();
  const queue = await getQueueStatus();

  res.status(health.connectionSuccess ? 200 : 503).json({
    success: health.connectionSuccess,
    configured: health.configured,
    smtp: {
      host: health.host,
      port: health.port,
      secure: health.secure,
      user: health.user,
      passConfigured: health.passConfigured,
      passLength: health.passLength,
    },
    connection: {
      tested: health.connectionTested,
      success: health.connectionSuccess,
      error: health.error,
    },
    suggestions: health.suggestions,
    queue,
  });
});

// ─── SEND WELCOME EMAIL ───

router.post('/welcome', async (req: Request, res: Response) => {
  try {
    const { firstName, email, role, tempPassword, loginUrl } = req.body;

    if (!firstName || !email || !role) {
      res.status(400).json({ success: false, error: 'Missing required fields: firstName, email, role' });
      return;
    }

    const result = await sendWelcomeEmail({
      firstName,
      email,
      role,
      tempPassword,
      loginUrl: loginUrl || 'https://oizwnscb3c4jm.kimi.show',
    });

    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send welcome email',
    });
  }
});

// ─── SEND PATIENT REGISTRATION EMAIL ───

router.post('/patient-registered', async (req: Request, res: Response) => {
  try {
    const { to, patientName, patientId, chpName, facilityName, registrationDate } = req.body;

    if (!to || !patientName || !patientId) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const result = await sendPatientRegistrationEmail({
      to,
      patientName,
      patientId,
      chpName: chpName || 'Healthcare Staff',
      facilityName: facilityName || 'Community Health Center',
      registrationDate: registrationDate || new Date().toLocaleDateString(),
    });

    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    });
  }
});

// ─── SEND REFERRAL STATUS EMAIL ───

router.post('/referral-status', async (req: Request, res: Response) => {
  try {
    const { to, patientName, status, fromFacility, toFacility, updatedBy, notes } = req.body;

    if (!to || !patientName || !status) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const result = await sendReferralStatusEmail({
      to,
      patientName,
      status,
      fromFacility: fromFacility || 'Community Health Center',
      toFacility: toFacility || 'Referral Hospital',
      updatedBy: updatedBy || 'System',
      notes,
    });

    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    });
  }
});

// ─── SEND PASSWORD RESET EMAIL ───

router.post('/password-reset', async (req: Request, res: Response) => {
  try {
    const { to, firstName, resetToken, resetUrl, expiresIn } = req.body;

    if (!to || !firstName || !resetToken) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const result = await sendPasswordResetEmail({
      to,
      firstName,
      resetToken,
      resetUrl: resetUrl || `https://oizwnscb3c4jm.kimi.show/reset-password?token=${resetToken}`,
      expiresIn: expiresIn || '24 hours',
    });

    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    });
  }
});

// ─── SEND CUSTOM EMAIL ───

router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, subject, text, html } = req.body;

    if (!to || !subject) {
      res.status(400).json({ success: false, error: 'Missing required fields: to, subject' });
      return;
    }

    const result = await sendEmail({ to, subject, text, html });
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    });
  }
});

// ─── QUEUE STATUS ───

router.get('/queue', async (_req: Request, res: Response) => {
  const queue = await getQueueStatus();
  res.json({
    success: true,
    queue,
  });
});

// ─── RETRY QUEUED EMAILS ───

router.post('/retry', async (_req: Request, res: Response) => {
  try {
    const stats = await processPendingEmails(20);
    res.json({
      success: true,
      data: stats,
      message: `Processed ${stats.processed} emails: ${stats.sent} sent, ${stats.failed} failed, ${stats.cancelled} cancelled`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Retry failed',
    });
  }
});

export default router;
