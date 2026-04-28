/**
 * MedSyncManager — Healthcare Data Synchronization Engine
 *
 * Integrates with the Dexie.js IndexedDB layer (LocalDatabase) to provide
 * reliable bidirectional sync using Version-Based Concurrency Control.
 *
 * The Outbox Table (IndexedDB) drives the push flow:
 *   1. pushLocalChanges() queries outbox for status='pending' items
 *   2. Marks them 'syncing' to prevent duplicate uploads
 *   3. Sends batch to server
 *   4. Marks each as 'sent' or 'error' based on response
 */

import { getLocalDatabase, type OutboxEntry } from './dexieDatabase';
import type { SyncStatus, ChangeRecord, PullResponse, PushResponse,
              ConflictReport, MergeResult, FieldConflict } from './syncTypes';
export type { SyncStatus, ChangeRecord, PullResponse, PushResponse,
              ConflictReport, MergeResult, FieldConflict };
export type { OutboxStatus } from './dexieDatabase';
export type { OutboxEntry } from './dexieDatabase';

import { API_BASE_URL } from '@/lib/config';

// ─── Config ───
const SYNC_CONFIG = {
  API_BASE_URL: `${API_BASE_URL}/api/v1/sync`,
  MAX_RETRIES: 5,
  BASE_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  BATCH_SIZE: 50,
  SYNC_INTERVAL_MS: 30000,
} as const;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Exponential backoff with jitter */
function getRetryDelay(attempt: number): number {
  const jitter = Math.random() * 0.3 + 0.85;
  return Math.round(
    Math.min(SYNC_CONFIG.BASE_RETRY_DELAY_MS * Math.pow(2, attempt) * jitter,
             SYNC_CONFIG.MAX_RETRY_DELAY_MS)
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MED SYNC MANAGER
// ═════════════════════════════════════════════════════════════════════════════

export class MedSyncManager {
  private status: SyncStatus = 'idle';
  private stats = this.loadStats();
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private statusListeners = new Set<(s: SyncStatus) => void>();
  private authToken: string | null = null;
  private readonly localDB = getLocalDatabase();

  // ─── Public API ───

  setAuthToken(token: string) { this.authToken = token; }
  getStatus(): SyncStatus { return this.status; }

  getStats() {
    return { ...this.stats };
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(listener: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Start automatic periodic sync */
  startAutoSync(intervalMs = SYNC_CONFIG.SYNC_INTERVAL_MS) {
    this.stopAutoSync();
    this.autoSyncTimer = setInterval(() => this.sync(), intervalMs);
  }

  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  /** Full sync cycle: pull then push */
  async sync(): Promise<boolean> {
    try {
      const pullOk = await this.pullRemoteChanges();
      if (!pullOk) return false;
      return await this.pushLocalChanges();
    } catch (err) {
      const isNetworkError = (err as any)?.isNetworkError === true ||
        (err instanceof Error && err.message.includes('offline'));

      this.setStatus(isNetworkError ? 'offline' : 'error');
      this.stats.lastError = err instanceof Error ? err.message : 'Unknown';
      this.saveStats();
      return false;
    }
  }

  /** Get count of pending (unsynced) changes — for UI badges */
  async getPendingCount(): Promise<number> {
    return this.localDB.getPendingCount();
  }

  /** Get unresolved conflicts — for UI resolution dialog */
  async getUnresolvedConflicts(): Promise<OutboxEntry[]> {
    return this.localDB.getConflictedEntries();
  }

  /** Manually resolve a conflict and re-queue for sync */
  async resolveConflictManually(
    changeId: string,
    _resolutions: Record<string, 'client' | 'server'>
  ): Promise<boolean> {
    // Mark the conflicted entry as resolved and re-push
    await this.localDB.resolveConflict(changeId, {});
    return this.pushLocalChanges();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PULL REMOTE CHANGES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * pullRemoteChanges()
   *
   * 1. Read checkpoint from IndexedDB syncMeta table
   * 2. GET /sync/pull?since={lastSyncVersion}
   * 3. Apply each change to the appropriate IndexedDB entity table
   * 4. Save updated checkpoint back to syncMeta
   */
  async pullRemoteChanges(): Promise<boolean> {
    this.setStatus('pulling');
    const t0 = performance.now();

    try {
      const checkpoint = await this.localDB.getCheckpoint();
      let cursor: string | undefined;
      let hasMore = true;
      let total = 0;

      while (hasMore) {
        const params = new URLSearchParams({
          since: checkpoint.lastSyncVersion.toString(),
          limit: SYNC_CONFIG.BATCH_SIZE.toString(),
        });
        if (cursor) params.set('cursor', cursor);

        const res = await this.fetchWithRetry(
          `${SYNC_CONFIG.API_BASE_URL}/pull?${params}`,
          { method: 'GET' }
        );
        if (!res.ok) throw new Error(`Pull ${res.status}`);

        const body: PullResponse = await res.json();

        // Apply each remote change to IndexedDB
        for (const change of body.changes) {
          await this.applyRemoteChange(change);
          total++;
        }

        hasMore = body.hasMore;
        cursor = body.nextCursor;

        // Update checkpoint
        checkpoint.lastSyncVersion = body.serverVersion;
        checkpoint.lastSyncTime = new Date().toISOString();
        await this.localDB.saveCheckpoint(checkpoint);
      }

      this.stats.totalPulls++;
      this.stats.lastError = undefined;
      this.saveStats();
      this.updateLatency(performance.now() - t0);
      this.setStatus('idle');
      return true;

    } catch (err) {
      if (this.isNetworkError(err)) this.setStatus('offline');
      else this.setStatus('error');
      this.saveStats();
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUSH LOCAL CHANGES  ←  The Outbox-Driven Flow
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * pushLocalChanges()
   *
   * This is the core Outbox-driven push algorithm:
   *
   *   1. Query IndexedDB outbox for status='pending' entries
   *   2. Also grab status='error' entries whose retry time has passed
   *   3. Atomically mark the batch as 'syncing'
   *   4. Build ChangeRecords and POST to server
   *   5. Per server response:
   *        - accepted → mark 'sent'
   *        - rejected/error → mark 'error' with retry schedule
   *        - 409 conflict → mark 'conflict', trigger merge
   *   6. Update checkpoint with new server version
   *
   * The Outbox is the single source of truth for pending work.
   * MedSyncManager never maintains its own queue — it reads from
   * and writes to the IndexedDB outbox table.
   */
  async pushLocalChanges(): Promise<boolean> {
    // ── 1. Collect pending + retryable items from Outbox ──
    const [pending, retryable] = await Promise.all([
      this.localDB.getPendingChanges(SYNC_CONFIG.BATCH_SIZE),
      this.localDB.getRetryableErrors(SYNC_CONFIG.BATCH_SIZE),
    ]);

    const batch = [...pending, ...retryable].slice(0, SYNC_CONFIG.BATCH_SIZE);
    if (batch.length === 0) return true; // Nothing to push

    this.setStatus('pushing');
    const t0 = performance.now();

    try {
      const checkpoint = await this.localDB.getCheckpoint();

      // ── 2. Mark batch as 'syncing' (atomic, in transaction) ──
      const changeIds = batch.map(e => e.changeId);
      await this.localDB.markBatchAsSyncing(changeIds);

      // ── 3. Build ChangeRecords from Outbox entries ──
      const changes: ChangeRecord[] = await Promise.all(
        batch.map(async entry => ({
          id: entry.changeId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          changeType: entry.changeType,
          version: checkpoint.lastSyncVersion, // client-side version
          timestamp: entry.timestamp,
          checksum: entry.checksum,
          payload: entry.payload,
          deviceId: checkpoint.deviceId,
        }))
      );

      // ── 4. POST to server ──
      const res = await this.fetchWithRetry(
        `${SYNC_CONFIG.API_BASE_URL}/push`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientVersion: checkpoint.lastSyncVersion,
            deviceId: checkpoint.deviceId,
            changes,
          }),
        }
      );

      // ── 5. Handle HTTP 409 Conflict ──
      if (res.status === 409) {
        const body = await res.json();
        // Mark all as conflict, store server payload for resolution
        for (const conflict of body.conflicts || []) {
          await this.localDB.markAsConflict(
            conflict.changeId,
            conflict.serverPayload,
            conflict.serverVersion
          );
        }
        this.stats.conflictsDetected += body.conflicts?.length || batch.length;
        this.setStatus('conflict');
        this.saveStats();
        return false; // Needs manual resolution or auto-merge then retry
      }

      // ── 6. Handle 207 Multi-Status (partial accept) ──
      if (res.status === 207) {
        const body: PushResponse = await res.json();
        await this.processPushResponse(body, batch);
        checkpoint.lastSyncVersion = body.serverVersion;
        await this.localDB.saveCheckpoint(checkpoint);
        return body.accepted;
      }

      // ── 7. Handle full success (200 OK) ──
      if (res.ok) {
        const body: PushResponse = await res.json();
        await this.processPushResponse(body, batch);

        checkpoint.lastSyncVersion = body.serverVersion;
        checkpoint.lastSyncTime = new Date().toISOString();
        await this.localDB.saveCheckpoint(checkpoint);

        this.stats.totalPushes++;
        this.stats.lastError = undefined;
        this.saveStats();
        this.updateLatency(performance.now() - t0);
        this.setStatus('idle');

        // Cleanup old sent items (fire and forget)
        this.localDB.cleanupSentItems(24);

        return true;
      }

      // ── 8. Handle unexpected response ──
      throw new Error(`Push ${res.status}`);

    } catch (err) {
      // Network error → mark all syncing items as error with retry
      if (this.isNetworkError(err)) {
        for (const entry of batch) {
          await this.localDB.markAsError(
            entry.changeId,
            'Network error',
            0
          );
        }
        this.setStatus('offline');
      } else {
        this.setStatus('error');
        this.stats.lastError = err instanceof Error ? err.message : 'Push failed';
      }
      this.saveStats();
      return false;
    }
  }

  /**
   * processPushResponse()
   *
   * Maps the server's per-change results back to Outbox entries:
   *   - acceptedIds  → status='sent'
   *   - rejectedIds  → status='error' with retry
   *   - conflicts    → status='conflict'
   */
  private async processPushResponse(
    response: PushResponse,
    batch: OutboxEntry[]
  ): Promise<void> {
    const accepted = new Set(response.acceptedIds);

    for (const entry of batch) {
      if (accepted.has(entry.changeId)) {
        await this.localDB.markAsSent(entry.changeId);
      } else {
        // Wasn't accepted — mark as error for retry
        await this.localDB.markAsError(
          entry.changeId,
          'Server rejected',
          422
        );
      }
    }

    // Handle explicit conflicts if any
    if (response.conflicts) {
      for (const conflict of response.conflicts) {
        await this.localDB.markAsConflict(
          conflict.changeId,
          conflict.serverPayload,
          conflict.serverVersion
        );
      }
      this.stats.conflictsDetected += response.conflicts.length;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPLY REMOTE CHANGES (Pull side)
  // ═══════════════════════════════════════════════════════════════════════════

  private async applyRemoteChange(change: ChangeRecord): Promise<void> {
    const db = this.localDB;

    switch (change.entityType) {
      case 'patient':
        await db.bulkPutPatients([{ ...change.payload, _sync: this.makeSyncMeta() }]);
        break;
      case 'user':
        await db.bulkPutUsers([{ ...change.payload, _sync: this.makeSyncMeta() }]);
        break;
      case 'medicalRecord':
        await db.bulkPutMedicalRecords([{ ...change.payload, _sync: this.makeSyncMeta() }]);
        break;
    }
  }

  private makeSyncMeta() {
    return {
      version: 0, // Will be overwritten by server version
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'remote',
      checksum: '',
      isDeleted: false,
      createdAt: new Date().toISOString(),
      createdBy: 'remote',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK LAYER
  // ═══════════════════════════════════════════════════════════════════════════

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    attempt = 0
  ): Promise<Response> {
    try {
      const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
      };
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

      const res = await fetch(url, { ...options, headers });

      // Don't retry 4xx (client errors, including 409)
      if (res.status === 409 || (res.status >= 400 && res.status < 500)) return res;

      // Retry 5xx with backoff
      if (!res.ok && attempt < SYNC_CONFIG.MAX_RETRIES) {
        await sleep(getRetryDelay(attempt));
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      return res;
    } catch (err) {
      // Distinguish network errors (server unreachable) from HTTP errors
      const isNetworkError = err instanceof TypeError ||
        (err instanceof Error && (
          err.message.includes('Failed to fetch') ||
          err.message.includes('Network') ||
          err.message.includes('CORS')
        ));

      if (attempt < SYNC_CONFIG.MAX_RETRIES) {
        await sleep(getRetryDelay(attempt));
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      // Tag the error so callers know if it's offline vs server error
      const finalErr = new Error(
        isNetworkError
          ? `Server unreachable — working offline`
          : `Server error after ${SYNC_CONFIG.MAX_RETRIES} retries`
      );
      (finalErr as any).isNetworkError = isNetworkError;
      throw finalErr;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE (stats in localStorage — small, infrequent)
  // ═══════════════════════════════════════════════════════════════════════════

  private loadStats() {
    try {
      return JSON.parse(localStorage.getItem('ht_sync_stats') || '{}');
    } catch {
      return { totalPulls: 0, totalPushes: 0, conflictsDetected: 0,
               conflictsResolved: 0, bytesDownloaded: 0, bytesUploaded: 0,
               averageLatencyMs: 0 };
    }
  }

  private saveStats() {
    localStorage.setItem('ht_sync_stats', JSON.stringify(this.stats));
  }

  private updateLatency(ms: number) {
    const n = this.stats.totalPulls + this.stats.totalPushes;
    this.stats.averageLatencyMs = n <= 1
      ? Math.round(ms)
      : Math.round((this.stats.averageLatencyMs * (n - 1) + ms) / n);
  }

  private setStatus(s: SyncStatus) {
    this.status = s;
    this.statusListeners.forEach(fn => fn(s));
  }

  private isNetworkError(err: unknown): boolean {
    return (err as any)?.isNetworkError === true ||
      err instanceof TypeError ||
      (err instanceof Error && (/fetch|network|offline|unreachable/i.test(err.message)));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═════════════════════════════════════════════════════════════════════════════

let instance: MedSyncManager | null = null;

export function getSyncManager(): MedSyncManager {
  if (!instance) instance = new MedSyncManager();
  return instance;
}
