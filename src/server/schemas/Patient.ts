/**
 * Patient Schema — Production-Ready with Sync Metadata
 *
 * Every Patient document carries an embedded `_sync` subdocument that
 * enables MedSyncManager to perform Version-Based Concurrency Control.
 *
 * VBCC Rule:
 *   Server accepts a push only if incoming `clientVersion === doc._sync.version`.
 *   On mismatch → HTTP 409 Conflict with current server payload.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { SyncMetadataSchema } from './syncMetadata.js';
import type { ISyncMetadata } from './syncMetadata.js';

// ────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ────────────────────────────────────────────────────────────────────────────

export interface IEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface IAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface IInsuranceInfo {
  provider: string;
  policyNumber: string;
  groupNumber?: string;
}

/** A single stage in a patient's referral journey */
export interface IReferralStage {
  /** Stage order (1, 2, 3...) */
  stage: number;
  /** From facility name */
  fromFacility: string;
  /** To facility name */
  toFacility: string;
  /** Stage status */
  status: 'pending' | 'in-progress' | 'completed' | 'rejected';
  /** Date the stage was entered */
  date: Date;
  /** Notes about this stage */
  notes?: string;
  /** CHP who facilitated this stage */
  chpName?: string;
}

export interface IPatient extends Document {
  /** Human-readable patient ID (e.g., PT-000001) — NOT the Mongo _id */
  patientId: string;

  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email?: string;
  address: IAddress;
  emergencyContact?: IEmergencyContact;
  bloodType?: string;
  allergies: string[];
  chronicConditions: string[];
  insuranceInfo?: IInsuranceInfo;

  /** CHP (user) who registered this patient */
  registeredBy: mongoose.Types.ObjectId;

  /** CHP (non-system user) assigned to accompany patient through referrals */
  assignedChpId?: mongoose.Types.ObjectId;

  /** CHP name (denormalized for quick display without populate) */
  assignedChpName?: string;

  /** Patient's current referral status in the workflow */
  referralStatus: 'registered' | 'screened' | 'referred' | 'accepted' |
                  'in-treatment' | 'completed' | 'rejected';

  /**
   * Referral stages — tracks the patient's journey through facilities.
   * Each stage represents a step in the referral pipeline.
   */
  referralStages: IReferralStage[];

  status: 'active' | 'inactive' | 'deceased';

  /** Embedded sync metadata for VBCC */
  _sync: ISyncMetadata;

  /** Virtual: full name */
  fullName: string;

  /** Virtual: age in years */
  age: number;
}

export interface IPatientModel extends Model<IPatient> {
  /**
   * Find all patients modified since a given version.
   * Used by the server's pull endpoint.
   */
  findSinceVersion(version: number): Promise<IPatient[]>;

  /**
   * Atomically increment version and apply updates.
   * Returns the updated document or null if version mismatch (conflict).
   */
  applyIfVersionMatches(
    patientId: mongoose.Types.ObjectId,
    expectedVersion: number,
    updates: Partial<IPatient>,
    modifiedBy: string
  ): Promise<IPatient | null>;
}

// ────────────────────────────────────────────────────────────────────────────
// SCHEMA DEFINITION
// ────────────────────────────────────────────────────────────────────────────

const EmergencyContactSchema = new Schema<IEmergencyContact>({
  name: { type: String, required: true },
  relationship: { type: String, required: true },
  phone: { type: String, required: true },
}, { _id: false });

const AddressSchema = new Schema<IAddress>({
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true, default: 'Kenya' },
}, { _id: false });

const InsuranceInfoSchema = new Schema<IInsuranceInfo>({
  provider: { type: String, required: true },
  policyNumber: { type: String, required: true },
  groupNumber: { type: String },
}, { _id: false });

const ReferralStageSchema = new Schema<IReferralStage>({
  stage: { type: Number, required: true, min: 1 },
  fromFacility: { type: String, required: true, trim: true },
  toFacility: { type: String, required: true, trim: true },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'in-progress', 'completed', 'rejected'],
    default: 'pending',
  },
  date: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true },
  chpName: { type: String, trim: true },
}, { _id: false });

const PatientSchema = new Schema<IPatient, IPatientModel>(
  {
    patientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

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

    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
      validate: {
        validator: function (v: Date) {
          return v < new Date(); // Must be in the past
        },
        message: 'Date of birth must be in the past',
      },
    },

    gender: {
      type: String,
      required: true,
      enum: ['male', 'female', 'other'],
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^\+?[\d\s\-\(\)]{7,}$/, 'Please enter a valid phone number'],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email'],
      sparse: true, // Allows null/undefined without violating unique
    },

    address: {
      type: AddressSchema,
      required: true,
    },

    emergencyContact: {
      type: EmergencyContactSchema,
      required: false,
    },

    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null],
    },

    allergies: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.every(a => a.length <= 100);
        },
        message: 'Each allergy must be under 100 characters',
      },
    },

    chronicConditions: {
      type: [String],
      default: [],
    },

    insuranceInfo: {
      type: InsuranceInfoSchema,
      required: false,
    },

    registeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    assignedChpId: {
      type: Schema.Types.ObjectId,
      ref: 'Chp',
      required: false,
      index: true,
    },

    assignedChpName: {
      type: String,
      required: false,
    },

    referralStages: {
      type: [ReferralStageSchema],
      default: [],
    },

    referralStatus: {
      type: String,
      required: true,
      enum: ['registered', 'screened', 'referred', 'accepted',
             'in-treatment', 'completed', 'rejected'],
      default: 'registered',
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: ['active', 'inactive', 'deceased'],
      default: 'active',
      index: true,
    },

    /** ─── SYNC METADATA (CRITICAL FOR VBCC) ─── */
    _sync: {
      type: SyncMetadataSchema,
      required: true,
      default: () => ({
        version: 1,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'system',
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: 'system',
      }),
    },
  },
  {
    timestamps: true, // Adds createdAt / updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ────────────────────────────────────────────────────────────────────────────
// INDEXES (Performance & Sync)
// ────────────────────────────────────────────────────────────────────────────

/** Compound index: fast lookup of active patients by version for pull queries */
PatientSchema.index({ '_sync.version': 1, status: 1 });

/** Compound index: CHP workload queries */
PatientSchema.index({ registeredBy: 1, '_sync.version': 1 });

/** Compound index: patients by assigned CHP for accompaniment tracking */
PatientSchema.index({ assignedCollector: 1, status: 1 });

/** Compound index: referral tracking dashboard */
PatientSchema.index({ referralStatus: 1, '_sync.modifiedAt': -1 });

// ────────────────────────────────────────────────────────────────────────────
// VIRTUALS
// ────────────────────────────────────────────────────────────────────────────

PatientSchema.virtual('fullName').get(function (this: IPatient) {
  return `${this.firstName} ${this.lastName}`;
});

PatientSchema.virtual('age').get(function (this: IPatient) {
  const diff = Date.now() - this.dateOfBirth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
});

// ────────────────────────────────────────────────────────────────────────────
// PRE-SAVE HOOKS (Version & Checksum Auto-Management)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Auto-increment version on every modification.
 * This is the heart of VBCC — the server is the sole authority
 * for version assignment.
 */
PatientSchema.pre('save', function (this: IPatient) {
  if (this.isModified() && !this.isNew) {
    this._sync.version += 1;
    this._sync.modifiedAt = new Date().toISOString();
  }

  // Recalculate checksum from serializable payload
  const payload = this.toObject();
  delete payload._sync;       // Exclude sync meta from checksum
  delete payload.__v;         // Exclude version key
  this._sync.checksum = computeChecksumSync(payload);
});

// ────────────────────────────────────────────────────────────────────────────
// STATIC METHODS (VBCC Primitives)
// ────────────────────────────────────────────────────────────────────────────

/**
 * findSinceVersion — Returns all patients whose _sync.version is greater
 * than the provided `since` parameter. This is the server-side engine
 * for MedSyncManager.pullRemoteChanges().
 */
PatientSchema.statics.findSinceVersion = async function (
  this: IPatientModel,
  version: number
): Promise<IPatient[]> {
  return this.find({
    '_sync.version': { $gt: version },
    '_sync.isDeleted': false,
  })
    .sort({ '_sync.version': 1 }) // Monotonic order — critical for causality
    .limit(50)
    .lean()
    .exec();
};

/**
 * applyIfVersionMatches — Atomic compare-and-swap.
 *
 * The server uses this to validate every push operation:
 *   IF doc._sync.version === expectedVersion
 *   THEN apply updates, increment version, return doc
 *   ELSE return null  →  caller sends HTTP 409
 *
 * Uses MongoDB's `findOneAndUpdate` with the version in the query filter,
 * making the check atomic (no race conditions between read and write).
 */
PatientSchema.statics.applyIfVersionMatches = async function (
  this: IPatientModel,
  patientId: mongoose.Types.ObjectId,
  expectedVersion: number,
  updates: Partial<IPatient>,
  modifiedBy: string
): Promise<IPatient | null> {
  const now = new Date().toISOString();

  const result = await this.findOneAndUpdate(
    {
      _id: patientId,
      '_sync.version': expectedVersion, // ← VBCC guard
    },
    {
      $set: {
        ...updates,
        '_sync.modifiedAt': now,
        '_sync.modifiedBy': modifiedBy,
      },
      $inc: { '_sync.version': 1 }, // ← Atomic version bump
    },
    { new: true } // Return the updated document
  ).exec();

  return result; // null if version didn't match (conflict)
};

// ────────────────────────────────────────────────────────────────────────────
// UTILITY
// ────────────────────────────────────────────────────────────────────────────

/** Synchronous checksum for pre-save hook (server-side only) */
import { createHash } from 'node:crypto';

function computeChecksumSync(payload: any): string {
  const str = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(str).digest('hex');
}

// ────────────────────────────────────────────────────────────────────────────
// MODEL EXPORT
// ────────────────────────────────────────────────────────────────────────────

const Patient = mongoose.model<IPatient, IPatientModel>('Patient', PatientSchema);

export default Patient;
