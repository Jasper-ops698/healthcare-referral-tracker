/**
 * ReferralV2 Model — Pure referral tracking (the core of the system)
 *
 * A referral is created when a collector at one station sends a patient
 * to another station. Tracks the entire journey from initial presentation
 * through counter-referral completion.
 */

import mongoose, { Schema } from 'mongoose';

export interface IReferralV2 extends mongoose.Document {
  // Patient identifiers
  patientId: string;       // Registration number (e.g., "KLF-2026-001")
  patientName: string;
  patientAge: number;
  patientGender: 'male' | 'female' | 'other';
  patientPhone: string;
  village?: string;        // Village of origin for disease incidence mapping

  // Source (where the referral originated)
  sourceStationId: string;
  sourceStationName: string;
  sourceStationType: 'household' | 'hip' | 'referral-center';
  sourceCollectorId: string;
  sourceCollectorName: string;

  // Destination (where the patient is being sent)
  destinationStationId: string;
  destinationStationName: string;
  destinationStationType: 'household' | 'hip' | 'referral-center';

  // CHP assigned at community level (name + contact only — NOT a system user)
  chpName?: string;
  chpPhone?: string;
  chpEmail?: string;

  // Clinical data
  initialDiagnosis: string;
  aiSuggestedCategory?: string; // From Transformer.js Edge AI
  aiConfidence?: number;
  reasonForReferral: string;

  // Transport
  modeOfTransport: 'ambulance' | 'matatu' | 'private-vehicle' | 'walking' | 'wheelchair' | 'stretcher' | 'other';
  transportNotes?: string;

  // Status workflow
  status: 'pending' | 'in-transit' | 'accepted' | 'in-treatment' | 'counter-referral-created' | 'completed' | 'rejected';

  // Counter-referral link (populated when destination creates counter-referral)
  counterReferralId?: mongoose.Types.ObjectId;

  // Urgency
  urgency: 'routine' | 'urgent' | 'emergency';

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  rejectedReason?: string;

  // Notes
  notes?: string;
}

const ReferralV2Schema = new Schema<IReferralV2>(
  {
    patientId: { type: String, required: true, index: true },
    patientName: { type: String, required: true, trim: true },
    patientAge: { type: Number, required: true, min: 0, max: 150 },
    patientGender: { type: String, enum: ['male', 'female', 'other'], required: true },
    patientPhone: { type: String, required: true, trim: true },
    village: { type: String, trim: true, index: true },

    sourceStationId: { type: String, required: true, index: true },
    sourceStationName: { type: String, required: true },
    sourceStationType: { type: String, enum: ['household', 'hip', 'referral-center'], required: true },
    sourceCollectorId: { type: String, required: true, index: true },
    sourceCollectorName: { type: String, required: true },

    destinationStationId: { type: String, required: true, index: true },
    destinationStationName: { type: String, required: true },
    destinationStationType: { type: String, enum: ['household', 'hip', 'referral-center'], required: true },

    chpName: { type: String, trim: true },
    chpPhone: { type: String, trim: true },
    chpEmail: { type: String, trim: true },

    initialDiagnosis: { type: String, required: true, trim: true },
    aiSuggestedCategory: { type: String, trim: true },
    aiConfidence: { type: Number, min: 0, max: 1 },
    reasonForReferral: { type: String, required: true, trim: true },

    modeOfTransport: {
      type: String,
      required: true,
      enum: ['ambulance', 'matatu', 'private-vehicle', 'walking', 'wheelchair', 'stretcher', 'other'],
    },
    transportNotes: { type: String, trim: true },

    status: {
      type: String,
      required: true,
      enum: ['pending', 'in-transit', 'accepted', 'in-treatment', 'counter-referral-created', 'completed', 'rejected'],
      default: 'pending',
      index: true,
    },

    counterReferralId: {
      type: Schema.Types.ObjectId,
      ref: 'CounterReferral',
      index: true,
    },

    urgency: {
      type: String,
      required: true,
      enum: ['routine', 'urgent', 'emergency'],
      default: 'routine',
      index: true,
    },

    acceptedAt: { type: Date },
    completedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectedReason: { type: String, trim: true },

    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'referrals_v2',
  }
);

// Compound indexes for common queries
ReferralV2Schema.index({ destinationStationId: 1, status: 1, createdAt: -1 }); // Incoming referrals
ReferralV2Schema.index({ sourceStationId: 1, status: 1, createdAt: -1 });     // Outgoing referrals
ReferralV2Schema.index({ patientId: 1, createdAt: -1 });                      // Patient history
ReferralV2Schema.index({ urgency: 1, status: 1 });                            // Emergency triage
ReferralV2Schema.index({ sourceCollectorId: 1, createdAt: -1 });              // Collector's referrals

export default mongoose.model<IReferralV2>('ReferralV2', ReferralV2Schema);
