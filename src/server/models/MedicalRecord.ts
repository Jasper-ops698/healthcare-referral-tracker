/**
 * MedicalRecord Model — Region-Aware Clinical Documentation
 *
 * Medical records capture diagnoses, symptoms, vital signs, prescriptions,
 * and clinical notes from each patient encounter.
 *
 * REGION-AWARE VBCC:
 *   - `applyIfVersionMatches()` validates incomingVersion against the
 *     database's current version. On mismatch, throws HTTP 409 Conflict.
 *   - The `region` field (stored in `_sync.region`) is IMMUTABLE once set.
 *     A record created in "Mtwapa" stays in "Mtwapa" — preventing it
 *     from vanishing from that clinic's sync scope.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { SyncMetadataSchema } from './SyncMetadata.js';
import type { ISyncMetadata } from './SyncMetadata.js';

// ─── TYPES ───

export type RecordType = 'screening' | 'diagnosis' | 'treatment' |
                         'follow_up' | 'referral' | 'discharge' | 'lab_result';

export type RecordStatus = 'draft' | 'final' | 'amended' | 'archived';

export interface IVitalSigns {
  bloodPressure?: { systolic: number; diastolic: number };
  heartRate?: number;
  respiratoryRate?: number;
  temperature?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  bloodGlucose?: number;
}

export interface IMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: 'oral' | 'iv' | 'im' | 'sc' | 'topical' | 'inhalation' | 'other';
  instructions?: string;
  prescribedAt: string;
}

export interface ILabResult {
  testName: string;
  result: string;
  referenceRange?: string;
  unit?: string;
  isAbnormal: boolean;
  performedAt: string;
  performedBy?: string;
}

/** 409 Conflict error — thrown when VBCC version check fails */
export class VersionConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'VERSION_CONFLICT';
  constructor(
    message: string,
    public readonly incomingVersion: number,
    public readonly databaseVersion: number,
  ) {
    super(message);
    this.name = 'VersionConflictError';
  }
}

export interface IMedicalRecord extends Document {
  recordId: string;
  patientId: mongoose.Types.ObjectId;
  recordedBy: mongoose.Types.ObjectId;
  recordType: RecordType;
  status: RecordStatus;
  chiefComplaint: string;
  historyOfPresentIllness?: string;
  reviewOfSystems?: string;
  physicalExamination?: string;
  vitalSigns?: IVitalSigns;
  diagnosis: string[];
  differentialDiagnosis?: string[];
  clinicalNotes?: string;
  medications: IMedication[];
  labResults?: ILabResult[];
  procedures?: string[];
  followUpInstructions?: string;
  referralDetails?: {
    referredToFacility: string;
    referredToDepartment?: string;
    reasonForReferral: string;
    urgency: 'routine' | 'urgent' | 'emergency';
    expectedDateOfVisit?: string;
    referralStatus: 'pending' | 'accepted' | 'declined' | 'completed';
  };
  encounterDate: string;
  nextFollowUpDate?: string;
  encounterDurationMinutes?: number;
  _sync: ISyncMetadata;
}

export interface IMedicalRecordModel extends Model<IMedicalRecord> {
  /**
   * Atomically apply updates ONLY if the incoming version matches the
   * current database version. If versions differ, throws 409 Conflict.
   *
   * @param recordId       — The Mongo _id of the medical record
   * @param incomingVersion — The client's view of the current version
   * @param updateData      — Fields to update (version mismatch → 409)
   * @param modifiedBy      — ObjectId of the user making the change
   * @param changeId        — The ChangeRecord.changeId for audit tracing
   *
   * @returns The updated document, or null if not found
   * @throws VersionConflictError if incomingVersion ≠ databaseVersion
   */
  applyIfVersionMatches(
    recordId: mongoose.Types.ObjectId,
    incomingVersion: number,
    updateData: Partial<IMedicalRecord>,
    modifiedBy: mongoose.Types.ObjectId,
    changeId: string,
  ): Promise<IMedicalRecord | null>;

  /**
   * Pull all records for a given region modified since `sinceVersion`.
   * This is the server-side engine for regional sync.
   */
  getDeltas(
    region: string,
    sinceVersion: number,
    options?: { limit?: number },
  ): Promise<IMedicalRecord[]>;

  findByPatient(patientId: mongoose.Types.ObjectId): Promise<IMedicalRecord[]>;
}

// ─── SUB-SCHEMAS ───

const BloodPressureSchema = new Schema({
  systolic: { type: Number, required: true, min: 50, max: 300 },
  diastolic: { type: Number, required: true, min: 30, max: 200 },
}, { _id: false });

const VitalSignsSchema = new Schema<IVitalSigns>({
  bloodPressure: { type: BloodPressureSchema },
  heartRate: { type: Number, min: 30, max: 250 },
  respiratoryRate: { type: Number, min: 5, max: 60 },
  temperature: { type: Number, min: 30, max: 45 },
  oxygenSaturation: { type: Number, min: 50, max: 100 },
  weight: { type: Number, min: 0.5, max: 500 },
  height: { type: Number, min: 10, max: 300 },
  bmi: { type: Number, min: 5, max: 100 },
  bloodGlucose: { type: Number, min: 20, max: 1000 },
}, { _id: false });

const MedicationSchema = new Schema<IMedication>({
  name: { type: String, required: true },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  duration: { type: String, required: true },
  route: {
    type: String,
    required: true,
    enum: ['oral', 'iv', 'im', 'sc', 'topical', 'inhalation', 'other'],
  },
  instructions: { type: String },
  prescribedAt: { type: String, required: true },
}, { _id: false });

const LabResultSchema = new Schema<ILabResult>({
  testName: { type: String, required: true },
  result: { type: String, required: true },
  referenceRange: { type: String },
  unit: { type: String },
  isAbnormal: { type: Boolean, default: false },
  performedAt: { type: String, required: true },
  performedBy: { type: String },
}, { _id: false });

const ReferralDetailsSchema = new Schema({
  referredToFacility: { type: String, required: true },
  referredToDepartment: { type: String },
  reasonForReferral: { type: String, required: true },
  urgency: { type: String, required: true, enum: ['routine', 'urgent', 'emergency'] },
  expectedDateOfVisit: { type: String },
  referralStatus: {
    type: String,
    required: true,
    enum: ['pending', 'accepted', 'declined', 'completed'],
    default: 'pending',
  },
}, { _id: false });

// ─── MAIN SCHEMA ───

const MedicalRecordSchema = new Schema<IMedicalRecord, IMedicalRecordModel>(
  {
    recordId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    recordType: {
      type: String,
      required: true,
      enum: ['screening', 'diagnosis', 'treatment', 'follow_up',
             'referral', 'discharge', 'lab_result'],
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: ['draft', 'final', 'amended', 'archived'],
      default: 'draft',
      index: true,
    },

    chiefComplaint: {
      type: String,
      required: [true, 'Chief complaint is required'],
      trim: true,
      maxlength: [500, 'Chief complaint cannot exceed 500 characters'],
    },

    historyOfPresentIllness: {
      type: String,
      trim: true,
      maxlength: [5000, 'HPI cannot exceed 5000 characters'],
    },

    reviewOfSystems: {
      type: String,
      trim: true,
      maxlength: [3000, 'ROS cannot exceed 3000 characters'],
    },

    physicalExamination: {
      type: String,
      trim: true,
      maxlength: [5000, 'Physical exam notes cannot exceed 5000 characters'],
    },

    vitalSigns: { type: VitalSignsSchema },

    diagnosis: { type: [String], required: true, default: [] },

    differentialDiagnosis: { type: [String], default: [] },

    clinicalNotes: {
      type: String,
      trim: true,
      maxlength: [10000, 'Clinical notes cannot exceed 10000 characters'],
    },

    medications: { type: [MedicationSchema], default: [] },

    labResults: { type: [LabResultSchema], default: [] },

    procedures: { type: [String], default: [] },

    followUpInstructions: {
      type: String,
      trim: true,
      maxlength: [2000, 'Follow-up instructions cannot exceed 2000 characters'],
    },

    referralDetails: { type: ReferralDetailsSchema },

    encounterDate: { type: String, required: true, index: true },

    nextFollowUpDate: { type: String },

    encounterDurationMinutes: { type: Number, min: 1, max: 480 },

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

/** Primary regional sync index: pull records for a region since a version */
MedicalRecordSchema.index(
  { '_sync.region': 1, '_sync.version': 1 },
  { name: 'regional_sync_pull' }
);

MedicalRecordSchema.index({ '_sync.version': 1, status: 1 });
MedicalRecordSchema.index({ patientId: 1, '_sync.version': 1 });
MedicalRecordSchema.index({ recordedBy: 1, encounterDate: -1 });
MedicalRecordSchema.index({ 'referralDetails.referralStatus': 1, recordType: 1 });

// ─── PRE-SAVE HOOKS ───

MedicalRecordSchema.pre('save', function (this: IMedicalRecord) {
  if (this.isModified() && !this.isNew) {
    this._sync.version += 1;
    this._sync.modifiedAt = new Date().toISOString();
  }

  // Recalculate checksum (exclude _sync and __v)
  const payload = this.toObject();
  delete payload._sync;
  delete payload.__v;
  this._sync.checksum = computeChecksumSync(payload);
});

// ─── STATIC METHODS ───

/**
 * applyIfVersionMatches — Atomic compare-and-swap with VBCC.
 *
 * STEP 1: Read the current document and its version.
 * STEP 2: If incomingVersion !== doc._sync.version → throw 409.
 * STEP 3: If match → apply updates atomically via findOneAndUpdate.
 *
 * The `region` field is stripped from updates — it is IMMUTABLE.
 */
MedicalRecordSchema.statics.applyIfVersionMatches = async function (
  this: IMedicalRecordModel,
  recordId: mongoose.Types.ObjectId,
  incomingVersion: number,
  updateData: Partial<IMedicalRecord>,
  modifiedBy: mongoose.Types.ObjectId,
  changeId: string,
): Promise<IMedicalRecord | null> {
  // ── Step 1: Read current document ──
  const current = await this.findById(recordId)
    .select('_id _sync.version _sync.region')
    .lean()
    .exec();

  if (!current) return null; // Record not found

  const databaseVersion = current._sync.version;

  // ── Step 2: VBCC Guard — versions must match ──
  if (incomingVersion !== databaseVersion) {
    throw new VersionConflictError(
      `Version mismatch: expected ${incomingVersion} but database has ${databaseVersion}. ` +
      `The record was modified by another client. Pull latest changes and retry.`,
      incomingVersion,
      databaseVersion,
    );
  }

  // ── Step 3: Strip immutable region ──
  const safeUpdates = { ...updateData };
  // Remove any attempt to modify the region — it's immutable
  if ((safeUpdates as any)._sync?.region !== undefined) {
    delete (safeUpdates as any)._sync.region;
  }
  // Also strip any direct region field if someone tries to add it at root
  if ((safeUpdates as any).region !== undefined) {
    delete (safeUpdates as any).region;
  }

  const now = new Date().toISOString();

  // ── Step 4: Atomic update ──
  return this.findOneAndUpdate(
    {
      _id: recordId,
      '_sync.version': databaseVersion, // Double-check: still the same version
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
 * getDeltas — Regional delta sync.
 *
 * Returns all records for `region` where _sync.version > sinceVersion,
 * sorted monotonically. A staff member in Mtwapa only pulls Mtwapa
 * records — not the entire database.
 */
MedicalRecordSchema.statics.getDeltas = async function (
  this: IMedicalRecordModel,
  region: string,
  sinceVersion: number,
  options: { limit?: number } = {},
): Promise<IMedicalRecord[]> {
  const limit = Math.min(options.limit ?? 50, 100);

  return this.find({
    '_sync.region': region,
    '_sync.version': { $gt: sinceVersion },
    '_sync.isDeleted': false,
  })
    .sort({ '_sync.version': 1 }) // Monotonic — critical for causality
    .limit(limit)
    .lean()
    .exec();
};

MedicalRecordSchema.statics.findByPatient = async function (
  this: IMedicalRecordModel,
  patientId: mongoose.Types.ObjectId
): Promise<IMedicalRecord[]> {
  return this.find({ patientId })
    .sort({ encounterDate: -1 })
    .lean()
    .exec();
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

const MedicalRecord = mongoose.model<IMedicalRecord, IMedicalRecordModel>(
  'MedicalRecord',
  MedicalRecordSchema
);

export default MedicalRecord;
