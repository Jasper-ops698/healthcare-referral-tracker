/**
 * Sync Metadata Subdocument Schema
 *
 * Embedded into every sync-aware entity (Patient, Appointment, User, etc.)
 * Provides the version vector and provenance tracking required by
 * MedSyncManager's Version-Based Concurrency Control.
 */

import { Schema } from 'mongoose';

/** Fields embedded in every entity document for VBCC */
export interface ISyncMetadata {
  /** Monotonic version counter — incremented on every mutation */
  version: number;

  /** ISO-8601 timestamp of last mutation */
  modifiedAt: string;

  /** Device/client that performed the last mutation */
  modifiedBy: string;

  /** SHA-256 checksum of the document payload (integrity guard) */
  checksum: string;

  /** Tombstone flag for soft-delete propagation */
  isDeleted: boolean;

  /** Original creation timestamp (immutable) */
  createdAt: string;

  /** Device that created the record */
  createdBy: string;
}

/** Mongoose subdocument schema for sync metadata */
export const SyncMetadataSchema = new Schema<ISyncMetadata>(
  {
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      index: true, // Critical: indexed for fast `since={version}` queries
    },

    modifiedAt: {
      type: String, // Stored as ISO-8601 to avoid timezone issues
      required: true,
      default: () => new Date().toISOString(),
    },

    modifiedBy: {
      type: String,
      required: true,
      default: 'unknown',
    },

    checksum: {
      type: String,
      required: true,
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
      immutable: true, // Never changes after creation
      default: () => new Date().toISOString(),
    },

    createdBy: {
      type: String,
      required: true,
      immutable: true,
      default: 'unknown',
    },
  },
  { _id: false } // Don't create a separate _id for the subdocument
);

export default SyncMetadataSchema;
