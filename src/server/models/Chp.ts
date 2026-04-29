/**
 * CHP Model — Community Health Promoters (Non-System Users)
 *
 * CHPs are community volunteers who accompany patients through referrals.
 * They do NOT have login accounts — they are managed by admin and assigned
 * to patients by collectors.
 *
 * Fields tailored for African community health contexts:
 *   - Village / Sub-location / Ward / County (Kenyan administrative structure)
 *   - National ID for official identification
 *   - CHP registration number ( ministry-issued )
 *   - Languages spoken ( for patient communication )
 *   - Years of experience
 *   - Supervisor ( senior CHP or facility nurse )
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { SyncMetadataSchema } from './SyncMetadata.js';
import type { ISyncMetadata } from './SyncMetadata.js';

// ─── TYPES ───

export type ChpStatus = 'active' | 'inactive' | 'suspended';

export interface IChp extends Document {
  /** Human-readable CHP ID (e.g., CHP-0001) */
  chpId: string;

  fullName: string;
  /** National ID / Passport number */
  nationalId: string;
  /** Email address for notifications */
  email?: string;
  /** Primary phone (usually M-Pesa capable) */
  phone: string;
  /** Alternate phone (family member, spouse) */
  alternatePhone?: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: Date;

  // ── Location (Kenyan administrative structure) ──
  village: string;
  subLocation: string;
  ward: string;
  county: string;

  // ── Professional ──
  /** Languages spoken (e.g., ['Swahili', 'Kikuyu', 'English']) */
  languages: string[];
  /** Years as a CHP */
  yearsOfExperience: number;
  /** Ministry of Health CHP registration number */
  chpRegNumber?: string;

  // ── Supervisor ──
  supervisorName?: string;
  supervisorPhone?: string;

  // ── Assignment ──
  /** Facility this CHP is assigned to */
  facilityId?: mongoose.Types.ObjectId;
  facilityName?: string;

  // ── Status ──
  status: ChpStatus;

  // ── Photo ──
  avatar?: string;

  // ── Audit ──
  createdBy: mongoose.Types.ObjectId; // admin who created this CHP
  _sync: ISyncMetadata;
}

export interface IChpModel extends Model<IChp> {
  findByChpId(chpId: string): Promise<IChp | null>;
  findByFacility(facilityId: mongoose.Types.ObjectId): Promise<IChp[]>;
  findByCounty(county: string): Promise<IChp[]>;
}

// ─── SCHEMA ───

const ChpSchema = new Schema<IChp, IChpModel>(
  {
    chpId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },

    nationalId: {
      type: String,
      required: [true, 'National ID is required'],
      trim: true,
      index: true,
    },

    email: {
      type: String,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
      lowercase: true,
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^\+?[\d\s\-\(\)]{7,}$/, 'Please enter a valid phone number'],
    },

    alternatePhone: {
      type: String,
      match: [/^\+?[\d\s\-\(\)]{7,}$/, 'Please enter a valid phone number'],
    },

    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true,
    },

    dateOfBirth: { type: Date },

    // ── Location ──
    village: {
      type: String,
      required: [true, 'Village is required'],
      trim: true,
    },

    subLocation: {
      type: String,
      required: [true, 'Sub-location is required'],
      trim: true,
    },

    ward: {
      type: String,
      required: [true, 'Ward is required'],
      trim: true,
    },

    county: {
      type: String,
      required: [true, 'County is required'],
      trim: true,
      index: true,
    },

    // ── Professional ──
    languages: {
      type: [String],
      default: ['Swahili'],
    },

    yearsOfExperience: {
      type: Number,
      min: 0,
      max: 50,
      default: 0,
    },

    chpRegNumber: {
      type: String,
      trim: true,
      sparse: true,
    },

    // ── Supervisor ──
    supervisorName: { type: String, trim: true },
    supervisorPhone: {
      type: String,
      match: [/^\+?[\d\s\-\(\)]{7,}$/, 'Please enter a valid phone number'],
    },

    // ── Assignment ──
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: 'Facility',
      index: true,
    },

    facilityName: { type: String, trim: true },

    // ── Status ──
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },

    avatar: { type: String },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

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

ChpSchema.index({ county: 1, status: 1 });
ChpSchema.index({ facilityId: 1, status: 1 });
ChpSchema.index({ '_sync.region': 1, '_sync.version': 1 });

// ─── STATIC METHODS ───

ChpSchema.statics.findByChpId = async function (
  this: IChpModel,
  chpId: string
): Promise<IChp | null> {
  return this.findOne({ chpId }).exec();
};

ChpSchema.statics.findByFacility = async function (
  this: IChpModel,
  facilityId: mongoose.Types.ObjectId
): Promise<IChp[]> {
  return this.find({ facilityId, status: 'active' }).sort({ fullName: 1 }).lean().exec();
};

ChpSchema.statics.findByCounty = async function (
  this: IChpModel,
  county: string
): Promise<IChp[]> {
  return this.find({ county, status: 'active' }).sort({ fullName: 1 }).lean().exec();
};

// ─── PRE-SAVE ───

ChpSchema.pre('save', function (this: IChp) {
  if (this.isModified() && !this.isNew) {
    this._sync.version += 1;
    this._sync.modifiedAt = new Date().toISOString();
  }
});

// ─── MODEL EXPORT ───

const Chp = mongoose.model<IChp, IChpModel>('Chp', ChpSchema);

export default Chp;
