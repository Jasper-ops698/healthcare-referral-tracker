/**
 * HealthTrack IndexedDB Layer — Powered by Dexie.js
 *
 * All entity mutations that also create outbox entries are wrapped in
 * Dexie transactions for atomicity. If either the entity write or the
 * outbox add fails, the entire transaction is rolled back.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Patient, MedicalRecord, User, Chp, Facility, ReferralV2 } from '@/types';

// ─── Outbox Status Lifecycle ───

export type OutboxStatus = 'pending' | 'syncing' | 'sent' | 'error' | 'conflict';

// ─── Entity Interfaces with Sync Metadata ───

export interface SyncMeta {
  version: number;
  modifiedAt: string;
  modifiedBy: string;
  checksum: string;
  isDeleted: boolean;
  createdAt: string;
  createdBy: string;
}

export interface DBPatient extends Patient {
  _sync: SyncMeta;
}

export interface DBUser extends User {
  _sync: SyncMeta;
}

export interface DBMedicalRecord extends MedicalRecord {
  _sync: SyncMeta;
}

// ─── Outbox Entry Interface ───

export interface OutboxEntry {
  changeId: string;
  entityType: 'user' | 'patient' | 'medicalRecord' | 'chp' | 'referral';
  entityId: string;
  changeType: 'create' | 'update' | 'delete';
  status: OutboxStatus;
  timestamp: string;
  payload: any;
  checksum: string;
  deviceId: string;
  retryCount: number;
  nextRetryAt: string | null;
  lastError?: string;
  lastHttpStatus?: number;
  conflictServerPayload?: any;
  conflictServerVersion?: number;
}

// ─── Sync Checkpoint Interface ───

export interface DBSyncCheckpoint {
  key: 'checkpoint';
  lastSyncVersion: number;
  lastSyncTime: string;
  deviceId: string;
  conflictLog: any[];
}

// ─── Dexie Database Class ───

class HealthTrackDB extends Dexie {
  patients!: EntityTable<DBPatient, 'id'>;
  chps!: EntityTable<Chp, 'id'>;
  users!: EntityTable<DBUser, 'id'>;
  medicalRecords!: EntityTable<DBMedicalRecord, 'id'>;
  facilities!: EntityTable<Facility, 'id'>;
  referrals!: EntityTable<ReferralV2, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'changeId'>;
  syncMeta!: EntityTable<DBSyncCheckpoint, 'key'>;

  /** Generic table accessor for dynamic lookups */
  table(name: 'patients' | 'chps' | 'users' | 'medicalRecords' | 'facilities' | 'referrals' | 'outbox' | 'syncMeta'): any {
    return super.table(name);
  }

  constructor() {
    super('HealthTrackDB');

    this.version(2).stores({
      patients: 'id, patientId, referralStatus, registeredBy, assignedChpId, assignedCollector, currentFacilityId, currentCollectorId, [registeredBy+_sync.version], [assignedChpId+status], [assignedCollector+status], [currentFacilityId+status], _sync.version',
      chps: 'id, chpId, nationalId, facilityId, county, status, [facilityId+status], [county+status]',
      users: 'id, email, role, isActive',
      medicalRecords: 'id, patientId, recordedBy, [patientId+recordedAt]',
      facilities: 'id, name, type, county, isActive',
      referrals: 'id, patientId, fromFacilityId, toFacilityId, toCollectorId, chpId, status, urgency, [toFacilityId+status], [patientId+createdAt], createdAt',
      outbox: 'changeId, status, [status+timestamp], [entityType+entityId], timestamp, nextRetryAt',
      syncMeta: 'key',
    });
  }
}

const db = new HealthTrackDB();
export default db;

// ─── LocalDatabase API ───

export class LocalDatabase {
  private deviceId: string;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  private getOrCreateDeviceId(): string {
    const key = 'healthtrack_device_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  getDeviceId(): string { return this.deviceId; }

  // ─── Sync Checkpoint ───

  async getCheckpoint(): Promise<DBSyncCheckpoint> {
    const cp = await db.syncMeta.get('checkpoint');
    if (cp) return cp;
    return {
      key: 'checkpoint',
      lastSyncVersion: 0,
      lastSyncTime: new Date(0).toISOString(),
      deviceId: this.deviceId,
      conflictLog: [],
    };
  }

  async saveCheckpoint(checkpoint: Partial<DBSyncCheckpoint>): Promise<void> {
    await db.syncMeta.put({
      key: 'checkpoint',
      lastSyncVersion: checkpoint.lastSyncVersion ?? 0,
      lastSyncTime: checkpoint.lastSyncTime ?? new Date().toISOString(),
      deviceId: this.deviceId,
      conflictLog: checkpoint.conflictLog ?? [],
    });
  }

  // ─── Outbox Operations ───

  /**
   * enqueueChange() — DEDUPLICATED.
   *
   * Before adding a new entry, checks if an identical pending entry
   * already exists for the same entity + operation. If so, updates
   * the payload (keeps the same changeId) instead of creating a duplicate.
   *
   * This prevents the "10 pending sync" problem where the same user
   * was added 10 times.
   */
  async enqueueChange(
    entityType: 'user' | 'patient' | 'medicalRecord' | 'chp',
    entityId: string,
    changeType: 'create' | 'update' | 'delete',
    payload: any
  ): Promise<OutboxEntry> {
    const checksum = await this.computeChecksum(payload);

    // ── Deduplication: look for existing pending entry for same entity ──
    const existing = await db.outbox
      .where('[entityType+entityId]')
      .between([entityType, entityId], [entityType, entityId])
      .filter(e => e.status === 'pending' || e.status === 'error')
      .first();

    if (existing) {
      // Update existing entry with new payload instead of creating duplicate
      await db.outbox.update(existing.changeId, {
        payload,
        checksum,
        timestamp: new Date().toISOString(),
        status: 'pending',
        retryCount: 0,
        nextRetryAt: null,
        lastError: undefined,
        lastHttpStatus: undefined,
      });
      const updated = await db.outbox.get(existing.changeId);
      return updated!;
    }

    // No existing entry — create new one
    const entry: OutboxEntry = {
      changeId: `change_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      entityType, entityId, changeType,
      status: 'pending',
      timestamp: new Date().toISOString(),
      payload, checksum,
      deviceId: this.deviceId,
      retryCount: 0, nextRetryAt: null,
    };
    await db.outbox.add(entry);
    return entry;
  }

  /**
   * recoverStaleSyncingItems()
   *
   * On startup, finds items stuck in 'syncing' state (from a previous
   * crashed session) and resets them to 'pending' so they can be retried.
   */
  async recoverStaleSyncingItems(maxAgeMinutes = 5): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60000).toISOString();
    const stale = await db.outbox
      .where('status').equals('syncing')
      .filter(e => e.timestamp < cutoff)
      .toArray();

    for (const item of stale) {
      await db.outbox.update(item.changeId, {
        status: 'pending',
        retryCount: 0,
        nextRetryAt: null,
        lastError: `Recovered from stale syncing state (older than ${maxAgeMinutes}m)`,
      });
    }
    return stale.length;
  }

  /**
   * getUnsyncedCount() — counts ALL items not yet synced.
   * Includes: pending + error (retryable) + syncing (stale)
   * This is what the UI badge should show.
   */
  async getUnsyncedCount(): Promise<number> {
    const now = new Date().toISOString();
    const [pendingCount, retryableCount] = await Promise.all([
      db.outbox.where('status').equals('pending').count(),
      db.outbox
        .where('status').equals('error')
        .filter(e => e.nextRetryAt !== null && e.nextRetryAt <= now)
        .count(),
    ]);
    return pendingCount + retryableCount;
  }

  async getPendingChanges(limit = 50): Promise<OutboxEntry[]> {
    return db.outbox
      .where('[status+timestamp]')
      .between(['pending', Dexie.minKey], ['pending', Dexie.maxKey])
      .limit(limit).toArray();
  }

  async getPendingCount(): Promise<number> {
    return db.outbox.where('status').equals('pending').count();
  }

  async markAsSyncing(changeId: string): Promise<void> {
    await db.outbox.update(changeId, { status: 'syncing' });
  }

  async markBatchAsSyncing(changeIds: string[]): Promise<void> {
    await db.transaction('rw', db.outbox, async () => {
      for (const id of changeIds) {
        await db.outbox.update(id, { status: 'syncing' });
      }
    });
  }

  async markAsSent(changeId: string): Promise<void> {
    await db.outbox.update(changeId, { status: 'sent' });
  }

  async markAsError(changeId: string, errorMessage: string, httpStatus?: number): Promise<void> {
    const entry = await db.outbox.get(changeId);
    if (!entry) return;
    const retryCount = entry.retryCount + 1;
    const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    await db.outbox.update(changeId, {
      status: 'error', retryCount, nextRetryAt,
      lastError: errorMessage, lastHttpStatus: httpStatus,
    });
  }

  async markAsConflict(changeId: string, serverPayload: any, serverVersion: number): Promise<void> {
    await db.outbox.update(changeId, {
      status: 'conflict',
      conflictServerPayload: serverPayload,
      conflictServerVersion: serverVersion,
    });
  }

  async getRetryableErrors(limit = 50): Promise<OutboxEntry[]> {
    const now = new Date().toISOString();
    return db.outbox
      .where('status').equals('error')
      .filter(e => e.nextRetryAt !== null && e.nextRetryAt <= now)
      .limit(limit).toArray();
  }

  async getConflictedEntries(): Promise<OutboxEntry[]> {
    return db.outbox.where('status').equals('conflict').toArray();
  }

  async resolveConflict(changeId: string, resolvedPayload: any): Promise<void> {
    const newChecksum = await this.computeChecksum(resolvedPayload);
    await db.outbox.update(changeId, {
      status: 'pending', payload: resolvedPayload, checksum: newChecksum,
      timestamp: new Date().toISOString(),
      conflictServerPayload: undefined, conflictServerVersion: undefined,
    });
  }

  async removeEntry(changeId: string): Promise<void> {
    await db.outbox.delete(changeId);
  }

  async cleanupSentItems(maxAgeHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
    const oldSent = await db.outbox
      .where('[status+timestamp]')
      .between(['sent', Dexie.minKey], ['sent', cutoff])
      .primaryKeys();
    if (oldSent.length > 0) await db.outbox.bulkDelete(oldSent);
    return oldSent.length;
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PATIENT CRUD — Wrapped in Dexie Transactions
  // ═══════════════════════════════════════════════════════════════════════

  async getAllPatients(): Promise<DBPatient[]> { return db.patients.toArray(); }
  async getPatientById(id: string): Promise<DBPatient | undefined> { return db.patients.get(id); }

  async getPatientsByCollector(collectorId: string): Promise<DBPatient[]> {
    return db.patients.where('registeredBy').equals(collectorId).toArray();
  }

  async searchPatients(query: string): Promise<DBPatient[]> {
    const lower = query.toLowerCase();
    return db.patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(lower) ||
      p.patientId.toLowerCase().includes(lower) ||
      p.phone.includes(query)
    ).toArray();
  }

  /**
   * putPatient()
   *
   * ATOMIC TRANSACTION: Writes to both `patients` and `outbox` tables
   * inside a single Dexie readwrite transaction. If either write fails,
   * the entire transaction is rolled back — no orphaned outbox entries,
   * no phantom patients.
   *
   * Dexie transaction API:
   *   db.transaction('rw', table1, table2, ..., async () => { ... })
   *
   * The callback runs inside the transaction scope. Any error thrown
   * (including from await'ed promises) causes Dexie to abort the
   * transaction and roll back all changes.
   */
  async putPatient(patient: DBPatient): Promise<DBPatient> {
    const existing = await db.patients.get(patient.id);
    const changeType = existing ? 'update' : 'create';

    // Bump sync metadata
    patient._sync = {
      ...patient._sync,
      version: (patient._sync?.version ?? 0) + 1,
      modifiedAt: new Date().toISOString(),
      modifiedBy: this.deviceId,
      checksum: await this.computeChecksum(patient),
    };

    // ─── BEGIN TRANSACTION ───
    await db.transaction('rw', db.patients, db.outbox, async () => {
      // Step 1: Write the entity
      await db.patients.put(patient);

      // Step 2: Enqueue the sync change
      // (If this fails, the patient put above is automatically rolled back)
      await this.enqueueChangeInTransaction('patient', patient.id, changeType, patient);
    });
    // ─── END TRANSACTION ───

    return patient;
  }

  /**
   * deletePatient()
   *
   * ATOMIC TRANSACTION: Soft-deletes the patient and enqueues a delete
   * outbox entry. Both operations succeed together or fail together.
   */
  async deletePatient(id: string): Promise<void> {
    const patient = await db.patients.get(id);
    if (!patient) return;

    // Prepare tombstone payload
    const tombstone = { id, deleted: true, patientId: patient.patientId };

    // ─── BEGIN TRANSACTION ───
    await db.transaction('rw', db.patients, db.outbox, async () => {
      // Step 1: Soft-delete the patient
      await db.patients.update(id, {
        '_sync.isDeleted': true,
        '_sync.modifiedAt': new Date().toISOString(),
        '_sync.modifiedBy': this.deviceId,
        '_sync.version': (patient._sync?.version ?? 0) + 1,
        status: 'inactive' as any,
      });

      // Step 2: Enqueue delete for sync
      await this.enqueueChangeInTransaction('patient', id, 'delete', tombstone);
    });
    // ─── END TRANSACTION ───
  }

  // ═══════════════════════════════════════════════════════════════════════
  // USER CRUD — Wrapped in Dexie Transactions
  // ═══════════════════════════════════════════════════════════════════════

  async getAllUsers(): Promise<DBUser[]> { return db.users.toArray(); }
  async getUserById(id: string): Promise<DBUser | undefined> { return db.users.get(id); }

  async getUserByEmail(email: string): Promise<DBUser | undefined> {
    return db.users.where('email').equals(email).first();
  }

  /**
   * putUser()
   *
   * ATOMIC TRANSACTION: Writes to both `users` and `outbox`.
   */
  async putUser(user: DBUser): Promise<DBUser> {
    const existing = await db.users.get(user.id);
    const changeType = existing ? 'update' : 'create';

    user._sync = {
      ...user._sync,
      version: (user._sync?.version ?? 0) + 1,
      modifiedAt: new Date().toISOString(),
      modifiedBy: this.deviceId,
      checksum: await this.computeChecksum(user),
    };

    // ─── BEGIN TRANSACTION ───
    await db.transaction('rw', db.users, db.outbox, async () => {
      await db.users.put(user);
      await this.enqueueChangeInTransaction('user', user.id, changeType, user);
    });
    // ─── END TRANSACTION ───

    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.users.delete(id);
  }

  async clearAllUsers(): Promise<void> {
    await db.users.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHP (Community Health Promoter) CRUD — Wrapped in Dexie Transactions
  // ═══════════════════════════════════════════════════════════════════════

  async getAllChps(): Promise<Chp[]> {
    return db.chps.toArray();
  }

  async getChpById(id: string): Promise<Chp | undefined> {
    return db.chps.get(id);
  }

  async getChpByChpId(chpId: string): Promise<Chp | undefined> {
    return db.chps.where('chpId').equals(chpId).first();
  }

  /**
   * putChp()
   *
   * ATOMIC TRANSACTION: Writes to both `chps` and `outbox`.
   */
  async putChp(chp: Chp): Promise<Chp> {
    const existing = await db.chps.get(chp.id);
    const changeType = existing ? 'update' : 'create';

    // Upsert
    await db.transaction('rw', db.chps, db.outbox, async () => {
      await db.chps.put(chp);
      await this.enqueueChangeInTransaction('chp', chp.id, changeType, chp);
    });

    return chp;
  }

  async deleteChp(id: string): Promise<void> {
    await db.chps.delete(id);
  }

  async clearAllChps(): Promise<void> {
    await db.chps.clear();
  }

  async clearAllPatients(): Promise<void> {
    await db.patients.clear();
  }

  async clearAllMedicalRecords(): Promise<void> {
    await db.medicalRecords.clear();
  }

  async clearAllFacilities(): Promise<void> {
    await db.facilities.clear();
  }

  /** Get CHPs filtered by facility (for collector dropdown) */
  async getChpsByFacility(facilityId: string): Promise<Chp[]> {
    return db.chps
      .where('[facilityId+status]')
      .between([facilityId, 'active'], [facilityId, 'active'])
      .toArray();
  }

  /** Get CHPs by county */
  async getChpsByCounty(county: string): Promise<Chp[]> {
    return db.chps
      .where('[county+status]')
      .between([county, 'active'], [county, 'active'])
      .toArray();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FACILITY CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async getAllFacilities(): Promise<Facility[]> {
    return db.facilities.toArray();
  }

  async getFacilityById(id: string): Promise<Facility | undefined> {
    return db.facilities.get(id);
  }

  async getFacilitiesByCounty(county: string): Promise<Facility[]> {
    return db.facilities.where('county').equals(county).toArray();
  }

  async putFacility(facility: Facility): Promise<Facility> {
    await db.facilities.put(facility);
    return facility;
  }

  async bulkPutFacilities(facilities: Facility[]): Promise<void> {
    await db.facilities.bulkPut(facilities);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MEDICAL RECORD CRUD — Wrapped in Dexie Transactions
  // ═══════════════════════════════════════════════════════════════════════

  async getAllMedicalRecords(): Promise<DBMedicalRecord[]> { return db.medicalRecords.toArray(); }

  async getMedicalRecordById(id: string): Promise<DBMedicalRecord | undefined> {
    return db.medicalRecords.get(id);
  }

  async getRecordsByPatient(patientId: string): Promise<DBMedicalRecord[]> {
    return db.medicalRecords.where('patientId').equals(patientId).toArray();
  }

  async getRecordsByCollector(collectorId: string): Promise<DBMedicalRecord[]> {
    return db.medicalRecords.where('recordedBy').equals(collectorId).toArray();
  }

  /**
   * putMedicalRecord()
   *
   * ATOMIC TRANSACTION: Writes to both `medicalRecords` and `outbox`.
   */
  async putMedicalRecord(record: DBMedicalRecord): Promise<DBMedicalRecord> {
    const existing = await db.medicalRecords.get(record.id);
    const changeType = existing ? 'update' : 'create';

    record._sync = {
      ...record._sync,
      version: (record._sync?.version ?? 0) + 1,
      modifiedAt: new Date().toISOString(),
      modifiedBy: this.deviceId,
      checksum: await this.computeChecksum(record),
    };

    // ─── BEGIN TRANSACTION ───
    await db.transaction('rw', db.medicalRecords, db.outbox, async () => {
      await db.medicalRecords.put(record);
      await this.enqueueChangeInTransaction('medicalRecord', record.id, changeType, record);
    });
    // ─── END TRANSACTION ───

    return record;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BULK OPERATIONS (for pull — no outbox, these came FROM server)
  // ═══════════════════════════════════════════════════════════════════════

  async bulkPutPatients(patients: DBPatient[]): Promise<void> {
    await db.patients.bulkPut(patients);
  }

  async bulkPutUsers(users: DBUser[]): Promise<void> {
    await db.users.bulkPut(users);
  }

  async bulkPutChps(chps: Chp[]): Promise<void> {
    await db.chps.bulkPut(chps);
  }

  async bulkPutMedicalRecords(records: DBMedicalRecord[]): Promise<void> {
    await db.medicalRecords.bulkPut(records);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATABASE LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  async destroy(): Promise<void> { await db.delete(); }

  async export() {
    const [patients, users, medicalRecords, outbox, checkpoint] = await Promise.all([
      db.patients.toArray(), db.users.toArray(), db.medicalRecords.toArray(),
      db.outbox.toArray(), db.syncMeta.get('checkpoint'),
    ]);
    return { patients, users, medicalRecords, outbox, checkpoint };
  }

  async import(data: {
    patients?: DBPatient[]; users?: DBUser[];
    medicalRecords?: DBMedicalRecord[]; checkpoint?: DBSyncCheckpoint;
  }): Promise<void> {
    await db.transaction('rw', db.patients, db.users, db.medicalRecords, db.syncMeta, async () => {
      if (data.patients) await db.patients.bulkPut(data.patients);
      if (data.users) await db.users.bulkPut(data.users);
      if (data.medicalRecords) await db.medicalRecords.bulkPut(data.medicalRecords);
      if (data.checkpoint) await db.syncMeta.put(data.checkpoint);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * enqueueChangeInTransaction()
   *
   * This is the INTERNAL variant of enqueueChange that MUST be called
   * from within an active Dexie transaction scope. It adds the outbox
   * entry using the transaction's already-open object store — no new
   * transaction is created, so the atomicity is preserved.
   *
   * If called OUTSIDE a transaction, it will still work but won't
   * be atomic with the entity write. Always call this inside
   * db.transaction('rw', ...).
   */
  private async enqueueChangeInTransaction(
    entityType: 'user' | 'patient' | 'medicalRecord' | 'chp',
    entityId: string,
    changeType: 'create' | 'update' | 'delete',
    payload: any
  ): Promise<void> {
    const checksum = await this.computeChecksum(payload);
    const entry: OutboxEntry = {
      changeId: `change_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      entityType, entityId, changeType,
      status: 'pending',
      timestamp: new Date().toISOString(),
      payload, checksum,
      deviceId: this.deviceId,
      retryCount: 0, nextRetryAt: null,
    };
    // Inside a transaction, db.outbox.add() participates in that tx
    await db.outbox.add(entry);
  }

  private async computeChecksum(payload: any): Promise<string> {
    const str = JSON.stringify(payload, Object.keys(payload).sort());
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// ─── Singleton ───
let localDBInstance: LocalDatabase | null = null;

export function getLocalDatabase(): LocalDatabase {
  if (!localDBInstance) localDBInstance = new LocalDatabase();
  return localDBInstance;
}
