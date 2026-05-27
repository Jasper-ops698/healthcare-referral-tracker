/**
 * Auth Controller — Login, Logout, Me, Change Password
 *
 * Authenticates users against MongoDB and issues JWTs.
 * The primary admin (bkitib@gmail.com) is auto-created on first boot.
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User, { PRIMARY_ADMIN_EMAIL } from '../models/User.js';
import { signJWT } from '../middleware/regionalAuth.js';

// ─── BOOTSTRAP PRIMARY ADMIN ───

export async function bootstrapPrimaryAdmin(): Promise<void> {
  try {
    // Check for duplicate primary admins and clean them up
    const allWithEmail = await User.find({ email: PRIMARY_ADMIN_EMAIL }).exec();
    if (allWithEmail.length > 1) {
      console.warn(`[Auth] Found ${allWithEmail.length} users with email ${PRIMARY_ADMIN_EMAIL}. Removing duplicates...`);
      // Keep the one with isPrimaryAdmin=true, or the first one if none have it
      const primary = allWithEmail.find(u => u.isPrimaryAdmin) || allWithEmail[0];
      const idsToRemove = allWithEmail
        .filter(u => u._id.toString() !== primary._id.toString())
        .map(u => u._id);
      await User.deleteMany({ _id: { $in: idsToRemove } });
      console.log(`[Auth] Removed ${idsToRemove.length} duplicate(s). Kept ${primary._id}`);
    }

    const existing = await User.findOne({ email: PRIMARY_ADMIN_EMAIL }).exec();
    if (existing) {
      console.log(`[Auth] Primary admin ${PRIMARY_ADMIN_EMAIL} exists`);
      return;
    }

    const hashedPassword = await bcrypt.hash('Admin@2024!', 12);

    const admin = new User({
      _id: new mongoose.Types.ObjectId(),
      firstName: 'Emmanuel',
      lastName: 'Nyale',
      email: PRIMARY_ADMIN_EMAIL,
      password: hashedPassword,
      phone: '+254700000001',
      role: 'admin',
      status: 'active',
      region: 'global',
      isPrimaryAdmin: true,
      preferences: {
        language: 'en',
        notifications: true,
        theme: 'light',
      },
      _sync: {
        version: 1,
        region: 'global',
        modifiedAt: new Date().toISOString(),
        lastModifiedBy: new mongoose.Types.ObjectId('000000000000000000000000'),
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: new mongoose.Types.ObjectId('000000000000000000000000'),
        changeId: 'bootstrap_admin',
      },
    });

    await admin.save();
    console.log(`[Auth] Primary admin ${PRIMARY_ADMIN_EMAIL} created successfully`);
    console.log(`[Auth] IMPORTANT: Default password is 'Admin@2024!' — change on first login`);
  } catch (error) {
    console.error('[Auth] Failed to bootstrap primary admin:', error);
  }
}

// ─── LOGIN ─——

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_CREDENTIALS', message: 'Email and password are required' },
      });
      return;
    }

    // Find user with password included
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password').exec();
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      return;
    }

    // Check status
    if (user.status !== 'active') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'Your account is inactive. Contact your administrator.' },
      });
      return;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      return;
    }

    // Check if user must change password (first login with temp password)
    if (user.forcePasswordChange) {
      res.status(200).json({
        success: true,
        forcePasswordChange: true,
        email: user.email,
        firstName: user.firstName,
        message: 'You must set a new password before accessing the dashboard.',
      });
      return;
    }

    // Check if 2FA is enabled — if so, return 2FA required instead of JWT
    if (user.twoFactorEnabled) {
      res.status(200).json({
        success: true,
        twoFactorRequired: true,
        email: user.email,
        message: 'Two-factor authentication required. Please enter the 6-digit code from your authenticator app.',
      });
      return;
    }

    // Update last login
    user.lastLoginAt = new Date().toISOString();
    await user.save();

    // Generate JWT
    const token = signJWT(user);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || '',
        role: user.role,
        status: user.status,
        region: user.region,
        isPrimaryAdmin: user.isPrimaryAdmin,
        assignedFacility: user.facilityId?.toString(),
        // Station assignment
        stationId: user.stationId?.toString(),
        stationName: user.stationName,
        stationType: user.stationType,
        // Profile fields
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
      },
    });
  } catch (error) {
    console.error('[Auth Login Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
}

// ─── CHANGE PASSWORD ─——

export async function handleChangePassword(req: Request, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;
    const authReq = req as any;
    const userId = authReq.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // Validate input
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Current password and new password are required' },
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: { code: 'PASSWORD_TOO_SHORT', message: 'New password must be at least 6 characters' },
      });
      return;
    }

    // Find user with password
    const user = await User.findById(userId).select('+password').exec();
    if (!user) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect' },
      });
      return;
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    user.passwordChangedAt = new Date().toISOString();
    await user.save();

    console.log(`[Auth] Password changed for user: ${user.email}`);

    res.status(200).json({
      success: true,
      data: {
        message: 'Password updated successfully. Please log in again with your new password.',
      },
    });
  } catch (error) {
    console.error('[Auth ChangePassword Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
}

// ─── LOGOUT ─——

export async function handleLogout(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
}

// ─── SET PASSWORD (FIRST LOGIN) ───

export async function handleSetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Email, current password, and new password are required' },
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: { code: 'PASSWORD_TOO_SHORT', message: 'New password must be at least 6 characters' },
      });
      return;
    }

    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password').exec();
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
      return;
    }

    // Verify current (temporary) password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect' },
      });
      return;
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    user.forcePasswordChange = false;
    user.passwordChangedAt = new Date().toISOString();
    await user.save();

    // Update last login
    user.lastLoginAt = new Date().toISOString();
    await user.save();

    // Generate JWT for immediate login
    const token = signJWT(user);

    console.log(`[Auth] Password set and first login completed for: ${user.email}`);

    res.status(200).json({
      success: true,
      token,
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
      message: 'Password set successfully. Welcome to Healthcare Referral Tracker.',
    });
  } catch (error) {
    console.error('[Auth SetPassword Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
}

// ─── UPDATE SETTINGS ─——

export async function handleUpdateSettings(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    const { language, timezone, autoLogout, notifications, theme, dataRetention } = req.body;

    const user = await User.findById(userId).exec();
    if (!user) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    // Update only provided preference fields
    if (language !== undefined) user.preferences.language = language;
    if (timezone !== undefined) user.preferences.timezone = timezone;
    if (autoLogout !== undefined) user.preferences.autoLogout = autoLogout;
    if (notifications !== undefined) user.preferences.notifications = notifications;
    if (theme !== undefined) user.preferences.theme = theme;
    if (dataRetention !== undefined) user.preferences.dataRetention = dataRetention;

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        preferences: user.preferences,
        message: 'Settings updated successfully',
      },
    });
  } catch (error) {
    console.error('[Auth UpdateSettings Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
}

// ─── ME ─——

export async function handleMe(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    const user = await User.findById(userId).select('-password').exec();
    if (!user) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || '',
        role: user.role,
        status: user.status,
        region: user.region,
        isPrimaryAdmin: user.isPrimaryAdmin,
        assignedFacility: user.facilityId?.toString(),
        lastLoginAt: user.lastLoginAt,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error('[Auth Me Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
}
