/**
 * useData — React hooks backed by IndexedDB (Dexie.js)
 *
 * Every mutation is written to IndexedDB and automatically enqueued
 * in the sync Outbox for MedSyncManager.pushLocalChanges() to upload.
 */

import { useState, useCallback, useEffect } from 'react';
import type {
  Patient,
  MedicalRecord,
  User,
  FilterOptions
} from '@/types';
import { getLocalDatabase } from '@/lib/dexieDatabase';
import type { DBPatient, DBUser, DBMedicalRecord } from '@/lib/dexieDatabase';
import { v4 as uuidv4 } from 'uuid';
import { useDashboard } from './useDashboard';

const localDB = getLocalDatabase();

// ─── Seed primary admin if empty ───
async function seedIfEmpty() {
  const existingUsers = await localDB.getAllUsers();
  if (existingUsers.length === 0) {
    // Seed only the primary admin — no mock data
    await localDB.putUser({
      id: 'admin-primary',
      email: 'bkitib@gmail.com',
      firstName: 'Emmanuel',
      lastName: 'Nyale',
      role: 'admin',
      phone: '+254700000001',
      isActive: true,
      createdAt: new Date(),
      region: 'global',
      isPrimaryAdmin: true,
      _sync: {
        version: 1,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'system',
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: 'system',
      },
    } as DBUser);
  }
}

// ─── Users Hook ───

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    seedIfEmpty().then(() => loadUsers());
  }, []);

  const loadUsers = useCallback(async () => {
    const all = await localDB.getAllUsers();
    setUsers(all as User[]);
    setIsLoading(false);
  }, []);

  const getUsersByRole = useCallback((role: 'admin' | 'collector'): User[] => {
    return users.filter(u => u.role === role);
  }, [users]);

  const getUserById = useCallback((id: string): User | undefined => {
    return users.find(u => u.id === id);
  }, [users]);

  const addUser = useCallback(async (userData: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> => {
    setIsLoading(true);
    const newUser: DBUser = {
      ...userData,
      id: userData.id || uuidv4(),
      createdAt: new Date(),
      _sync: {
        version: 1,
        modifiedAt: new Date().toISOString(),
        modifiedBy: localDB.getDeviceId(),
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: localDB.getDeviceId(),
      },
    } as DBUser;

    await localDB.putUser(newUser);
    await loadUsers();
    return newUser as User;
  }, [loadUsers]);

  const updateUser = useCallback(async (id: string, updates: Partial<User>): Promise<User | null> => {
    setIsLoading(true);
    const existing = await localDB.getUserById(id);
    if (!existing) { setIsLoading(false); return null; }

    const updated: DBUser = { ...existing, ...updates } as DBUser;
    await localDB.putUser(updated);
    await loadUsers();
    return updated as User;
  }, [loadUsers]);

  const toggleUserStatus = useCallback(async (id: string): Promise<boolean> => {
    const user = users.find(u => u.id === id);
    if (!user) return false;
    await updateUser(id, { isActive: !user.isActive });
    return true;
  }, [users, updateUser]);

  const clearUsers = useCallback(async (): Promise<void> => {
    await localDB.clearAllUsers();
    setUsers([]);
  }, []);

  return {
    users,
    isLoading,
    getUsersByRole,
    getUserById,
    addUser,
    updateUser,
    toggleUserStatus,
    clearUsers,
  };
}

// ─── Patients Hook ───

export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = useCallback(async () => {
    const all = await localDB.getAllPatients();
    setPatients(all as Patient[]);
    setIsLoading(false);
  }, []);

  const getPatientById = useCallback((id: string): Patient | undefined => {
    return patients.find(p => p.id === id);
  }, [patients]);

  const getPatientByPatientId = useCallback((patientId: string): Patient | undefined => {
    return patients.find(p => p.patientId === patientId);
  }, [patients]);

  const getPatientsByCollector = useCallback((collectorId: string): Patient[] => {
    return patients.filter(p => p.registeredBy === collectorId);
  }, [patients]);

  const addPatient = useCallback(async (
    patientData: Omit<Patient, 'id' | 'patientId' | 'registrationDate' | 'lastUpdated'>
  ): Promise<Patient> => {
    setIsLoading(true);
    const count = patients.length;
    const newPatient: DBPatient = {
      ...patientData,
      id: uuidv4(),
      patientId: `PT-${String(count + 1).padStart(6, '0')}`,
      registrationDate: new Date(),
      lastUpdated: new Date(),
      _sync: {
        version: 1,
        modifiedAt: new Date().toISOString(),
        modifiedBy: localDB.getDeviceId(),
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: localDB.getDeviceId(),
      },
    } as DBPatient;

    await localDB.putPatient(newPatient);
    await loadPatients();
    return newPatient as Patient;
  }, [patients.length, loadPatients]);

  const updatePatient = useCallback(async (id: string, updates: Partial<Patient>): Promise<Patient | null> => {
    setIsLoading(true);
    const existing = await localDB.getPatientById(id);
    if (!existing) { setIsLoading(false); return null; }

    const updated: DBPatient = { ...existing, ...updates, lastUpdated: new Date() } as DBPatient;
    await localDB.putPatient(updated);
    await loadPatients();
    return updated as Patient;
  }, [loadPatients]);

  const filterPatients = useCallback((filters: FilterOptions): Patient[] => {
    return patients.filter(p => {
      if (filters.status?.length && !filters.status.includes(p.status)) return false;
      if (filters.gender?.length && !filters.gender.includes(p.gender)) return false;
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        if (!`${p.firstName} ${p.lastName}`.toLowerCase().includes(q) &&
            !p.patientId.toLowerCase().includes(q) &&
            !p.phone.includes(filters.searchQuery)) return false;
      }
      return true;
    });
  }, [patients]);

  const searchPatients = useCallback((query: string): Patient[] => {
    if (!query.trim()) return patients;
    const q = query.toLowerCase();
    return patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.patientId.toLowerCase().includes(q) ||
      p.phone.includes(query)
    );
  }, [patients]);

  return {
    patients,
    isLoading,
    getPatientById,
    getPatientByPatientId,
    getPatientsByCollector,
    addPatient,
    updatePatient,
    filterPatients,
    searchPatients,
  };
}

// ─── Medical Records Hook ───

export function useMedicalRecords() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = useCallback(async () => {
    const all = await localDB.getAllMedicalRecords();
    setRecords(all as MedicalRecord[]);
    setIsLoading(false);
  }, []);

  const getRecordsByPatient = useCallback((patientId: string): MedicalRecord[] => {
    return records.filter(r => r.patientId === patientId);
  }, [records]);

  const getRecordsByCollector = useCallback((collectorId: string): MedicalRecord[] => {
    return records.filter(r => r.recordedBy === collectorId);
  }, [records]);

  const getRecordById = useCallback((id: string): MedicalRecord | undefined => {
    return records.find(r => r.id === id);
  }, [records]);

  const addRecord = useCallback(async (
    recordData: Omit<MedicalRecord, 'id' | 'recordedAt'>
  ): Promise<MedicalRecord> => {
    setIsLoading(true);
    const newRecord: DBMedicalRecord = {
      ...recordData,
      id: uuidv4(),
      recordedAt: new Date(),
      _sync: {
        version: 1,
        modifiedAt: new Date().toISOString(),
        modifiedBy: localDB.getDeviceId(),
        checksum: '',
        isDeleted: false,
        createdAt: new Date().toISOString(),
        createdBy: localDB.getDeviceId(),
      },
    } as DBMedicalRecord;

    await localDB.putMedicalRecord(newRecord);
    await loadRecords();
    return newRecord as MedicalRecord;
  }, [loadRecords]);

  const updateRecord = useCallback(async (id: string, updates: Partial<MedicalRecord>): Promise<MedicalRecord | null> => {
    setIsLoading(true);
    const existing = await localDB.getMedicalRecordById(id);
    if (!existing) { setIsLoading(false); return null; }

    const updated: DBMedicalRecord = { ...existing, ...updates } as DBMedicalRecord;
    await localDB.putMedicalRecord(updated);
    await loadRecords();
    return updated as MedicalRecord;
  }, [loadRecords]);

  return {
    records,
    isLoading,
    getRecordsByPatient,
    getRecordsByCollector,
    getRecordById,
    addRecord,
    updateRecord,
  };
}

// ─── Dashboard Hook (re-export from useDashboard.ts) ───
export { useDashboard } from './useDashboard';

// ─── Combined Hook ───

export function useHealthcareData() {
  const patients = usePatients();
  const medicalRecords = useMedicalRecords();
  const users = useUsers();
  const dashboard = useDashboard();
  return { patients, medicalRecords, users, dashboard };
}
