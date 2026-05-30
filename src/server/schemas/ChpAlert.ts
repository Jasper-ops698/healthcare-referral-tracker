/**
 * ChpAlert Model — Notifications sent to collectors when a CHP flags
 * a patient as needing medical attention after counter-referral.
 *
 * Part of the Smart CHP Escalation (Option C) workflow.
 */

import mongoose, { Schema } from 'mongoose';

export interface IChpAlert extends mongoose.Document {
  // Who to notify
  collectorId: string;

  // Source documents
  counterReferralId: mongoose.Types.ObjectId;
  referralId: mongoose.Types.ObjectId;

  // Patient info
  patientId: string;
  patientName: string;

  // CHP info
  chpName: string;

  // Alert content
  status: 'open' | 'acknowledged' | 'resolved';
  priority: 'emergency' | 'urgent' | 'routine';
  message: string;

  // CHP's observations (denormalized for quick display)
  chpSymptomsObserved?: string;
  chpRecommendedAction?: 'see-doctor' | 'return-to-facility' | 'emergency' | 'monitor' | 'other';

  // Resolution tracking
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionAction?: 'follow-up-referral-created' | 'monitored' | 'no-action-needed' | 'other';
  resolutionNotes?: string;
  followUpReferralId?: string; // If collector created a follow-up referral

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const ChpAlertSchema = new Schema<IChpAlert>(
  {
    collectorId: { type: String, required: true, index: true },

    counterReferralId: {
      type: Schema.Types.ObjectId,
      ref: 'CounterReferral',
      required: true,
      index: true,
    },
    referralId: {
      type: Schema.Types.ObjectId,
      ref: 'ReferralV2',
      required: true,
      index: true,
    },

    patientId: { type: String, required: true, index: true },
    patientName: { type: String, required: true },

    chpName: { type: String, required: true },

    status: {
      type: String,
      required: true,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      required: true,
      enum: ['emergency', 'urgent', 'routine'],
      default: 'routine',
      index: true,
    },
    message: { type: String, required: true, trim: true },

    chpSymptomsObserved: { type: String, trim: true },
    chpRecommendedAction: {
      type: String,
      enum: ['see-doctor', 'return-to-facility', 'emergency', 'monitor', 'other'],
    },

    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    resolutionAction: {
      type: String,
      enum: ['follow-up-referral-created', 'monitored', 'no-action-needed', 'other'],
    },
    resolutionNotes: { type: String, trim: true },
    followUpReferralId: { type: String, index: true },

  },
  {
    timestamps: true,
    collection: 'chp_alerts',
  }
);

// Compound indexes
ChpAlertSchema.index({ collectorId: 1, status: 1, createdAt: -1 }); // Collector's active alerts
ChpAlertSchema.index({ patientId: 1, createdAt: -1 }); // Patient alert history
ChpAlertSchema.index({ priority: 1, status: 1 }); // Emergency triage

export default mongoose.model<IChpAlert>('ChpAlert', ChpAlertSchema);
