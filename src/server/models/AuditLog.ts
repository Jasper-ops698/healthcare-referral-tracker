/**
 * AuditLog Model — Immutable Security Audit Trail
 *
 * Every call to `applyIfVersionMatches` across all entity models
 * generates an AuditLog entry capturing:
 *   - WHO:   userId, email
 *   - WHAT:  entityType, entityId, changeId, operation
 *   - WHERE: ipAddress, userAgent
 *   - WHEN:  timestamp
 *   - RESULT: success/failure, previousVersion, newVersion
 *
 * DESIGN: Append-only, TTL-indexed for 7-year healthcare retention.
 * Never update or delete entries.
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── TYPES ───

export type AuditAction = 'version_match' | 'version_conflict' | 'create' | 'update' | 'delete' | 'auth_failure';

export type AuditEntity = 'patient' | 'medicalRecord' | 'user' | 'appointment' | 'referral';

export interface IAuditLog extends Document {
  /** The ChangeRecord.changeId that triggered this audit entry */
  changeId: string;

  /** Type of entity being modified */
  entityType: AuditEntity;

  /** Mongo _id of the entity */
  entityId: mongoose.Types.ObjectId;

  /** What happened */
  action: AuditAction;

  /** Outcome */
  result: 'success' | 'failure' | 'blocked';

  /** Previous version (before the operation) */
  previousVersion: number;

  /** New version (after the operation) */
  newVersion: number;

  /** ObjectId of the user who performed the action */
  userId: mongoose.Types.ObjectId;

  /** Email of the user */
  userEmail: string;

  /** User's region */
  userRegion: string;

  /** User's role */
  userRole: string;

  /** Client IP address */
  ipAddress: string;

  /** Full User-Agent string */
  userAgent: string;

  /** Request path */
  endpoint: string;

  /** HTTP method */
  method: string;

  /** Error message (if result === 'failure') */
  errorMessage?: string;

  /** ISO-8601 timestamp */
  timestamp: string;

  /** TTL index field — auto-expires after retention period */
  expiresAt: Date;
}

export interface IAuditLogModel extends Model<IAuditLog> {
  /** Log an audit entry */
  log(entry: Partial<IAuditLog>): Promise<IAuditLog>;

  /** Query audit trail for an entity */
  getEntityHistory(entityType: AuditEntity, entityId: mongoose.Types.ObjectId): Promise<IAuditLog[]>;

  /** Query audit trail for a user */
  getUserHistory(userId: mongoose.Types.ObjectId, limit?: number): Promise<IAuditLog[]>;

  /** Query audit trail for a changeId */
  getByChangeId(changeId: string): Promise<IAuditLog[]>;
}

// ─── SCHEMA ───

const AuditLogSchema = new Schema<IAuditLog, IAuditLogModel>(
  {
    changeId: {
      type: String,
      required: true,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      enum: ['patient', 'medicalRecord', 'user', 'appointment', 'referral'],
      index: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      enum: ['version_match', 'version_conflict', 'create', 'update', 'delete', 'auth_failure'],
      index: true,
    },

    result: {
      type: String,
      required: true,
      enum: ['success', 'failure', 'blocked'],
    },

    previousVersion: {
      type: Number,
      required: true,
      default: 0,
    },

    newVersion: {
      type: Number,
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    userEmail: {
      type: String,
      required: true,
    },

    userRegion: {
      type: String,
      required: true,
      index: true,
    },

    userRole: {
      type: String,
      required: true,
    },

    ipAddress: {
      type: String,
      required: true,
    },

    userAgent: {
      type: String,
      required: true,
    },

    endpoint: {
      type: String,
      required: true,
    },

    method: {
      type: String,
      required: true,
    },

    errorMessage: {
      type: String,
    },

    timestamp: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
      index: true,
    },

    /**
     * TTL field — documents auto-delete after the retention period.
     * Healthcare retention: 7 years = 2555 days.
     * The TTL index below handles cleanup automatically.
     */
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
    },
  },
  {
    timestamps: false, // We use our own timestamp field
  }
);

// ─── INDEXES ───

/** Primary query: audit trail for an entity */
AuditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 }, { name: 'entity_audit_trail' });

/** User activity tracking */
AuditLogSchema.index({ userId: 1, timestamp: -1 }, { name: 'user_activity' });

/** ChangeId lookup */
AuditLogSchema.index({ changeId: 1 }, { name: 'changeid_lookup' });

/** Regional audit queries */
AuditLogSchema.index({ userRegion: 1, timestamp: -1 }, { name: 'regional_audit' });

/** TTL index — auto-expire old records after 7 years */
AuditLogSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'ttl_7year_retention' }
);

// ─── STATIC METHODS ───

AuditLogSchema.statics.log = async function (
  this: IAuditLogModel,
  entry: Partial<IAuditLog>
): Promise<IAuditLog> {
  return this.create({
    ...entry,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
  });
};

AuditLogSchema.statics.getEntityHistory = async function (
  this: IAuditLogModel,
  entityType: AuditEntity,
  entityId: mongoose.Types.ObjectId
): Promise<IAuditLog[]> {
  return this.find({ entityType, entityId })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean()
    .exec();
};

AuditLogSchema.statics.getUserHistory = async function (
  this: IAuditLogModel,
  userId: mongoose.Types.ObjectId,
  limit: number = 50
): Promise<IAuditLog[]> {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()
    .exec();
};

AuditLogSchema.statics.getByChangeId = async function (
  this: IAuditLogModel,
  changeId: string
): Promise<IAuditLog[]> {
  return this.find({ changeId })
    .sort({ timestamp: -1 })
    .lean()
    .exec();
};

// ─── MODEL EXPORT ───

const AuditLog = mongoose.model<IAuditLog, IAuditLogModel>('AuditLog', AuditLogSchema);

export default AuditLog;
