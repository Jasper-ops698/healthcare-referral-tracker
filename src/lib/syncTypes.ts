/**
 * Sync Engine Type Definitions
 *
 * Shared types used by MedSyncManager, LocalDatabase, and UI components.
 */

/** Sync status for UI feedback */
export type SyncStatus =
  | 'idle'
  | 'pulling'
  | 'pushing'
  | 'conflict'
  | 'resolved'
  | 'error'
  | 'offline';

/** Change operation types */
export type ChangeType = 'create' | 'update' | 'delete';

/** Entity types that can be synced */
export type EntityType = 'user' | 'patient' | 'medicalRecord' | 'chp' | 'referral';

/** A single change record sent to / received from the server */
export interface ChangeRecord<T = any> {
  id: string;
  entityType: EntityType;
  entityId: string;
  changeType: ChangeType;
  version: number;
  timestamp: string;
  checksum: string;
  payload: T;
  deviceId: string;
}

/** Server response for pull operations */
export interface PullResponse {
  serverVersion: number;
  changes: ChangeRecord[];
  hasMore: boolean;
  nextCursor?: string;
}

/** Server response for push operations */
export interface PushResponse {
  accepted: boolean;
  serverVersion: number;
  acceptedIds: string[];
  rejectedIds?: string[];
  conflicts?: ConflictReport[];
}

/** Conflict report from server (HTTP 409 body) */
export interface ConflictReport {
  changeId: string;
  entityType: EntityType;
  entityId: string;
  serverVersion: number;
  clientVersion: number;
  serverPayload: any;
  clientPayload: any;
}

/** Three-way merge result */
export interface MergeResult<T = any> {
  merged: boolean;
  result?: T;
  strategy: 'auto' | 'manual' | 'server-wins' | 'client-wins';
  fieldConflicts?: FieldConflict[];
}

/** Individual field conflict for manual resolution */
export interface FieldConflict {
  field: string;
  baseValue: any;
  serverValue: any;
  clientValue: any;
}

/** Sync statistics for monitoring */
export interface SyncStats {
  totalPulls: number;
  totalPushes: number;
  conflictsDetected: number;
  conflictsResolved: number;
  bytesDownloaded: number;
  bytesUploaded: number;
  lastError?: string;
  averageLatencyMs: number;
}
