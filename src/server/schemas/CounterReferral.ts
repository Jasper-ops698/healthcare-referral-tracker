/**
 * CounterReferral Model — Created when patient arrives at destination station
 *
 * Linked to the original ReferralV2 via referralId.
 * Captures final diagnosis, treatment outcome, and follow-up plan.
 * Triggers CHP email for community follow-up.
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
  chpEmail?: string;

  // Email tracking
  chpEmailSent: boolean;
  chpEmailSentAt?: Date;
  chpEmailStatus?: 'pending' | 'sent' | 'failed' | 'bounced';
  chpResponseToken?: string; // Unique token for CHP form link
  chpResponseReceived: boolean;
  chpResponseDate?: Date;
  chpResponseNotes?: string;
  chpResponseRecoveryStatus?: RecoveryStatus;

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
      unique: true, // One counter-referral per original referral
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
    chpEmail: { type: String, trim: true },

    chpEmailSent: { type: Boolean, default: false },
    chpEmailSentAt: { type: Date },
    chpEmailStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'bounced'],
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
