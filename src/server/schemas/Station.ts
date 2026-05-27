/**
 * Station Model — Where collectors work
 *
 * Types:
 *   - household:   Community household visits
 *   - hip:         Health Information Point
 *   - referral-center: Referral facility (Bomani Dispensary, Kilifi General Hospital, etc.)
 */

import mongoose, { Schema } from 'mongoose';

export interface IStation extends mongoose.Document {
  name: string;
  type: 'household' | 'hip' | 'referral-center';
  code: string;
  county: string;
  subCounty?: string;
  ward?: string;
  description?: string;
  isActive: boolean;
  parentStationId?: string; // e.g., a HIP might link to a referral center
  contactPhone?: string;
  contactEmail?: string;
  operatingHours?: string;
  services: string[];
  createdAt: Date;
  updatedAt: Date;
}

const StationSchema = new Schema<IStation>(
  {
    name: {
      type: String,
      required: [true, 'Station name is required'],
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['household', 'hip', 'referral-center'],
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    county: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    subCounty: { type: String, trim: true },
    ward: { type: String, trim: true },
    description: { type: String, trim: true },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    parentStationId: {
      type: String,
      index: true,
    },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    operatingHours: { type: String, default: '08:00 - 17:00' },
    services: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'stations',
  }
);

// Compound index for querying active stations by type
StationSchema.index({ type: 1, county: 1, isActive: 1 });

export default mongoose.model<IStation>('Station', StationSchema);
