/**
 * Facility Model — Healthcare Facilities (Clinics, Hospitals, etc.)
 *
 * Facilities are referenced by users (assignedFacility) and patients
 * (referral stages). Keeping them as a proper collection enables
 * validation, dropdown population, and analytics.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ─── TYPES ───

export interface IFacility extends Document {
  name: string;
  type: 'clinic' | 'hospital' | 'health-center' | 'referral-hospital';
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  email?: string;
  departments: string[];
  services: string[];
  isActive: boolean;
  county?: string;
  subCounty?: string;
  ward?: string;
}

// ─── SCHEMA ───

const FacilitySchema = new Schema<IFacility>(
  {
    name: {
      type: String,
      required: [true, 'Facility name is required'],
      trim: true,
      maxlength: [200, 'Facility name cannot exceed 200 characters'],
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['clinic', 'hospital', 'health-center', 'referral-hospital'],
      index: true,
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true, default: 'Kenya' },
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^\+[\d\s\-\(\)]{7,}$/, 'Please enter a valid phone number'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email'],
    },
    departments: {
      type: [String],
      default: [],
    },
    services: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    county: {
      type: String,
      trim: true,
      index: true,
    },
    subCounty: {
      type: String,
      trim: true,
    },
    ward: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── INDEXES ───

FacilitySchema.index({ name: 'text', county: 'text' });
FacilitySchema.index({ type: 1, isActive: 1 });

// ─── MODEL ───

const Facility = mongoose.model<IFacility>('Facility', FacilitySchema);

export default Facility;
