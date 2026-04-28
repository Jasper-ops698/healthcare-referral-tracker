/**
 * Sync Controller — /sync/pull and /sync/push Endpoints
 *
 * This controller handles all synchronization traffic between the
 * MedSyncManager on the client and the MongoDB delta log on the server.
 *
 * SECURITY FEATURES:
 *   - Audit logging: Every push operation logs IP, UserAgent, and changeId
 *     to the AuditLog collection for compliance.
 *   - Regional scoping: Enforced by middleware (requireRegion) —
 *     users can only sync data from their assigned region.
 *   - VBCC: ChangeRecord.insertBatch handles version concurrency.
 */

import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import ChangeRecord from '../models/ChangeRecord.js';
import AuditLog from '../models/AuditLog.js';
import type { SyncEntityType } from '../models/ChangeRecord.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

// ─── TYPES ───

interface PushRequestBody {
  clientVersion: number;
  deviceId: string;
  region: string;
  changes: ChangePayload[];
}

interface ChangePayload {
  changeId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  previousVersion: number;
  checksum: string;
  payload: Record<string, unknown>;
  clientTimestamp: string;
  userId?: string;
  region?: string;
}

interface PullRequestBody {
  clientVersion: number;
  deviceId: string;
  region: string;
  entityTypes?: SyncEntityType[];
  limit?: number;
}

// ─── ERROR CLASSES ───

class SyncError extends Error {
  constructor(public code: string, message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'SyncError';
  }
}

// ─── AUDIT LOGGING HELPER ───

/**
 * Log a sync operation to the AuditLog collection.
 * Captures IP, UserAgent, changeId for compliance.
 */
async function logSyncAudit(
  req: Request,
  action: 'version_match' | 'version_conflict' | 'create' | 'update' | 'delete' | 'auth_failure',
  result: 'success' | 'failure' | 'blocked',
  details: {
    changeId: string;
    entityType: string;
    entityId: string;
    previousVersion: number;
    newVersion: number;
    errorMessage?: string;
  }
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    await AuditLog.log({
      changeId: details.changeId,
      entityType: details.entityType as any,
      entityId: new mongoose.Types.ObjectId(details.entityId),
      action,
      result,
      previousVersion: details.previousVersion,
      newVersion: details.newVersion,
      userId: user?._id || new mongoose.Types.ObjectId('000000000000000000000000'),
      userEmail: user?.email || 'anonymous',
      userRegion: user?.region || 'unknown',
      userRole: user?.role || 'unknown',
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      endpoint: req.path,
      method: req.method,
      errorMessage: details.errorMessage,
    });
  } catch (err) {
    // Never fail the sync operation if audit logging fails
    console.error('[Audit] Failed to write audit log:', err);
  }
}

// ─── HELPERS ───

function validateChangePayload(change: unknown): change is ChangePayload {
  if (!change || typeof change !== 'object') return false;
  const c = change as Record<string, unknown>;
  if (typeof c.changeId !== 'string') return false;
  if (typeof c.entityType !== 'string') return false;
  if (typeof c.entityId !== 'string') return false;
  if (typeof c.operation !== 'string' || !['create', 'update', 'delete'].includes(c.operation)) return false;
  if (typeof c.previousVersion !== 'number') return false;
  if (typeof c.checksum !== 'string') return false;
  if (!c.payload || typeof c.payload !== 'object') return false;
  if (typeof c.clientTimestamp !== 'string') return false;
  return true;
}

function validateChecksum(change: ChangePayload): boolean {
  try {
    const sorted = Object.fromEntries(
      Object.entries(change.payload).sort(([a], [b]) => a.localeCompare(b))
    );
    const computed = createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
    return computed === change.checksum;
  } catch {
    return false;
  }
}

function normalizeEntityId(entityId: string, operation: string): mongoose.Types.ObjectId | string {
  if (operation === 'create') {
    try { return new mongoose.Types.ObjectId(entityId); } catch { return entityId; }
  }
  try { return new mongoose.Types.ObjectId(entityId); } catch {
    throw new SyncError('INVALID_ENTITY_ID', `Invalid entityId: ${entityId}`, 400);
  }
}

// ─── HANDLER: PUSH ───

export async function handlePush(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const body = req.body as PushRequestBody;

    // ── Gate 1: Request validation ──
    if (typeof body.clientVersion !== 'number' || body.clientVersion < 0) {
      throw new SyncError('INVALID_CLIENT_VERSION', 'clientVersion must be a non-negative number', 400);
    }
    if (!body.deviceId || typeof body.deviceId !== 'string') {
      throw new SyncError('MISSING_DEVICE_ID', 'deviceId is required', 400);
    }
    if (!body.region || typeof body.region !== 'string') {
      throw new SyncError('MISSING_REGION', 'region is required for regional sync', 400);
    }
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      throw new SyncError('EMPTY_CHANGES', 'changes array must not be empty', 400);
    }
    if (body.changes.length > 100) {
      throw new SyncError('BATCH_TOO_LARGE', 'Maximum 100 changes per batch', 413);
    }

    const declaredRegion = body.region.trim();

    // ── Validate each change ──
    const validatedChanges: Array<Record<string, unknown>> = [];
    for (let i = 0; i < body.changes.length; i++) {
      const change = body.changes[i];

      if (!validateChangePayload(change)) {
        throw new SyncError('INVALID_CHANGE', `Change at index ${i} has invalid structure`, 400);
      }

      // Checksum verification
      if (!validateChecksum(change)) {
        throw new SyncError('CHECKSUM_MISMATCH', `Checksum mismatch for change ${change.changeId} at index ${i}`, 400);
      }

      // Region consistency check
      const changeRegion = (change.region ?? declaredRegion).trim();
      if (changeRegion !== declaredRegion) {
        throw new SyncError(
          'REGION_MISMATCH',
          `Change ${change.changeId} has region "${changeRegion}" but batch region is "${declaredRegion}"`,
          400
        );
      }

      const entityId = normalizeEntityId(change.entityId, change.operation);

      validatedChanges.push({
        changeId: change.changeId,
        entityType: change.entityType,
        entityId: entityId,
        operation: change.operation,
        previousVersion: change.previousVersion,
        checksum: change.checksum,
        payload: change.payload,
        clientTimestamp: change.clientTimestamp,
        deviceId: body.deviceId,
        userId: change.userId ? new mongoose.Types.ObjectId(change.userId) : undefined,
        region: changeRegion,
        version: 0,
        serverTimestamp: new Date().toISOString(),
        disseminated: false,
      });
    }

    // ── Gate 4: Execute batch insert with VBCC ──
    const result = await ChangeRecord.insertBatch(
      validatedChanges as Array<Partial<InstanceType<typeof ChangeRecord>> & { changeId: string; entityType: SyncEntityType; entityId: mongoose.Types.ObjectId | string }>,
      body.clientVersion
    );

    // ── Audit logging ──
    const authReq = req as AuthenticatedRequest;
    for (const change of body.changes) {
      const wasAccepted = result.acceptedIds.includes(change.changeId);
      const wasConflict = result.conflictReports.some(r => r.changeId === change.changeId);

      await logSyncAudit(req, change.operation as any, wasAccepted ? 'success' : wasConflict ? 'failure' : 'blocked', {
        changeId: change.changeId,
        entityType: change.entityType,
        entityId: change.entityId,
        previousVersion: change.previousVersion,
        newVersion: wasAccepted ? body.clientVersion + 1 : change.previousVersion,
        errorMessage: wasConflict ? 'Version conflict detected by VBCC' : undefined,
      });
    }

    // ── Build response ──
    const response: Record<string, unknown> = {
      success: true,
      serverVersion: result.newServerVersion,
      summary: {
        accepted: result.accepted,
        duplicates: result.duplicates,
        conflicts: result.conflicts,
        total: body.changes.length,
      },
      acceptedIds: result.acceptedIds,
      duplicateIds: result.duplicateIds,
      processingTimeMs: Date.now() - startTime,
    };

    if (result.conflicts > 0) {
      response.conflicts = result.conflictReports.map(report => ({
        changeId: report.changeId,
        entityType: report.entityType,
        entityId: report.entityId,
        clientPreviousVersion: report.clientPreviousVersion,
        serverCurrentVersion: report.serverCurrentVersion,
        resolutionRequired: true,
      }));
    }

    const statusCode = result.conflicts > 0 ? 409 : 200;
    res.status(statusCode).json(response);

  } catch (error) {
    if (error instanceof SyncError) {
      res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
      return;
    }
    console.error('[Sync Push Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred processing the sync push' },
    });
  }
}

// ─── HANDLER: PULL ───

export async function handlePull(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const body = req.body as PullRequestBody;

    // ── Validation ──
    if (typeof body.clientVersion !== 'number' || body.clientVersion < 0) {
      throw new SyncError('INVALID_CLIENT_VERSION', 'clientVersion must be a non-negative number', 400);
    }
    if (!body.deviceId || typeof body.deviceId !== 'string') {
      throw new SyncError('MISSING_DEVICE_ID', 'deviceId is required', 400);
    }
    if (!body.region || typeof body.region !== 'string') {
      throw new SyncError('MISSING_REGION', 'region is required for regional sync gating', 400);
    }

    const limit = Math.min(body.limit ?? 50, 100);
    const region = body.region.trim();

    // ── Parallel queries ──
    const [deltas, currentServerVersion] = await Promise.all([
      ChangeRecord.getDeltas(region, body.clientVersion, {
        limit,
        entityTypes: body.entityTypes,
      }),
      ChangeRecord.getCurrentVersion(),
    ]);

    // ── Mark as disseminated (fire-and-forget) ──
    if (deltas.length > 0) {
      const changeIds = deltas.map(d => d.changeId);
      ChangeRecord.updateMany(
        { changeId: { $in: changeIds } },
        { $set: { disseminated: true } }
      ).catch(err => console.warn('[Sync] Failed to mark disseminated:', err));
    }

    // ── Build response ──
    const hasMore = deltas.length === limit;

    res.status(200).json({
      success: true,
      serverVersion: currentServerVersion,
      clientVersion: body.clientVersion,
      region,
      changes: deltas.map(d => ({
        changeId: d.changeId,
        entityType: d.entityType,
        entityId: d.entityId.toString(),
        operation: d.operation,
        version: d.version,
        previousVersion: d.previousVersion,
        checksum: d.checksum,
        payload: d.payload,
        region: d.region,
        clientTimestamp: d.clientTimestamp,
        serverTimestamp: d.serverTimestamp,
        deviceId: d.deviceId,
        userId: d.userId?.toString(),
      })),
      hasMore,
      processingTimeMs: Date.now() - startTime,
    });

  } catch (error) {
    if (error instanceof SyncError) {
      res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
      return;
    }
    console.error('[Sync Pull Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred processing the sync pull' },
    });
  }
}

// ─── HANDLER: GET STATUS ───

export async function handleGetStatus(req: Request, res: Response): Promise<void> {
  try {
    const region = req.query.region as string | undefined;
    const currentVersion = await ChangeRecord.getCurrentVersion();
    const undeliveredCount = await ChangeRecord.countDocuments({ disseminated: false });
    const totalChanges = await ChangeRecord.countDocuments();

    // Count by region
    const regionStats = await ChangeRecord.aggregate([
      { $group: { _id: '$region', count: { $sum: 1 } } },
    ]);

    // Count by entity type
    const entityTypeStats = await ChangeRecord.aggregate([
      { $group: { _id: '$entityType', count: { $sum: 1 } } },
    ]);

    const response: Record<string, unknown> = {
      success: true,
      currentServerVersion: currentVersion,
      stats: {
        totalChanges,
        undeliveredChanges: undeliveredCount,
        byRegion: regionStats.reduce((acc: Record<string, number>, curr: { _id: string; count: number }) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        byEntityType: entityTypeStats.reduce((acc: Record<string, number>, curr: { _id: string; count: number }) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
      },
    };

    if (region) {
      const regionVersion = await ChangeRecord.findOne({ region })
        .sort({ version: -1 })
        .select('version')
        .lean()
        .exec();
      const regionCount = await ChangeRecord.countDocuments({ region });
      (response.stats as Record<string, unknown>).selectedRegion = {
        region,
        latestVersion: regionVersion?.version ?? 0,
        changeCount: regionCount,
      };
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('[Sync Status Error]', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve sync status' },
    });
  }
}
