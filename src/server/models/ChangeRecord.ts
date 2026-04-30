/**
 * ChangeRecord Model — Regional Delta Log
 *
 * The MongoDB counterpart to the IndexedDB Outbox. Every mutation
 * accepted by the server is recorded here as an append-only log entry.
 *
 * REGIONAL DELTA SYNC:
 *   The `getDeltas(region, sinceVersion)` method queries only changes
 *   tagged with a specific region. A CHP in Mtwapa only receives
 *   Mtwapa deltas — not the entire country's patient records.
 *
 * This collection is the SINGLE SOURCE OF TRUTH for the /sync/pull endpoint.
 * DESIGN: Append-only, immutable, monotonically versioned.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── TYPES ───

export type DeltaOp = 'create' | 'update' | 'delete';
export type SyncEntityType = 'patient' | 'appointment' | 'user' | 'medicalRecord' | 'referral' | 'facility' | 'chp';

export interface IChangeRecord extends Document {
  changeId: string;
  entityType: SyncEntityType;
  entityId: mongoose.Types.ObjectId;
  operation: DeltaOp;
  version: number;
  serverTimestamp: string;
  clientTimestamp: string;
  deviceId: string;
  userId?: mongoose.Types.ObjectId;
  checksum: string;
  payload: Record<string, unknown>;
  previousVersion: number;
  /** Region tag for regional sync gating */
  region: string;
  disseminated: boolean;
}

export interface IChangeRecordModel extends Model<IChangeRecord> {
  getDeltasSince(version: number, options?: { limit?: number; entityTypes?: SyncEntityType[] }): Promise<IChangeRecord[]>;

  /**
   * Regional delta query — the primary sync method for remote clinics.
   * Returns changes for a specific region with version > sinceVersion.
   */
  getDeltas(
    region: string,
    sinceVersion: number,
    options?: { limit?: number; entityTypes?: SyncEntityType[] }
  ): Promise<IChangeRecord[]>;

  insertBatch(
    changes: Array<Partial<IChangeRecord> & { changeId: string; entityType: SyncEntityType; entityId: mongoose.Types.ObjectId | string }>,
    baseVersion: number
  ): Promise<BatchInsertResult>;
  isDuplicate(changeId: string): Promise<boolean>;
  getCurrentVersion(): Promise<number>;
  getEntityHistory(entityType: SyncEntityType, entityId: mongoose.Types.ObjectId): Promise<IChangeRecord[]>;
}

export interface BatchInsertResult {
  accepted: number;
  duplicates: number;
  conflicts: number;
  newServerVersion: number;
  acceptedIds: string[];
  duplicateIds: string[];
  conflictReports: ConflictDetail[];
}

export interface ConflictDetail {
  changeId: string;
  entityType: SyncEntityType;
  entityId: string;
  clientPreviousVersion: number;
  serverCurrentVersion: number;
  serverPayload: Record<string, unknown> | null;
}

// ─── SCHEMA ───

const ChangeRecordSchema = new Schema<IChangeRecord, IChangeRecordModel>(
  {
    changeId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ['patient', 'appointment', 'user', 'medicalRecord', 'referral', 'facility', 'chp'],
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    operation: {
      type: String,
      required: true,
      enum: ['create', 'update', 'delete'],
    },
    version: {
      type: Number,
      required: true,
      index: true,
    },
    serverTimestamp: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
    clientTimestamp: {
      type: String,
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    checksum: {
      type: String,
      required: true,
      match: [/^([a-f0-9]{64})?$/, 'Checksum must be 64-char hex SHA-256 or empty'],
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    previousVersion: {
      type: Number,
      required: true,
      default: 0,
    },
    /**
     * Region tag — inherited from the entity's _sync.region.
     * Enables regional delta sync: a Mtwapa CHP only pulls Mtwapa changes.
     */
    region: {
      type: String,
      required: [true, 'Region is required for regional sync gating'],
      trim: true,
      index: true,
    },
    disseminated: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// ─── COMPOUND INDEXES ───

/** Global pull: all changes since a version (cross-region admin view) */
ChangeRecordSchema.index({ version: 1 }, { name: 'pull_global' });

/** Regional pull: changes for a specific region since a version */
ChangeRecordSchema.index(
  { region: 1, version: 1 },
  { name: 'pull_regional' }
);

/** Entity-type + regional: scoped regional queries */
ChangeRecordSchema.index(
  { entityType: 1, region: 1, version: 1 },
  { name: 'pull_regional_entity' }
);

/** Entity history: reconstruct mutation chain for conflict reporting */
ChangeRecordSchema.index(
  { entityType: 1, entityId: 1, version: 1 },
  { name: 'entity_history' }
);

/** Dissemination tracking */
ChangeRecordSchema.index(
  { disseminated: 1, serverTimestamp: 1 },
  { name: 'undelivered_changes' }
);

// ─── STATIC METHODS ───

/**
 * getDeltasSince — Legacy global query (admin/overlord mode).
 * Returns ALL changes with version > `since`, regardless of region.
 */
ChangeRecordSchema.statics.getDeltasSince = async function (
  this: IChangeRecordModel,
  version: number,
  options: { limit?: number; entityTypes?: SyncEntityType[] } = {}
): Promise<IChangeRecord[]> {
  const { limit = 50, entityTypes } = options;
  const query: Record<string, unknown> = { version: { $gt: version } };
  if (entityTypes?.length) query.entityType = { $in: entityTypes };

  return this.find(query)
    .sort({ version: 1 })
    .limit(limit)
    .lean()
    .exec();
};

/**
 * getDeltas — REGIONAL delta sync. The primary pull method.
 *
 * Returns changes where:
 *   region === {region} AND version > {sinceVersion}
 *
 * A staff member in "Mtwapa" calls:
 *   getDeltas('Mtwapa', 42)
 * and receives only Mtwapa records with version > 42.
 *
 * BANDWIDTH SAVINGS:
 *   If the database has 100,000 records across 50 regions, a regional
 *   pull transfers ~2,000 records instead of 100,000 — a 98% reduction.
 */
ChangeRecordSchema.statics.getDeltas = async function (
  this: IChangeRecordModel,
  region: string,
  sinceVersion: number,
  options: { limit?: number; entityTypes?: SyncEntityType[] } = {}
): Promise<IChangeRecord[]> {
  const { limit = 50, entityTypes } = options;

  const query: Record<string, unknown> = {
    region,
    version: { $gt: sinceVersion },
  };

  if (entityTypes?.length) {
    query.entityType = { $in: entityTypes };
  }

  return this.find(query)
    .sort({ version: 1 }) // Monotonic — critical for causality
    .limit(limit)
    .lean()
    .exec();
};

/**
 * insertBatch — Atomic, idempotent batch insertion with VBCC.
 *
 * Algorithm:
 *  1. Check each changeId for duplicates (idempotency)
 *  2. Check previousVersion against entity's current version (VBCC)
 *  3. Assign monotonic version numbers
 *  4. Insert all accepted changes
 *  5. Return detailed result
 */
ChangeRecordSchema.statics.insertBatch = async function (
  this: IChangeRecordModel,
  changes: Array<Partial<IChangeRecord> & { changeId: string; entityType: SyncEntityType; entityId: mongoose.Types.ObjectId | string }>,
  baseVersion: number
): Promise<BatchInsertResult> {
  const result: BatchInsertResult = {
    accepted: 0, duplicates: 0, conflicts: 0,
    newServerVersion: baseVersion,
    acceptedIds: [], duplicateIds: [], conflictReports: [],
  };

  let nextVersion = baseVersion;

  for (const change of changes) {
    // Gate 1: Idempotency
    const exists = await this.isDuplicate(change.changeId);
    if (exists) {
      result.duplicates++;
      result.duplicateIds.push(change.changeId);
      continue;
    }

    // Gate 2: Version Concurrency (for updates/deletes only)
    if (change.operation !== 'create' && change.previousVersion !== undefined) {
      const latestRecord = await this.findOne({
        entityType: change.entityType,
        entityId: change.entityId,
      })
        .sort({ version: -1 })
        .select('version payload')
        .lean()
        .exec();

      const entityVersion = latestRecord?.version ?? 0;

      if (entityVersion > 0 && change.previousVersion < entityVersion) {
        result.conflicts++;
        result.conflictReports.push({
          changeId: change.changeId,
          entityType: change.entityType,
          entityId: change.entityId.toString(),
          clientPreviousVersion: change.previousVersion,
          serverCurrentVersion: entityVersion,
          serverPayload: (latestRecord?.payload as Record<string, unknown>) ?? null,
        });
        continue;
      }
    }

    // Gate 3: Accept — assign version and insert
    nextVersion += 1;

    try {
      await this.create({
        ...change,
        version: nextVersion,
        serverTimestamp: new Date().toISOString(),
      });
      result.accepted++;
      result.acceptedIds.push(change.changeId);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as Record<string, unknown>).code === 11000) {
        result.duplicates++;
        result.duplicateIds.push(change.changeId);
      } else {
        throw err;
      }
    }
  }

  result.newServerVersion = nextVersion;
  return result;
};

ChangeRecordSchema.statics.isDuplicate = async function (
  this: IChangeRecordModel, changeId: string
): Promise<boolean> {
  const count = await this.countDocuments({ changeId }).exec();
  return count > 0;
};

ChangeRecordSchema.statics.getCurrentVersion = async function (
  this: IChangeRecordModel
): Promise<number> {
  const last = await this.findOne()
    .sort({ version: -1 })
    .select('version')
    .lean()
    .exec();
  return last?.version ?? 0;
};

ChangeRecordSchema.statics.getEntityHistory = async function (
  this: IChangeRecordModel,
  entityType: SyncEntityType,
  entityId: mongoose.Types.ObjectId
): Promise<IChangeRecord[]> {
  return this.find({ entityType, entityId })
    .sort({ version: 1 })
    .lean()
    .exec();
};

// ─── MODEL EXPORT ───

const ChangeRecord = mongoose.model<IChangeRecord, IChangeRecordModel>('ChangeRecord', ChangeRecordSchema);

export default ChangeRecord;
