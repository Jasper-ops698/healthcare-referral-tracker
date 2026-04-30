/**
 * User Model — Healthcare Staff & Administrators (Region-Aware)
 *
 * Every user carries an embedded `_sync` subdocument for VBCC and a
 * `region` assignment for regional sync gating.
 *
 * PRIMARY ADMIN PROTECTION (HARDCODED):
 *   The user with email `bkitib@gmail.com` is the system owner.
 *   The following fields are immutable for this account:
 *     - isPrimaryAdmin  (always true)
 *     - role            (always 'admin')
 *     - status          (always 'active')
 *     - region          (always 'global')
 *
 *   ANY API route attempting to modify these fields for bkitib@gmail.com
 *   will be silently stripped in applyIfVersionMatches() and rejected
 *   by the auth middleware.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { SyncMetadataSchema } from './SyncMetadata.js';
import type { ISyncMetadata } from './SyncMetadata.js';

// ─── CONSTANTS ───

/** Primary admin email — hardcoded system owner. Cannot be modified via API. */
export const PRIMARY_ADMIN_EMAIL = 'bkitib@gmail.com';

// ─── TYPES ───

export type UserRole = 'admin' | 'collector' | 'doctor' | 'nurse' | 'lab_tech';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  facilityId?: string;
  department?: string;
  licenseNumber?: string;
  specialization?: string;
  lastLoginAt?: string;
  passwordChangedAt?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  avatar?: string;
  preferences: {
    language: string;
    notifications: boolean;
    theme: 'light' | 'dark';
    timezone: string;
    autoLogout: number;
  };
  /** Region assignment for sync gating. Staff only syncs their region's data. */
  region: string;
  /** Primary admin flag — permanent, cannot be revoked via API */
  isPrimaryAdmin: boolean;
  /** Two-factor authentication TOTP secret (base32, select: false) */
  twoFactorSecret?: string;
  /** Whether 2FA is fully enabled and verified */
  twoFactorEnabled: boolean;
  /** Encrypted backup codes for 2FA recovery */
  twoFactorBackupCodes?: string[];
  /** If true, user must change password on next login */
  forcePasswordChange: boolean;
  /** Email delivery tracking */
  emailDelivery?: {
    welcomeSentAt?: string;
    welcomeFailedAt?: string;
    welcomeError?: string;
    lastEmailStatus?: 'none' | 'sent' | 'failed' | 'pending';
  };
  _sync: ISyncMetadata;
  fullName: string;
}

export interface IUserModel extends Model<IUser> {
  applyIfVersionMatches(
    userId: mongoose.Types.ObjectId,
    incomingVersion: number,
    updates: Partial<IUser>,
    modifiedBy: mongoose.Types.ObjectId,
    changeId: string,
  ): Promise<IUser | null>;
  getDeltas(
    region: string,
    sinceVersion: number,
    options?: { limit?: number },
  ): Promise<IUser[]>;
  findByEmail(email: string): Promise<IUser | null>;
  /**
   * Check if the given email is the primary admin.
   * Used by auth middleware to reject destructive operations.
   */
  isProtectedAccount(email: string): boolean;
}

// ─── SCHEMA ───

const UserPreferencesSchema = new Schema({
  language: { type: String, default: 'en' },
  notifications: { type: Boolean, default: true },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  timezone: { type: String, default: 'Africa/Nairobi' },
  autoLogout: { type: Number, default: 30 },
  dataRetention: { type: Number, default: 365 },
}, { _id: false });

const UserSchema = new Schema<IUser, IUserModel>(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [100, 'First name cannot exceed 100 characters'],
    },

    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [100, 'Last name cannot exceed 100 characters'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email'],
      index: true,
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^\+?[\d\s\-\(\)]{7,}$/, 'Please enter a valid phone number'],
    },

    role: {
      type: String,
      required: true,
      enum: ['admin', 'collector', 'doctor', 'nurse', 'lab_tech'],
      default: 'collector',
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },

    facilityId: {
      type: String,
      trim: true,
      index: true,
    },

    department: { type: String, trim: true },
    licenseNumber: { type: String, trim: true, sparse: true },
    specialization: { type: String, trim: true },
    lastLoginAt: { type: String },
    passwordChangedAt: { type: String },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    avatar: { type: String },

    preferences: {
      type: UserPreferencesSchema,
      default: () => ({ language: 'en', notifications: true, theme: 'light', timezone: 'Africa/Nairobi', autoLogout: 30 }),
    },

    /**
     * Region assignment — determines which data this user syncs.
     * A CHP in "Mtwapa" only sees Mtwapa patients and records.
     */
    region: {
      type: String,
      required: [true, 'Region is required for sync gating'],
      trim: true,
      index: true,
    },

    /** Primary admin — permanent system owner. Immutable via API. */
    isPrimaryAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },

    /** Two-factor authentication TOTP secret */
    twoFactorSecret: {
      type: String,
      select: false,
    },

    /** Whether 2FA is enabled and verified */
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    /** Backup codes for 2FA recovery (hashed) */
    twoFactorBackupCodes: {
      type: [String],
      select: false,
    },

    /** Force password change on next login */
    forcePasswordChange: {
      type: Boolean,
      default: false,
    },

    /** Email delivery tracking */
    emailDelivery: {
      welcomeSentAt: { type: String },
      welcomeFailedAt: { type: String },
      welcomeError: { type: String },
      lastEmailStatus: { type: String, enum: ['none', 'sent', 'failed', 'pending'], default: 'none' },
    },

    /** ─── SYNC METADATA (region-aware, VBCC-enabled) ─── */
    _sync: {
      type: SyncMetadataSchema,
      required: true,
      default: () => ({
        version: 1,
        region: 'default',
        modifiedAt: new Date().toISOString(),
        lastModifiedBy: new mongoose.Types.ObjectId('000000000000000000000000'),
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: new mongoose.Types.ObjectId('000000000000000000000000'),
        changeId: '',
      }),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── INDEXES ───

/** Regional sync: pull users for a region since a version */
UserSchema.index({ '_sync.region': 1, '_sync.version': 1 }, { name: 'regional_sync_pull' });
UserSchema.index({ '_sync.version': 1, status: 1 });
UserSchema.index({ role: 1, '_sync.version': 1 });
UserSchema.index({ facilityId: 1, role: 1 });

// ─── VIRTUALS ───

UserSchema.virtual('fullName').get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`;
});

// ─── PRE-SAVE HOOKS ───

/**
 * Auto-protect primary admin on every save.
 * If the document being saved is bkitib@gmail.com, force protected fields.
 */
UserSchema.pre('save', function (this: IUser) {
  // Hardcoded protection: bkitib@gmail.com is always primary admin
  if (this.email === PRIMARY_ADMIN_EMAIL) {
    this.isPrimaryAdmin = true;
    this.role = 'admin';
    this.status = 'active';
    this.region = 'global';
  }

  if (this.isModified() && !this.isNew) {
    this._sync.version += 1;
    this._sync.modifiedAt = new Date().toISOString();
  }

  const payload = this.toObject();
  delete payload._sync;
  delete payload.__v;
  delete payload.password;
  this._sync.checksum = computeChecksumSync(payload);
});

// ─── STATIC METHODS ───

/**
 * applyIfVersionMatches — Atomic compare-and-swap with VBCC.
 *
 * STEP 1: Read current user and version.
 * STEP 2: If incomingVersion !== _sync.version → throw 409.
 * STEP 3: If the user is bkitib@gmail.com → strip protected fields.
 * STEP 4: Atomic update via findOneAndUpdate.
 */
UserSchema.statics.applyIfVersionMatches = async function (
  this: IUserModel,
  userId: mongoose.Types.ObjectId,
  incomingVersion: number,
  updates: Partial<IUser>,
  modifiedBy: mongoose.Types.ObjectId,
  changeId: string,
): Promise<IUser | null> {
  // Step 1: Read current document
  const current = await this.findById(userId)
    .select('_id _sync.version email')
    .lean()
    .exec();

  if (!current) return null;

  const databaseVersion = current._sync.version;

  // Step 2: VBCC Guard
  if (incomingVersion !== databaseVersion) {
    const err = new Error(
      `Version mismatch: expected ${incomingVersion} but database has ${databaseVersion}. `
    );
    (err as Error & { statusCode: number; code: string }).statusCode = 409;
    (err as Error & { statusCode: number; code: string }).code = 'VERSION_CONFLICT';
    throw err;
  }

  // Step 3: Strip protected fields for primary admin
  const safeUpdates = { ...updates };

  if (current.email === PRIMARY_ADMIN_EMAIL) {
    // These fields are immutable for the primary admin
    delete (safeUpdates as Record<string, unknown>).isPrimaryAdmin;
    delete (safeUpdates as Record<string, unknown>).role;
    delete (safeUpdates as Record<string, unknown>).status;
    delete (safeUpdates as Record<string, unknown>).region;
    delete (safeUpdates as Record<string, unknown>).email;
  }

  // Also strip _sync.region — immutable once set
  if ((safeUpdates as Record<string, unknown>)._sync) {
    const syncUpdate = (safeUpdates as Record<string, unknown>)._sync as Record<string, unknown>;
    delete syncUpdate.region;
  }

  const now = new Date().toISOString();

  // Step 4: Atomic update
  return this.findOneAndUpdate(
    {
      _id: userId,
      '_sync.version': databaseVersion,
    },
    {
      $set: {
        ...safeUpdates,
        '_sync.modifiedAt': now,
        '_sync.lastModifiedBy': modifiedBy,
        '_sync.changeId': changeId,
      },
      $inc: { '_sync.version': 1 },
    },
    { new: true }
  ).exec();
};

/**
 * getDeltas — Regional delta sync for user directory.
 * Returns users for a region where _sync.version > sinceVersion.
 */
UserSchema.statics.getDeltas = async function (
  this: IUserModel,
  region: string,
  sinceVersion: number,
  options: { limit?: number } = {},
): Promise<IUser[]> {
  const limit = Math.min(options.limit ?? 50, 100);

  return this.find({
    '_sync.region': region,
    '_sync.version': { $gt: sinceVersion },
    '_sync.isDeleted': false,
  })
    .sort({ '_sync.version': 1 })
    .limit(limit)
    .lean()
    .exec();
};

UserSchema.statics.findByEmail = async function (
  this: IUserModel,
  email: string
): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase() }).exec();
};

/**
 * isProtectedAccount — Check if an email is the hardcoded primary admin.
 * Auth middleware uses this to reject destructive operations.
 */
UserSchema.statics.isProtectedAccount = function (
  this: IUserModel,
  email: string
): boolean {
  return email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
};

// ─── UTILITY ───

import { createHash } from 'node:crypto';

function computeChecksumSync(payload: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))
  );
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

// ─── MODEL EXPORT ───

const User = mongoose.model<IUser, IUserModel>('User', UserSchema);

export default User;
