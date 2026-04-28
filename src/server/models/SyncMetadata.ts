/**
 * SyncMetadata Subdocument — Region-Aware with VBCC
 *
 * Embedded into every sync-aware entity (Patient, MedicalRecord, User, etc.)
 * Provides the version vector, region gating, and provenance tracking
 * required for MedSyncManager's Version-Based Concurrency Control.
 *
 * REGION-AWARE DESIGN:
 *   The `region` field is set on create and is IMMUTABLE. A patient
 *   registered in "Mtwapa" will always sync to Mtwapa staff. This
 *   prevents records from "vanishing" from a clinic's view during
 *   sync if a staff member from another region edits the record.
 *
 * VBCC FIELDS:
 *   `version`      — Monotonic counter, incremented server-side only.
 *   `changeId`     — The ChangeRecord.changeId that produced this
 *                    version. Enables tracing state back to its delta.
 *   `lastModifiedBy` — ObjectId ref to the User who last modified.
 */

import mongoose, { Schema, Types } from 'mongoose';

// ─── TYPES ───

export interface ISyncMetadata {
  /** Monotonic version counter — incremented on every server-accepted mutation */
  version: number;

  /** Region tag for regional sync gating (immutable after create) */
  region: string;

  /** ISO-8601 timestamp of last mutation */
  modifiedAt: string;

  /** ObjectId of the User who last modified this entity */
  lastModifiedBy: Types.ObjectId;

  /** SHA-256 checksum of the document payload (integrity guard) */
  checksum: string;

  /** Tombstone flag for soft-delete propagation */
  isDeleted: boolean;

  /** Original creation timestamp (immutable) */
  createdAt: string;

  /** ObjectId of the User who created the record */
  createdBy: Types.ObjectId;

  /**
   * The ChangeRecord.changeId that produced the current version.
   * Links entity state to its delta — enables full audit tracing.
   */
  changeId: string;
}

// ─── SCHEMA ───

export const SyncMetadataSchema = new Schema<ISyncMetadata>(
  {
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      index: true,
    },

    /**
     * Region tag — set once on creation, never changed.
     * Prevents records from vanishing from a clinic's sync scope.
     */
    region: {
      type: String,
      required: [true, 'Region is required for regional sync gating'],
      trim: true,
      immutable: true,
      index: true,
    },

    modifiedAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },

    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      default() {
        return new mongoose.Types.ObjectId('000000000000000000000000');
      },
    },

    checksum: {
      type: String,
      default: '',
    },

    isDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },

    createdAt: {
      type: String,
      required: true,
      immutable: true,
      default: () => new Date().toISOString(),
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      default() {
        return new mongoose.Types.ObjectId('000000000000000000000000');
      },
    },

    /**
     * References the ChangeRecord.changeId that last modified this entity.
     * Enables tracing from entity state → delta log entry.
     */
    changeId: {
      type: String,
      required: true,
      default: '',
    },
  },
  { _id: false }
);

/** Compound index for efficient regional pull queries */
SyncMetadataSchema.index({ region: 1, version: 1 }, { name: 'region_version_pull' });

export default SyncMetadataSchema;
