/**
 * User Controller — Admin-Only User Creation with SMS Delivery
 *
 * POST /api/v1/users       — Create user + send welcome SMS
 * POST /api/v1/users/:id/resend — Resend welcome SMS
 * GET  /api/v1/users       — List users (admin only)
 *
 * SMS-FIRST: All user creation sends welcome via Africa's Talking SMS.
 * Email is kept for admin accounts only (legacy). Collectors use phone as
 * their primary identifier.
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import User from '../models/User.js';
import { sendWelcomeSMS, sendVerificationCodeSMS } from '../services/smsService.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

// ─── TEMP PASSWORD GENERATOR ───

function generateTempPassword(length = 8): string {
  const digits = '23456789';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const all = digits + lower;
  let password = '';
  password += digits[Math.floor(Math.random() * digits.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  for (let i = 2; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// ─── SMS VERIFICATION CODE GENERATOR ───

function generateVerificationCode(length = 6): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
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

// ─── CREATE USER (SMS-FIRST) ───

export async function handleCreateUser(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      assignedFacility,
      stationName,
      stationType,
      stationId,
      region,
      sendVerificationCode,
    } = req.body;

    // ── Validation ──
    if (!firstName || !lastName || !phone || !role) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'firstName, lastName, phone, and role are required' },
      });
      return;
    }

    // Admin accounts still require email; collectors can use phone-only
    if (role === 'admin' && !email) {
      res.status(400).json({
        success: false,
        error: { code: 'EMAIL_REQUIRED', message: 'Email is required for admin accounts' },
      });
      return;
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : undefined;
    const trimmedPhone = phone.trim();

    // Check duplicate email (if provided)
    if (normalizedEmail) {
      const existingEmail = await User.findOne({ email: normalizedEmail }).exec();
      if (existingEmail) {
        res.status(409).json({
          success: false,
          error: { code: 'EMAIL_EXISTS', message: 'A user with this email already exists' },
        });
        return;
      }
    }

    // Check duplicate phone
    const existingPhone = await User.findOne({ phone: trimmedPhone }).exec();
    if (existingPhone) {
      res.status(409).json({
        success: false,
        error: { code: 'PHONE_EXISTS', message: 'A user with this phone number already exists' },
      });
      return;
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Generate SMS verification code if requested
    let verificationCode: string | undefined;
    let smsCodeExpires: Date | undefined;
    if (sendVerificationCode) {
      verificationCode = generateVerificationCode();
      smsCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }

    // Create user
    const newUser = new User({
      _id: new mongoose.Types.ObjectId(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail || undefined,
      password: hashedPassword,
      phone: trimmedPhone,
      role,
      status: 'active',
      region: (region || 'default').trim(),
      facilityId: assignedFacility ? assignedFacility.toString().trim() : undefined,
      stationName: stationName ? stationName.toString().trim() : undefined,
      stationType: stationType || undefined,
      stationId: stationId
        ? stationId.toString().trim()
        : stationName
          ? stationName.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
          : undefined,
      forcePasswordChange: true,
      phoneVerified: false,
      smsVerificationCode: verificationCode ? await bcrypt.hash(verificationCode, 10) : undefined,
      smsCodeExpires,
      preferences: {
        language: 'en',
        notifications: true,
        theme: 'light',
        timezone: 'Africa/Nairobi',
        autoLogout: 30,
      },
      smsDelivery: {
        lastSMSStatus: 'pending',
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

    // ── Send welcome SMS with temporary password ──
    const loginUrl = process.env.FRONTEND_URL || 'https://oizwnscb3c4jm.kimi.show';
    const smsResult = await sendWelcomeSMS({
      phone: trimmedPhone,
      firstName: newUser.firstName,
      tempPassword,
      loginUrl,
      role: newUser.role,
    });

    // Track SMS delivery status
    if (smsResult.success) {
      newUser.smsDelivery = {
        welcomeSentAt: new Date().toISOString(),
        lastSMSStatus: 'sent',
      };
      await newUser.save();
      console.log(`[UserController] Welcome SMS sent to ${trimmedPhone}: ${smsResult.messageId}`);
    } else {
      newUser.smsDelivery = {
        welcomeFailedAt: new Date().toISOString(),
        welcomeError: smsResult.error || 'Unknown error',
        lastSMSStatus: 'failed',
      };
      await newUser.save();
      console.error(`[UserController] Welcome SMS FAILED for ${trimmedPhone}: ${smsResult.error}`);
    }

    // ── Send verification code SMS if requested ──
    let verificationSmsResult: { success: boolean; error?: string } | undefined;
    if (sendVerificationCode && verificationCode) {
      verificationSmsResult = await sendVerificationCodeSMS({
        phone: trimmedPhone,
        firstName: newUser.firstName,
        code: verificationCode,
      });
    }

    // Return user without password, but INCLUDE tempPassword for admin to see (only if SMS failed)
    const userObj = newUser.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;
    delete userObj.smsVerificationCode;

    res.status(201).json({
      success: true,
      data: {
        user: userObj,
        tempPassword: smsResult.success ? undefined : tempPassword,
        smsSent: smsResult.success,
        smsError: smsResult.error,
        verificationCodeSent: verificationSmsResult?.success,
        verificationCodeError: verificationSmsResult?.error,
        message: smsResult.success
          ? `User created and welcome SMS sent to ${trimmedPhone}`
          : `User created but welcome SMS failed: ${smsResult.error}. Temp password shown above — share it securely.`,
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

// ─── RESEND WELCOME SMS ───

export async function handleResendWelcome(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: { code: 'MISSING_USER_ID', message: 'User ID is required' } });
      return;
    }

    const user = await User.findById(userId).select('+password').exec();

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

    // Send via SMS
    const loginUrl = process.env.FRONTEND_URL || 'https://oizwnscb3c4jm.kimi.show';
    const smsResult = await sendWelcomeSMS({
      phone: user.phone,
      firstName: user.firstName,
      tempPassword,
      loginUrl,
      role: user.role,
    });

    // Track status
    if (smsResult.success) {
      user.smsDelivery = {
        ...user.smsDelivery,
        welcomeSentAt: new Date().toISOString(),
        lastSMSStatus: 'sent',
      };
      await user.save();
    } else {
      user.smsDelivery = {
        ...user.smsDelivery,
        welcomeFailedAt: new Date().toISOString(),
        welcomeError: smsResult.error || 'Unknown error',
        lastSMSStatus: 'failed',
      };
      await user.save();
    }

    res.status(200).json({
      success: true,
      data: {
        smsSent: smsResult.success,
        tempPassword: smsResult.success ? undefined : tempPassword,
        smsError: smsResult.error,
        message: smsResult.success
          ? 'Welcome SMS resent successfully'
          : 'SMS failed again. Temp password provided — share it securely.',
      },
    });
  } catch (error) {
    console.error('[UserController] Resend SMS error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to resend welcome SMS' },
    });
  }
}

// ─── REQUEST PHONE VERIFICATION CODE ───

export async function handleRequestVerificationCode(req: Request, res: Response): Promise<void> {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ success: false, error: { code: 'MISSING_PHONE', message: 'Phone number is required' } });
      return;
    }

    const user = await User.findOne({ phone: phone.trim() }).select('+smsVerificationCode').exec();
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Generate new code
    const code = generateVerificationCode();
    user.smsVerificationCode = await bcrypt.hash(code, 10);
    user.smsCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    // Send SMS
    const smsResult = await sendVerificationCodeSMS({
      phone: user.phone,
      firstName: user.firstName,
      code,
    });

    res.status(200).json({
      success: true,
      data: {
        sent: smsResult.success,
        error: smsResult.error,
        message: smsResult.success ? 'Verification code sent' : `Failed to send code: ${smsResult.error}`,
      },
    });
  } catch (error) {
    console.error('[UserController] Request verification code error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to send verification code' },
    });
  }
}

// ─── VERIFY PHONE NUMBER ───

export async function handleVerifyPhone(req: Request, res: Response): Promise<void> {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Phone and verification code are required' },
      });
      return;
    }

    const user = await User.findOne({ phone: phone.trim() }).select('+smsVerificationCode +smsCodeExpires').exec();
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Check if code expired
    if (!user.smsCodeExpires || new Date() > user.smsCodeExpires) {
      res.status(400).json({ success: false, error: { code: 'CODE_EXPIRED', message: 'Verification code has expired. Please request a new one.' } });
      return;
    }

    // Verify code
    const isMatch = await bcrypt.compare(code, user.smsVerificationCode || '');
    if (!isMatch) {
      res.status(400).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid verification code' } });
      return;
    }

    // Mark phone as verified
    user.phoneVerified = true;
    user.smsVerificationCode = undefined;
    user.smsCodeExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      data: { message: 'Phone number verified successfully' },
    });
  } catch (error) {
    console.error('[UserController] Verify phone error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to verify phone' },
    });
  }
}

// ─── UPDATE OWN PROFILE (COLLECTOR + ADMIN) ───

export async function handleUpdateProfile(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const userId = authReq.user._id.toString();
    const body = req.body;

    // Define editable fields — work fields are excluded
    const allowedUpdates: Record<string, unknown> = {};

    if (body.firstName !== undefined) allowedUpdates.firstName = body.firstName.trim();
    if (body.lastName !== undefined) allowedUpdates.lastName = body.lastName.trim();
    if (body.email !== undefined) allowedUpdates.email = body.email.toLowerCase().trim();
    if (body.phone !== undefined) allowedUpdates.phone = body.phone.trim();
    if (body.dateOfBirth !== undefined) allowedUpdates.dateOfBirth = body.dateOfBirth || undefined;
    if (body.gender !== undefined) allowedUpdates.gender = body.gender;
    if (body.nationalId !== undefined) allowedUpdates.nationalId = body.nationalId.trim() || undefined;
    if (body.homeCounty !== undefined) allowedUpdates.homeCounty = body.homeCounty.trim() || undefined;
    if (body.bloodGroup !== undefined) allowedUpdates.bloodGroup = body.bloodGroup || undefined;
    if (body.physicalAddress !== undefined) allowedUpdates.physicalAddress = body.physicalAddress.trim() || undefined;
    if (body.bio !== undefined) allowedUpdates.bio = body.bio.trim() || undefined;
    if (body.languages !== undefined) allowedUpdates.languages = body.languages;
    if (body.emergencyContact !== undefined) allowedUpdates.emergencyContact = body.emergencyContact;
    if (body.nextOfKin !== undefined) allowedUpdates.nextOfKin = body.nextOfKin;

    // Check email uniqueness if changing
    if (allowedUpdates.email) {
      const existing = await User.findOne({
        email: allowedUpdates.email,
        _id: { $ne: authReq.user._id },
      }).exec();
      if (existing) {
        res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email already in use' } });
        return;
      }
    }

    // Check phone uniqueness if changing
    if (allowedUpdates.phone) {
      const existing = await User.findOne({
        phone: allowedUpdates.phone,
        _id: { $ne: authReq.user._id },
      }).exec();
      if (existing) {
        res.status(409).json({ success: false, error: { code: 'PHONE_EXISTS', message: 'Phone number already in use' } });
        return;
      }
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    ).select('-password -twoFactorSecret -twoFactorBackupCodes').lean().exec();

    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user: updated },
    });

  } catch (error) {
    console.error('[UserController] Update profile error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' },
    });
  }
}

// ─── GET CURRENT USER (ME) ───

export async function handleGetMe(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      return;
    }

    const user = await User.findById(authReq.user._id)
      .select('-password -twoFactorSecret -twoFactorBackupCodes -passwordResetToken -smsVerificationCode')
      .lean()
      .exec();

    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || '',
        role: user.role,
        status: user.status,
        region: user.region,
        phoneVerified: user.phoneVerified,
        assignedFacility: user.facilityId?.toString(),
        stationId: user.stationId?.toString(),
        stationName: user.stationName,
        stationType: user.stationType,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        nationalId: user.nationalId,
        emergencyContact: user.emergencyContact,
        languages: user.languages,
        homeCounty: user.homeCounty,
        bloodGroup: user.bloodGroup,
        physicalAddress: user.physicalAddress,
        nextOfKin: user.nextOfKin,
        bio: user.bio,
        preferences: user.preferences,
        avatar: user.avatar,
        lastLogin: user.lastLoginAt,
      },
    });
  } catch (error: any) {
    console.error('[UserController] Get me error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get user' } });
  }
}

// ─── LIST COLLECTOR STATIONS (PUBLIC, NO ADMIN REQUIRED) ───

export async function handleListCollectorStations(req: Request, res: Response): Promise<void> {
  try {
    // Include collectors with either stationName OR facilityId (assignedFacility)
    const collectors = await User.find(
      {
        role: 'collector',
        $or: [
          { stationName: { $exists: true, $ne: '' } },
          { facilityId: { $exists: true, $ne: '' } },
        ],
      },
      { stationName: 1, stationType: 1, facilityId: 1, firstName: 1, lastName: 1, _id: 0 }
    ).lean().exec();

    // Group by stationName (fallback to facilityId/assignedFacility if stationName empty)
    const map = new Map<string, { name: string; type: string; collectors: string[] }>();
    collectors.forEach((c: any) => {
      const rawName = (c.stationName && c.stationName.trim()) || (c.facilityId && c.facilityId.toString().trim()) || '';
      if (!rawName) return;
      const key = rawName.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        existing.collectors.push(`${c.firstName} ${c.lastName}`.trim());
      } else {
        map.set(key, {
          name: rawName.trim(),
          type: c.stationType || 'household',
          collectors: [`${c.firstName} ${c.lastName}`.trim()],
        });
      }
    });

    res.status(200).json({
      success: true,
      data: { stations: Array.from(map.values()), count: map.size },
    });
  } catch (error: any) {
    console.error('[UserController] List stations error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list stations' } });
  }
}

// ─── LIST USERS (ADMIN ONLY) ───

export async function handleListUsers(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const users = await User.find({ status: { $ne: 'deleted' } })
      .select('-password -twoFactorSecret -twoFactorBackupCodes -passwordResetToken -smsVerificationCode')
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

// ─── ADMIN UPDATE USER (STATION FIELDS) ───

export async function handleAdminUpdateUser(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { id } = req.params;
    const body = req.body;

    const allowedUpdates: Record<string, unknown> = {};

    if (body.firstName !== undefined) allowedUpdates.firstName = body.firstName.trim();
    if (body.lastName !== undefined) allowedUpdates.lastName = body.lastName.trim();
    if (body.email !== undefined) allowedUpdates.email = body.email.toLowerCase().trim();
    if (body.phone !== undefined) allowedUpdates.phone = body.phone.trim();
    if (body.assignedFacility !== undefined) allowedUpdates.facilityId = body.assignedFacility.trim() || undefined;
    if (body.stationName !== undefined) allowedUpdates.stationName = body.stationName.trim() || undefined;
    if (body.stationType !== undefined) allowedUpdates.stationType = body.stationType || undefined;
    if (body.stationId !== undefined) allowedUpdates.stationId = body.stationId?.trim() || undefined;

    // If stationName is set but stationId isn't, auto-generate stationId
    if (allowedUpdates.stationName && !allowedUpdates.stationId) {
      const name = allowedUpdates.stationName as string;
      allowedUpdates.stationId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    // Check email uniqueness if changing
    if (allowedUpdates.email) {
      const existing = await User.findOne({
        email: allowedUpdates.email,
        _id: { $ne: id },
      }).exec();
      if (existing) {
        res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email already in use' } });
        return;
      }
    }

    // Check phone uniqueness if changing
    if (allowedUpdates.phone) {
      const existing = await User.findOne({
        phone: allowedUpdates.phone,
        _id: { $ne: id },
      }).exec();
      if (existing) {
        res.status(409).json({ success: false, error: { code: 'PHONE_EXISTS', message: 'Phone number already in use' } });
        return;
      }
    }

    const updated = await User.findByIdAndUpdate(
      id,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    ).select('-password -twoFactorSecret -twoFactorBackupCodes -smsVerificationCode').lean().exec();

    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user: updated },
    });

  } catch (error) {
    console.error('[UserController] Admin update user error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update user' },
    });
  }
}
