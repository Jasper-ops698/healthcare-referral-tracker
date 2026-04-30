/**
 * User Controller — Admin-Only User Creation with Email Delivery & Retry
 *
 * POST /api/v1/users       — Create user + send welcome email
 * POST /api/v1/users/:id/resend — Resend welcome email
 * GET  /api/v1/users       — List users (admin only)
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { sendWelcomeEmail, resendWelcomeEmail } from '../services/emailService.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

// ─── TEMP PASSWORD GENERATOR ───

function generateTempPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 3; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// ─── ADMIN GUARD ───

function requireAdmin(req: AuthenticatedRequest, res: Response): boolean {
  const user = req.user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    return false;
  }
  return true;
}

// ─── CREATE USER ───

export async function handleCreateUser(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { firstName, lastName, email, phone, role, assignedFacility, region } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !role) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'firstName, lastName, email, phone, and role are required' },
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check duplicate email
    const existing = await User.findOne({ email: normalizedEmail }).exec();
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: 'A user with this email already exists' },
      });
      return;
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Create user
    const newUser = new User({
      _id: new mongoose.Types.ObjectId(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone.trim(),
      role,
      status: 'active',
      region: (region || 'default').trim(),
      facilityId: assignedFacility ? assignedFacility.toString().trim() : undefined,
      forcePasswordChange: true,
      preferences: {
        language: 'en',
        notifications: true,
        theme: 'light',
        timezone: 'Africa/Nairobi',
        autoLogout: 30,
      },
      emailDelivery: {
        lastEmailStatus: 'pending',
      },
      _sync: {
        version: 1,
        region: (region || 'default').trim(),
        modifiedAt: new Date().toISOString(),
        lastModifiedBy: new mongoose.Types.ObjectId(authReq.user._id),
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: new mongoose.Types.ObjectId(authReq.user._id),
        changeId: `user_create_${Date.now()}`,
      },
    });

    await newUser.save();

    // Send welcome email with temporary password
    const loginUrl = process.env.FRONTEND_URL || 'https://oizwnscb3c4jm.kimi.show';
    const emailResult = await sendWelcomeEmail({
      firstName: newUser.firstName,
      email: newUser.email,
      role: newUser.role,
      tempPassword,
      loginUrl,
    });

    // Track email delivery status on user record
    if (emailResult.success) {
      newUser.emailDelivery = {
        welcomeSentAt: new Date().toISOString(),
        lastEmailStatus: 'sent',
      };
      await newUser.save();
      console.log(`[UserController] Welcome email sent to ${newUser.email}: ${emailResult.messageId}`);
    } else {
      newUser.emailDelivery = {
        welcomeFailedAt: new Date().toISOString(),
        welcomeError: emailResult.error || 'Unknown error',
        lastEmailStatus: 'failed',
      };
      await newUser.save();
      console.error(`[UserController] Welcome email FAILED for ${newUser.email}: ${emailResult.error}`);
    }

    // Return user without password, but INCLUDE tempPassword for admin to see
    const userObj = newUser.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;

    res.status(201).json({
      success: true,
      data: {
        user: userObj,
        tempPassword: emailResult.success ? undefined : tempPassword, // Only show if email failed
        emailSent: emailResult.success,
        emailError: emailResult.error,
        message: emailResult.success
          ? 'User created and welcome email sent successfully'
          : 'User created but welcome email failed to send. The temporary password is shown above — please share it securely with the user.',
      },
    });

  } catch (error) {
    console.error('[UserController] Create user error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred while creating the user' },
    });
  }
}

// ─── RESEND WELCOME EMAIL ───

export async function handleResendWelcome(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: { code: 'MISSING_EMAIL', message: 'Email is required' } });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password').exec();

    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Generate a new temporary password for security
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    user.password = hashedPassword;
    user.forcePasswordChange = true;
    await user.save();

    const loginUrl = process.env.FRONTEND_URL || 'https://oizwnscb3c4jm.kimi.show';
    const emailResult = await resendWelcomeEmail({
      firstName: user.firstName,
      email: user.email,
      role: user.role,
      tempPassword,
      loginUrl,
    });

    // Track status
    if (emailResult.success) {
      user.emailDelivery = {
        ...user.emailDelivery,
        welcomeSentAt: new Date().toISOString(),
        lastEmailStatus: 'sent',
      };
      await user.save();
    } else {
      user.emailDelivery = {
        ...user.emailDelivery,
        welcomeFailedAt: new Date().toISOString(),
        welcomeError: emailResult.error || 'Unknown error',
        lastEmailStatus: 'failed',
      };
      await user.save();
    }

    res.status(200).json({
      success: true,
      data: {
        emailSent: emailResult.success,
        tempPassword: emailResult.success ? undefined : tempPassword,
        emailError: emailResult.error,
        message: emailResult.success
          ? 'Welcome email resent successfully'
          : 'Email failed again. Temporary password provided — please share it securely.',
      },
    });
  } catch (error) {
    console.error('[UserController] Resend email error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to resend welcome email' },
    });
  }
}

// ─── LIST USERS (ADMIN ONLY) ───

export async function handleListUsers(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const users = await User.find({ status: { $ne: 'deleted' } })
      .select('-password -twoFactorSecret -twoFactorBackupCodes -passwordResetToken')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: { users, count: users.length },
    });
  } catch (error) {
    console.error('[UserController] List users error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list users' },
    });
  }
}
