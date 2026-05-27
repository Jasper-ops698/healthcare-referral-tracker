import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
  patientId: mongoose.Types.ObjectId;
  patientName: string;
  patientPhone: string;
  patientIdNumber?: string;

  fromFacilityId: string;
  fromFacilityName: string;
  fromCollectorId: mongoose.Types.ObjectId;
  fromCollectorName: string;

  toFacilityId: string;
  toFacilityName: string;
  toCollectorId?: mongoose.Types.ObjectId;
  toCollectorName?: string;

  chpId?: string;
  chpName?: string;
  chpPhone?: string;
  chpEmail?: string;

  reason: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  notes?: string;

  status: 'pending' | 'accepted' | 'in-treatment' | 'completed' | 'rejected';

  medicalRecordId?: mongoose.Types.ObjectId;

  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  rejectedReason?: string;
}

const ReferralSchema = new Schema<IReferral>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientName: { type: String, required: true },
    patientPhone: { type: String, required: true },
    patientIdNumber: { type: String },

    fromFacilityId: { type: String, required: true, index: true },
    fromFacilityName: { type: String, required: true },
    fromCollectorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fromCollectorName: { type: String, required: true },

    toFacilityId: { type: String, required: true, index: true },
    toFacilityName: { type: String, required: true },
    toCollectorId: { type: Schema.Types.ObjectId, ref: 'User' },
    toCollectorName: { type: String },

    chpId: { type: String, index: true },
    chpName: { type: String },
    chpPhone: { type: String },
    chpEmail: { type: String },

    reason: { type: String, required: true },
    urgency: { type: String, enum: ['routine', 'urgent', 'emergency'], default: 'routine', index: true },
    notes: { type: String },

    status: { type: String, enum: ['pending', 'accepted', 'in-treatment', 'completed', 'rejected'], default: 'pending', index: true },

    medicalRecordId: { type: Schema.Types.ObjectId, ref: 'MedicalRecord' },

    acceptedAt: { type: Date },
    completedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectedReason: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    collection: 'referrals',
  }
);

// Compound index for incoming referrals query
ReferralSchema.index({ toFacilityId: 1, status: 1, createdAt: -1 });
// Compound index for outgoing referrals query
ReferralSchema.index({ fromFacilityId: 1, status: 1, createdAt: -1 });
// Compound index for patient referrals
ReferralSchema.index({ patientId: 1, createdAt: -1 });

export default mongoose.model<IReferral>('Referral', ReferralSchema);
