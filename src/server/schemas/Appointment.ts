/**
 * Appointment Schema — Sync-Aware Scheduling Model
 *
 * Appointments represent encounters between patients and providers.
 * They carry the same `_sync` metadata envelope as Patient documents,
 * enabling MedSyncManager to sync them under the same VBCC protocol.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { SyncMetadataSchema } from './syncMetadata.js';
import type { ISyncMetadata } from './syncMetadata.js';

// ────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ────────────────────────────────────────────────────────────────────────────

export interface IAppointment extends Document {
  /** Sequential appointment ID (e.g., APT-000001) */
  appointmentId: string;

  /** The patient this appointment is for */
  patientId: mongoose.Types.ObjectId;

  /** Reference to the provider / CHP */
  providerId: mongoose.Types.ObjectId;

  /** Scheduled date and time */
  scheduledAt: Date;

  /** Duration in minutes */
  durationMinutes: number;

  /** Type of encounter */
  type: 'routine' | 'follow-up' | 'emergency' | 'referral' |
        'screening' | 'vaccination' | 'consultation';

  /** Current status in the appointment lifecycle */
  status: 'scheduled' | 'confirmed' | 'checked-in' | 'in-progress' |
          'completed' | 'no-show' | 'cancelled' | 'rescheduled';

  /** Healthcare facility where the appointment occurs */
  facilityId: mongoose.Types.ObjectId;

  /** Department within the facility */
  department?: string;

  /** Reason for visit (chief complaint) */
  reason: string;

  /** Clinical notes entered after completion */
  notes?: string;

  /** Referral associated with this appointment (if any) */
  referralId?: mongoose.Types.ObjectId;

  /** Reminder preferences */
  reminders: {
    sms: boolean;
    email: boolean;
    hoursBefore: number;
  };

  /** Outcome / disposition after the appointment */
  outcome?: {
    diagnosis?: string;
    followUpRequired: boolean;
    followUpDate?: Date;
    prescribedMedications?: string[];
  };

  /** Embedded sync metadata for VBCC */
  _sync: ISyncMetadata;
}

export interface IAppointmentModel extends Model<IAppointment> {
  /** Find appointments modified since a given sync version */
  findSinceVersion(version: number): Promise<IAppointment[]>;

  /** Atomic compare-and-swap for conflict-free updates */
  applyIfVersionMatches(
    appointmentId: mongoose.Types.ObjectId,
    expectedVersion: number,
    updates: Partial<IAppointment>,
    modifiedBy: string
  ): Promise<IAppointment | null>;

  /** Get upcoming appointments for a provider */
  getUpcomingForProvider(
    providerId: mongoose.Types.ObjectId,
    daysAhead?: number
  ): Promise<IAppointment[]>;
}

// ────────────────────────────────────────────────────────────────────────────
// SCHEMA DEFINITION
// ────────────────────────────────────────────────────────────────────────────

const OutcomeSchema = new Schema({
  diagnosis: { type: String },
  followUpRequired: { type: Boolean, default: false },
  followUpDate: { type: Date },
  prescribedMedications: { type: [String], default: [] },
}, { _id: false });

const AppointmentSchema = new Schema<IAppointment, IAppointmentModel>(
  {
    appointmentId: {
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

    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },

    durationMinutes: {
      type: Number,
      required: true,
      min: 5,
      max: 480,
      default: 30,
    },

    type: {
      type: String,
      required: true,
      enum: ['routine', 'follow-up', 'emergency', 'referral',
             'screening', 'vaccination', 'consultation'],
    },

    status: {
      type: String,
      required: true,
      enum: ['scheduled', 'confirmed', 'checked-in', 'in-progress',
             'completed', 'no-show', 'cancelled', 'rescheduled'],
      default: 'scheduled',
      index: true,
    },

    facilityId: {
      type: Schema.Types.ObjectId,
      ref: 'Facility',
      required: true,
    },

    department: {
      type: String,
      trim: true,
    },

    reason: {
      type: String,
      required: [true, 'Reason for visit is required'],
      trim: true,
      maxlength: 500,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    referralId: {
      type: Schema.Types.ObjectId,
      ref: 'Referral',
      index: true,
    },

    reminders: {
      type: {
        sms: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        hoursBefore: { type: Number, default: 24, min: 1, max: 168 },
      },
      default: () => ({ sms: true, email: false, hoursBefore: 24 }),
      _id: false,
    },

    outcome: {
      type: OutcomeSchema,
      required: false,
    },

    /** ─── SYNC METADATA ─── */
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
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ────────────────────────────────────────────────────────────────────────────
// INDEXES
// ────────────────────────────────────────────────────────────────────────────

/** Pull queries: find appointments changed since a version */
AppointmentSchema.index({ '_sync.version': 1, status: 1 });

/** Provider schedule views */
AppointmentSchema.index({ providerId: 1, scheduledAt: 1, status: 1 });

/** Patient appointment history */
AppointmentSchema.index({ patientId: 1, scheduledAt: -1 });

/** Facility scheduling board */
AppointmentSchema.index({ facilityId: 1, scheduledAt: 1, status: 1 });

// ────────────────────────────────────────────────────────────────────────────
// PRE-SAVE HOOKS
// ────────────────────────────────────────────────────────────────────────────

AppointmentSchema.pre('save', function (this: IAppointment) {
  if (this.isModified() && !this.isNew) {
    this._sync.version += 1;
    this._sync.modifiedAt = new Date().toISOString();
  }

  const payload = this.toObject();
  delete payload._sync;
  delete payload.__v;
  this._sync.checksum = computeChecksumSync(payload);
});

// ────────────────────────────────────────────────────────────────────────────
// STATIC METHODS
// ────────────────────────────────────────────────────────────────────────────

AppointmentSchema.statics.findSinceVersion = async function (
  this: IAppointmentModel,
  version: number
): Promise<IAppointment[]> {
  return this.find({
    '_sync.version': { $gt: version },
    '_sync.isDeleted': false,
  })
    .sort({ '_sync.version': 1 })
    .limit(50)
    .lean()
    .exec();
};

AppointmentSchema.statics.applyIfVersionMatches = async function (
  this: IAppointmentModel,
  appointmentId: mongoose.Types.ObjectId,
  expectedVersion: number,
  updates: Partial<IAppointment>,
  modifiedBy: string
): Promise<IAppointment | null> {
  const now = new Date().toISOString();

  return this.findOneAndUpdate(
    {
      _id: appointmentId,
      '_sync.version': expectedVersion,
    },
    {
      $set: {
        ...updates,
        '_sync.modifiedAt': now,
        '_sync.modifiedBy': modifiedBy,
      },
      $inc: { '_sync.version': 1 },
    },
    { new: true }
  ).exec();
};

AppointmentSchema.statics.getUpcomingForProvider = async function (
  this: IAppointmentModel,
  providerId: mongoose.Types.ObjectId,
  daysAhead: number = 7
): Promise<IAppointment[]> {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + daysAhead);

  return this.find({
    providerId,
    scheduledAt: { $gte: from, $lte: to },
    status: { $nin: ['completed', 'cancelled', 'no-show'] },
  })
    .sort({ scheduledAt: 1 })
    .populate('patientId', 'firstName lastName phone')
    .lean()
    .exec();
};

// ────────────────────────────────────────────────────────────────────────────
// UTILITY
// ────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

function computeChecksumSync(payload: any): string {
  const str = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(str).digest('hex');
}

// ────────────────────────────────────────────────────────────────────────────
// MODEL EXPORT
// ────────────────────────────────────────────────────────────────────────────

const Appointment = mongoose.model<IAppointment, IAppointmentModel>(
  'Appointment',
  AppointmentSchema
);

export default Appointment;
