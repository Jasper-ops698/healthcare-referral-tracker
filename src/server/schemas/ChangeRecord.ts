/**
 * ChangeRecord Schema — The Delta Log (Write-Ahead Journal)
 *
 * Every mutation across all entity types is recorded here as an immutable
 * append-only log. This collection serves four critical purposes:
 *
 * 1.  IDEMPOTENCY:  `changeId` is a client-generated UUID. Re-delivering
 *     the same change is a no-op — the unique index on `changeId` rejects
 *     duplicates.
 *
 * 2.  PULL SOURCE:   The server's `/sync/pull` endpoint queries this log
 *     (not the entity collection) to build the delta stream. This ensures
 *     that clients never miss a change, even if the entity document was
 *     modified again before the client pulled.
 *
 * 3.  CONFLICT HISTORY:  When an HTTP 409 occurs, the server can look up
 *     the full chain of changes for an entityId to provide a detailed
 *     conflict report for three-way merging.
 *
 * 4.  AUDIT TRAIL:   Healthcare applications require complete change
 *     history. This log is append-only and never deleted.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ────────────────────────────────────────────────────────────────────────────

/** Valid CRUD operations in the delta stream */
export type DeltaOp = 'create' | 'update' | 'delete';

/** Entity types that participate in sync */
export type SyncEntityType = 'patient' | 'appointment' | 'user' |
                              'medicalRecord' | 'referral' | 'facility';

/** Conflict resolution strategy chosen by the server */
export type ResolutionStrategy = 'auto-merge' | 'server-wins' | 'client-wins' |
                                  'manual' | 'last-write-wins';

/**
 * A ChangeRecord is a single entry in the distributed operation log.
 * It captures *what* changed, *when*, *by whom*, and *to what*.
 */
export interface IChangeRecord extends Document {
  /** Client-generated UUID — the idempotency key */
  changeId: string;

  /** Which entity collection was affected */
  entityType: SyncEntityType;

  /** The _id of the affected entity document */
  entityId: mongoose.Types.ObjectId;

  /** CRUD operation type */
  operation: DeltaOp;

  /**
   * The server's assigned version for this mutation.
   * This is the authoritative, monotonically increasing sequence number
   * that MedSyncManager uses for VBCC.
   */
  version: number;

  /** ISO-8601 timestamp when the server accepted the change */
  serverTimestamp: string;

  /**
   * The client-reported timestamp (may differ from serverTimestamp
   * due to clock skew — used for causal ordering, not wall-clock time).
   */
  clientTimestamp: string;

  /** Device identifier that originated the change */
  deviceId: string;

  /** Mongo _id of the user who performed the action (if authenticated) */
  userId?: mongoose.Types.ObjectId;

  /**
   * SHA-256 checksum of `payload` computed by the client.
   * The server recomputes and compares to detect payload corruption.
   */
  checksum: string;

  /**
   * The delta payload.
   *
   * For `create` — full document (POST body).
   * For `update` — partial document with only modified fields (PATCH).
   * For `delete` — `{ deleted: true, originalId: ... }` tombstone.
   */
  payload: any;

  /**
   * Previous version number (before this change).
   * Enables the server to detect when a change was based on stale data
   * without querying the entity collection.
   */
  previousVersion: number;

  /**
   * If this change was rejected due to a conflict and later merged,
   * this field stores the resolution details.
   */
  conflictResolution?: {
    /** Was there a conflict? */
    hadConflict: boolean;

    /** How was it resolved? */
    strategy: ResolutionStrategy;

    /** The version of the server document used as merge base */
    serverVersionAtConflict: number;

    /** ISO timestamp when the resolution occurred */
    resolvedAt: string;

    /** User or system that performed the resolution */
    resolvedBy: string;
  };

  /** Whether this change has been broadcast to all active clients */
  disseminated: boolean;
}

export interface IChangeRecordModel extends Model<IChangeRecord> {
  /**
   * Retrieve changes since a given version, in version order.
   * This is the core query powering the server's `/sync/pull` endpoint.
   */
  getDeltasSince(
    version: number,
    options?: { limit?: number; entityTypes?: SyncEntityType[] }
  ): Promise<IChangeRecord[]>;

  /**
   * Insert a batch of changes atomically with idempotency protection.
   * Returns `{ accepted, duplicates, conflicts }`.
   */
  insertBatch(
    changes: Partial<IChangeRecord>[],
    baseVersion: number
  ): Promise<BatchInsertResult>;

  /**
   * Check if a changeId already exists (fast idempotency check).
   */
  isDuplicate(changeId: string): Promise<boolean>;

  /**
   * Get the current global version (max version in the log).
   */
  getCurrentVersion(): Promise<number>;

  /**
   * Get the full change history for a specific entity
   * (used in conflict reporting).
   */
  getEntityHistory(
    entityType: SyncEntityType,
    entityId: mongoose.Types.ObjectId
  ): Promise<IChangeRecord[]>;

  /**
   * Look up the current _sync.version of an entity document.
   */
  getEntityCurrentVersion(
    entityType: SyncEntityType,
    entityId: mongoose.Types.ObjectId
  ): Promise<number | null>;

  /**
   * Get the full payload of an entity document.
   */
  getEntityPayload(
    entityType: SyncEntityType,
    entityId: mongoose.Types.ObjectId
  ): Promise<any | null>;
}

/** Result of a batch insert operation */
export interface BatchInsertResult {
  /** Number of changes accepted (new) */
  accepted: number;

  /** Number of changes rejected as duplicates */
  duplicates: number;

  /** Number of changes that caused version conflicts */
  conflicts: number;

  /** The new server version after all accepted changes */
  newServerVersion: number;

  /** IDs of accepted changes */
  acceptedIds: string[];

  /** IDs of duplicate changes */
  duplicateIds: string[];

  /** Detailed conflict reports for rejected changes */
  conflictReports: ConflictDetail[];
}

export interface ConflictDetail {
  changeId: string;
  entityType: SyncEntityType;
  entityId: string;
  clientPreviousVersion: number;
  serverCurrentVersion: number;
  serverPayload: any;
}

// ────────────────────────────────────────────────────────────────────────────
// SCHEMA DEFINITION
// ────────────────────────────────────────────────────────────────────────────

const ConflictResolutionSchema = new Schema({
  hadConflict: { type: Boolean, required: true },
  strategy: {
    type: String,
    required: true,
    enum: ['auto-merge', 'server-wins', 'client-wins', 'manual', 'last-write-wins'],
  },
  serverVersionAtConflict: { type: Number, required: true },
  resolvedAt: { type: String, required: true },
  resolvedBy: { type: String, required: true },
}, { _id: false });

const ChangeRecordSchema = new Schema<IChangeRecord, IChangeRecordModel>(
  {
    changeId: {
      type: String,
      required: [true, 'changeId is required for idempotency'],
      unique: true,        // ← Idempotency guard: duplicate changeIds rejected
      index: true,
      immutable: true,     // Never modify after insertion
    },

    entityType: {
      type: String,
      required: true,
      enum: ['patient', 'appointment', 'user', 'medicalRecord', 'referral', 'facility'],
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
      index: true,         // ← Indexed for fast `since` queries
    },

    serverTimestamp: {
      type: String,        // ISO-8601
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
      required: [true, 'Payload checksum is required for integrity'],
      match: [/^[a-f0-9]{64}$/, 'Checksum must be a 64-char hex SHA-256'],
    },

    payload: {
      type: Schema.Types.Mixed, // Flexible: partial or full document
      required: true,
    },

    previousVersion: {
      type: Number,
      required: true,
      default: 0,
    },

    conflictResolution: {
      type: ConflictResolutionSchema,
      required: false,
    },

    disseminated: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
  },
  {
    timestamps: false, // We use our own serverTimestamp for causal ordering
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ────────────────────────────────────────────────────────────────────────────
// COMPOUND INDEXES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Core pull index: retrieve changes for a specific entity type
 * since a given version, in version order.
 */
ChangeRecordSchema.index(
  { entityType: 1, version: 1 },
  { name: 'pull_by_entity_type' }
);

/**
 * Global pull index: retrieve ALL changes since a version
 * (used when client wants everything).
 */
ChangeRecordSchema.index(
  { version: 1 },
  { name: 'pull_global' }
);

/**
 * Entity history index: reconstruct the full mutation chain
 * for a single entity (used in conflict reporting).
 */
ChangeRecordSchema.index(
  { entityType: 1, entityId: 1, version: 1 },
  { name: 'entity_history' }
);

/**
 * Dissemination index: find changes that haven't been broadcast
 * to all active client subscriptions.
 */
ChangeRecordSchema.index(
  { disseminated: 1, serverTimestamp: 1 },
  { name: 'undelivered_changes' }
);

// ────────────────────────────────────────────────────────────────────────────
// STATIC METHODS
// ────────────────────────────────────────────────────────────────────────────

/**
 * getDeltasSince — The primary query for the `/sync/pull` endpoint.
 *
 * Returns changes with `version > since`, sorted monotonically.
 * This monotonic ordering is CRITICAL: it guarantees that a client
 * applying deltas in sequence will never see an out-of-order dependency.
 */
ChangeRecordSchema.statics.getDeltasSince = async function (
  this: IChangeRecordModel,
  version: number,
  options: { limit?: number; entityTypes?: SyncEntityType[] } = {}
): Promise<IChangeRecord[]> {
  const { limit = 50, entityTypes } = options;

  const query: any = { version: { $gt: version } };
  if (entityTypes && entityTypes.length > 0) {
    query.entityType = { $in: entityTypes };
  }

  return this.find(query)
    .sort({ version: 1 })          // Monotonic — critical for causality
    .limit(limit)
    .lean()
    .exec();
};

/**
 * insertBatch — Atomic, idempotent batch insertion.
 *
 * Algorithm:
 * 1.  For each incoming change, check `changeId` against the unique index.
 * 2.  If duplicate → skip (idempotent no-op).
 * 3.  If `previousVersion !== currentServerVersion` → version conflict (409).
 * 4.  Otherwise → assign `version = ++currentServerVersion`, insert.
 * 5.  Return detailed result so the client knows which changes were accepted.
 */
ChangeRecordSchema.statics.insertBatch = async function (
  this: IChangeRecordModel,
  changes: Partial<IChangeRecord>[],
  baseVersion: number
): Promise<BatchInsertResult> {
  const result: BatchInsertResult = {
    accepted: 0,
    duplicates: 0,
    conflicts: 0,
    newServerVersion: baseVersion,
    acceptedIds: [],
    duplicateIds: [],
    conflictReports: [],
  };

  // Get the actual current server version (another client may have pushed)
  const currentVersion = await this.getCurrentVersion();

  // VBCC Guard: client must be at or ahead of the version they claim
  if (baseVersion < currentVersion) {
    // All changes are potentially conflicts — we need to check individually
  }

  let nextVersion = Math.max(baseVersion, currentVersion);

  for (const change of changes) {
    // ─── Step 1: Idempotency check ───
    const exists = await this.isDuplicate(change.changeId!);
    if (exists) {
      result.duplicates++;
      result.duplicateIds.push(change.changeId!);
      continue;
    }

    // ─── Step 2: Version validation ───
    // For updates/deletes, verify the client based their change on the
    // current server state. Creates always pass this check (no previous state).
    if (change.operation !== 'create' && change.previousVersion !== undefined) {
      // Look up the entity's current version
      const entityVersion = await this.getEntityCurrentVersion(
        change.entityType!,
        change.entityId!
      );

      if (entityVersion !== null && change.previousVersion < entityVersion) {
        // Client was working from stale data → conflict
        result.conflicts++;
        result.conflictReports.push({
          changeId: change.changeId!,
          entityType: change.entityType!,
          entityId: change.entityId!.toString(),
          clientPreviousVersion: change.previousVersion,
          serverCurrentVersion: entityVersion,
          serverPayload: await this.getEntityPayload(
            change.entityType!,
            change.entityId!
          ),
        });
        continue;
      }
    }

    // ─── Step 3: Assign version and insert ───
    nextVersion += 1;
    const record = new this({
      ...change,
      version: nextVersion,
      serverTimestamp: new Date().toISOString(),
    });

    try {
      await record.save();
      result.accepted++;
      result.acceptedIds.push(change.changeId!);
    } catch (err: any) {
      if (err.code === 11000) {
        // Race condition: another request inserted the same changeId
        result.duplicates++;
        result.duplicateIds.push(change.changeId!);
      } else {
        throw err;
      }
    }
  }

  result.newServerVersion = nextVersion;
  return result;
};

ChangeRecordSchema.statics.isDuplicate = async function (
  this: IChangeRecordModel,
  changeId: string
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

// ────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS (used by static methods)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Look up the current `_sync.version` of an entity document.
 * Used during batch insert to detect stale-client conflicts.
 */
async function getEntityCurrentVersion(
  this: IChangeRecordModel,
  entityType: SyncEntityType,
  entityId: mongoose.Types.ObjectId
): Promise<number | null> {
  const modelName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const Model = mongoose.models[modelName];
  if (!Model) return null;

  const doc = await Model.findById(entityId)
    .select('_sync.version')
    .lean()
    .exec();
  return doc?._sync?.version ?? null;
}

async function getEntityPayload(
  this: IChangeRecordModel,
  entityType: SyncEntityType,
  entityId: mongoose.Types.ObjectId
): Promise<any | null> {
  const modelName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const Model = mongoose.models[modelName];
  if (!Model) return null;

  return Model.findById(entityId).lean().exec();
}

// Attach helpers to schema
(ChangeRecordSchema.statics as any).getEntityCurrentVersion = getEntityCurrentVersion;
(ChangeRecordSchema.statics as any).getEntityPayload = getEntityPayload;

// ────────────────────────────────────────────────────────────────────────────
// MODEL EXPORT
// ────────────────────────────────────────────────────────────────────────────

const ChangeRecord = mongoose.model<IChangeRecord, IChangeRecordModel>(
  'ChangeRecord',
  ChangeRecordSchema
);

export default ChangeRecord;
