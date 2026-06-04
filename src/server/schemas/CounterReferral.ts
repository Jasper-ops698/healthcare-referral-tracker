/**
 * CounterReferral Model — Created when patient arrives at destination station
 *
 * Linked to the original ReferralV2 via referralId.
 * Captures final diagnosis, treatment outcome, and follow-up plan.
 * Notifies CHP via SMS for community follow-up.
 */

import mongoose, { Schema } from 'mongoose';

export type RecoveryStatus = 'fully-recovered' | 'partially-recovered' | 'still-unwell' | 'deceased' | 'lost-to-follow-up';

export interface ICounterReferral extends mongoose.Document {
  // Link to original referral
  referralId: mongoose.Types.ObjectId;
  patientId: string;
  patientName: string;

  // Destination station info
  stationId: string;
  stationName: string;
  collectorId: string;
  collectorName: string;

  // Clinical outcome
  finalDiagnosis: string;
  treatmentProvided: string;
  medicationsGiven?: string;
  proceduresDone?: string;

  // Recovery assessment
  recoveryStatus: RecoveryStatus;
  recoveryNotes?: string;

  // Follow-up plan
  nextVisitDate?: Date;
  followUpInstructions: string;
  warningSigns?: string;

  // CHP assignment for community follow-up
  chpName: string;
  chpPhone?: string;

  // SMS tracking
  chpSMSSent: boolean;
  chpSMSSentAt?: Date;
  chpSMSStatus?: 'pending' | 'sent' | 'failed';

  /** Original collector notification tracking */
  originalCollectorId?: string;
  originalCollectorName?: string;
  collectorNotified: boolean;
  collectorNotifiedAt?: Date;
  collectorNotificationStatus?: 'pending' | 'sent' | 'failed';
  chpResponseToken?: string; // Unique token for CHP form link / USSD
  chpResponseReceived: boolean;
  chpResponseDate?: Date;
  chpResponseNotes?: string;
  chpResponseRecoveryStatus?: RecoveryStatus;

  // CHP escalation fields
  chpNeedsMedicalAttention?: boolean;
  chpRecommendedAction?: 'see-doctor' | 'return-to-facility' | 'emergency' | 'monitor' | 'other';
  chpSymptomsObserved?: string;

  // CHP medication & wound assessment
  medicationAdherence?: 'taking-regularly' | 'taking-irregularly' | 'not-taking' | 'unknown';
  woundHealingProgress?: 'healing-well' | 'slow-healing' | 'infected' | 'not-applicable';
  woundPhotoUrl?: string;
  woundPhotoDescription?: string;

  // Status
  status: 'active' | 'closed' | 'escalated';

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

const CounterReferralSchema = new Schema<ICounterReferral>(
  {
    referralId: {
      type: Schema.Types.ObjectId,
      ref: 'ReferralV2',
      required: true,
      unique: true,
      index: true,
    },
    patientId: { type: String, required: true, index: true },
    patientName: { type: String, required: true },

    stationId: { type: String, required: true, index: true },
    stationName: { type: String, required: true },
    collectorId: { type: String, required: true, index: true },
    collectorName: { type: String, required: true },

    finalDiagnosis: { type: String, required: true, trim: true },
    treatmentProvided: { type: String, required: true, trim: true },
    medicationsGiven: { type: String, trim: true },
    proceduresDone: { type: String, trim: true },

    recoveryStatus: {
      type: String,
      required: true,
      enum: ['fully-recovered', 'partially-recovered', 'still-unwell', 'deceased', 'lost-to-follow-up'],
      default: 'still-unwell',
      index: true,
    },
    recoveryNotes: { type: String, trim: true },

    nextVisitDate: { type: Date },
    followUpInstructions: { type: String, required: true, trim: true },
    warningSigns: { type: String, trim: true },

    chpName: { type: String, required: true, trim: true },
    chpPhone: { type: String, trim: true },

    chpSMSSent: { type: Boolean, default: false },
    chpSMSSentAt: { type: Date },
    chpSMSStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },

    // Original collector notification
    originalCollectorId: { type: String, index: true },
    originalCollectorName: { type: String },
    collectorNotified: { type: Boolean, default: false },
    collectorNotifiedAt: { type: Date },
    collectorNotificationStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    chpResponseToken: { type: String, unique: true, sparse: true },
    chpResponseReceived: { type: Boolean, default: false },
    chpResponseDate: { type: Date },
    chpResponseNotes: { type: String, trim: true },
    chpResponseRecoveryStatus: {
      type: String,
      enum: ['fully-recovered', 'partially-recovered', 'still-unwell', 'deceased', 'lost-to-follow-up'],
    },

    chpNeedsMedicalAttention: { type: Boolean, default: false },
    chpRecommendedAction: {
      type: String,
      enum: ['see-doctor', 'return-to-facility', 'emergency', 'monitor', 'other'],
    },
    chpSymptomsObserved: { type: String, trim: true },

    // CHP medication & wound assessment
    medicationAdherence: {
      type: String,
      enum: ['taking-regularly', 'taking-irregularly', 'not-taking', 'unknown'],
    },
    woundHealingProgress: {
      type: String,
      enum: ['healing-well', 'slow-healing', 'infected', 'not-applicable'],
    },
    woundPhotoUrl: { type: String }, // base64 encoded
    woundPhotoDescription: { type: String, trim: true },

    status: {
      type: String,
      required: true,
      enum: ['active', 'closed', 'escalated'],
      default: 'active',
      index: true,
    },

    closedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'counter_referrals',
  }
);

// Compound indexes
CounterReferralSchema.index({ stationId: 1, status: 1, createdAt: -1 });
CounterReferralSchema.index({ patientId: 1, createdAt: -1 });
CounterReferralSchema.index({ chpResponseToken: 1 });
CounterReferralSchema.index({ recoveryStatus: 1, status: 1 });

export default mongoose.model<ICounterReferral>('CounterReferral', CounterReferralSchema);
