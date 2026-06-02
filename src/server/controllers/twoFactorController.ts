/**
 * 2FA Controller — TOTP-based Two-Factor Authentication
 *
 * Flow:
 *   1. User clicks "Enable 2FA" → generate secret + QR code → show to user
 *   2. User scans QR with authenticator app → enters 6-digit code
 *   3. Verify code → enable 2FA → show backup codes
 *   4. Future logins: password → 2FA code → authenticated
 *
 * Uses speakeasy (RFC 6238 TOTP) for code generation/verification.
 */

import type { Request, Response } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signJWT } from '../middleware/regionalAuth.js';

const APP_NAME = 'HealthTrack';

// ─── SETUP: Generate secret and QR code ───

export async function handle2FASetup(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const user = await User.findById(userId).select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes').exec();
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Don't re-setup if already enabled
    if (user.twoFactorEnabled) {
      res.status(400).json({ success: false, error: { code: '2FA_ALREADY_ENABLED', message: '2FA is already enabled' } });
      return;
    }

    // Generate new secret
    const secret = speakeasy.generateSecret({
      name: `${APP_NAME} (${user.email})`,
      length: 32,
    });

    // Save the base32 secret temporarily (not enabled yet)
    user.twoFactorSecret = secret.base32;
    await user.save();

    // Generate QR code (otpauth URL)
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.ascii,
      label: user.email,
      issuer: APP_NAME,
      encoding: 'ascii',
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.status(200).json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        secret: secret.base32, // Show manual entry code too
        message: 'Scan the QR code with your authenticator app, then enter the 6-digit code to verify.',
      },
    });
  } catch (error) {
    console.error('[2FA Setup Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to setup 2FA' } });
  }
}

// ─── VERIFY: Confirm code and enable 2FA ───

export async function handle2FAVerifySetup(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;
    const { token } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    if (!token || token.length !== 6) {
      res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Please enter a valid 6-digit code' } });
      return;
    }

    const user = await User.findById(userId).select('+twoFactorSecret +twoFactorEnabled').exec();
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    if (!user.twoFactorSecret) {
      res.status(400).json({ success: false, error: { code: '2FA_NOT_SETUP', message: '2FA setup not initiated' } });
      return;
    }

    // Verify the TOTP token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps tolerance (±1 min)
    });

    if (!verified) {
      res.status(400).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid code. Please try again.' } });
      return;
    }

    // Generate 10 backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 10))
    );

    // Enable 2FA
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = hashedBackupCodes;
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        backupCodes, // Show once — user must save these
        message: 'Two-factor authentication enabled! Save these backup codes in a secure place.',
      },
    });
  } catch (error) {
    console.error('[2FA Verify Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to verify 2FA' } });
  }
}

// ─── DISABLE: Turn off 2FA ───

export async function handle2FADisable(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;
    const { password } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    if (!password) {
      res.status(400).json({ success: false, error: { code: 'PASSWORD_REQUIRED', message: 'Password is required to disable 2FA' } });
      return;
    }

    const user = await User.findById(userId).select('+password +twoFactorEnabled').exec();
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    if (!user.twoFactorEnabled) {
      res.status(400).json({ success: false, error: { code: '2FA_NOT_ENABLED', message: '2FA is not enabled' } });
      return;
    }

    // Verify password before allowing 2FA disable
    const bcrypt = await import('bcryptjs');
    const isMatch = await bcrypt.default.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Incorrect password' } });
      return;
    }

    // Disable 2FA and clear secret
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      data: { message: 'Two-factor authentication disabled.' },
    });
  } catch (error) {
    console.error('[2FA Disable Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to disable 2FA' } });
  }
}

// ─── LOGIN VERIFY: Verify 2FA code during login ───

export async function handle2FALoginVerify(req: Request, res: Response): Promise<void> {
  try {
    const { email, phone, token, backupCode } = req.body;

    if ((!email && !phone) || (!token && !backupCode)) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Email or phone, and token or backup code are required' } });
      return;
    }

    // Find user by email or phone
    let user: typeof User.prototype | null = null;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() }).select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes +password').exec();
    } else if (phone) {
      user = await User.findOne({ phone: phone.trim() }).select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes +password').exec();
    }
    if (!user || !user.twoFactorEnabled) {
      res.status(400).json({ success: false, error: { code: '2FA_NOT_ENABLED', message: '2FA not enabled for this user' } });
      return;
    }

    let verified = false;

    // Try TOTP token first
    if (token) {
      verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token,
        window: 2,
      });
    }

    // Try backup code if TOTP failed or not provided
    if (!verified && backupCode && user.twoFactorBackupCodes) {
      for (const hashedCode of user.twoFactorBackupCodes) {
        const match = await bcrypt.compare(backupCode, hashedCode);
        if (match) {
          verified = true;
          // Remove used backup code
          user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter(c => c !== hashedCode);
          await user.save();
          break;
        }
      }
    }

    if (!verified) {
      res.status(401).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid code or backup code' } });
      return;
    }

    // Update last login and generate JWT
    user.lastLoginAt = new Date().toISOString();
    await user.save();
    const jwtToken = signJWT(user);

    res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        region: user.region,
        isPrimaryAdmin: user.isPrimaryAdmin,
        preferences: user.preferences,
      },
      twoFAVerified: true,
    });
  } catch (error) {
    console.error('[2FA Login Verify Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to verify 2FA' } });
  }
}

// ─── STATUS: Check if 2FA is enabled ───

export async function handle2FAStatus(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const user = await User.findById(userId).select('twoFactorEnabled').lean();
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        enabled: user.twoFactorEnabled,
      },
    });
  } catch (error) {
    console.error('[2FA Status Error]', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get 2FA status' } });
  }
}

// ─── UTILITY: Generate backup codes ───

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    // Format: XXXX-XXXX (8 random chars)
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}
