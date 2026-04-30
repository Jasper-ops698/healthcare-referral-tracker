import { useState, useCallback, useEffect } from 'react';
import type {
  Patient,
  MedicalRecord,
  User,
  Chp
} from '@/types';
import { getLocalDatabase } from '@/lib/dexieDatabase';
import type { DBPatient, DBUser, DBMedicalRecord } from '@/lib/dexieDatabase';
import { API_BASE_URL } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';
import { useDashboard } from './useDashboard';

const localDB = getLocalDatabase();

// ─── Seed primary admin if empty ───
async function seedIfEmpty() {
  const existingUsers = await localDB.getAllUsers();
  if (existingUsers.length === 0) {
    // Seed only the primary admin — no mock data
    // Phone is empty; will be filled by backend sync (loadUsers fetches real data)
    await localDB.putUser({
      id: 'admin-primary',
      email: 'bkitib@gmail.com',
      firstName: 'Emmanuel',
      lastName: 'Nyale',
      role: 'admin',
      phone: '',
      status: 'active',
      region: 'global',
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

    // Re-load users whenever a successful sync completes
    const handleSyncSuccess = () => loadUsers();
    window.addEventListener('healthtrack-sync-success', handleSyncSuccess);
    return () => window.removeEventListener('healthtrack-sync-success', handleSyncSuccess);
  }, []);

  /**
   * Load users — BACKEND-FIRST sync with REPLACE strategy.
   *
   * When backend responds successfully:
   *   1. CLEAR the local users table
   *   2. INSERT fresh backend data with lastSyncedAt timestamp
   *   3. RE-INSERT any offline-created users still pending sync
   *
   * This guarantees the frontend matches MongoDB exactly.
   */
  const loadUsers = useCallback(async () => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/users?_t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
          signal: controller.signal,
        });
        clearTimeout(t);

        if (res.ok) {
          const result = await res.json();
          // Backend returns { success: true, data: { users: [...], count: N } }
          const usersArray = Array.isArray(result.data)
            ? result.data
            : result.data?.users || [];
          if (result.success && usersArray.length > 0) {
            // 1. Get offline users pending sync (to re-insert after clear)
            const outboxEntries = await localDB.getPendingChanges(100);
            const offlineUserIds = new Set(
              outboxEntries.filter(e => e.entityType === 'user').map(e => e.entityId)
            );
            const allLocal = await localDB.getAllUsers();
            const offlineUsers = allLocal.filter(u => offlineUserIds.has(u.id));

            // 2. CLEAR local users table
            await localDB.clearAllUsers();

            // 3. INSERT fresh backend data with lastSyncedAt
            const backendUsers = usersArray.map((u: any) => ({
              id: u._id || u.id,
              firstName: u.firstName,
              lastName: u.lastName,
              email: u.email,
              phone: u.phone || '',
              role: u.role,
              status: u.status || 'active',
              region: u.region || 'default',
              assignedFacility: u.assignedFacility || u.facilityId,
              forcePasswordChange: u.forcePasswordChange,
              preferences: u.preferences,
              avatar: u.avatar,
              dateOfBirth: u.dateOfBirth,
              gender: u.gender,
              nationalId: u.nationalId,
              emergencyContact: u.emergencyContact,
              languages: u.languages,
              homeCounty: u.homeCounty,
              bloodGroup: u.bloodGroup,
              physicalAddress: u.physicalAddress,
              nextOfKin: u.nextOfKin,
              bio: u.bio,
              createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
              lastLogin: u.lastLogin ? new Date(u.lastLogin) : undefined,
              lastSyncedAt: new Date(), // ← fresh from server
              _sync: {
                version: (u._sync?.version || 0) + 1,
                modifiedAt: new Date().toISOString(),
                modifiedBy: 'backend-pull',
                checksum: '',
                isDeleted: false,
                createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
                createdBy: u._sync?.createdBy || 'backend',
              },
            } as DBUser));

            for (const u of backendUsers) {
              await localDB.putUser(u);
            }

            // 4. Re-insert offline-created users (pending sync)
            for (const u of offlineUsers) {
              await localDB.putUser({ ...u, lastSyncedAt: undefined } as DBUser);
            }
          }
        }
      } catch (err: any) {
        // Log so we can diagnose in DevTools, but don't break the UI
        if (err.name === 'AbortError') {
          console.warn('[loadUsers] Backend fetch timed out (45s). Server may be cold-starting. Retrying on next sync cycle.');
        } else {
          console.warn('[loadUsers] Backend fetch failed:', err.message || err);
        }
      }
    }

    // Read from IndexedDB (backend-fresh or cached)
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

  /**
   * Add user — BACKEND-FIRST.
   * Only saves locally after backend confirms success.
   */
  const addUser = useCallback(async (
    userData: Omit<User, 'id' | 'createdAt'> & { id?: string; password?: string },
    apiPayload?: { firstName: string; lastName: string; email: string; phone: string; role: string; assignedFacility?: string; region?: string }
  ): Promise<{ user: User; serverSynced: boolean; error?: string }> => {
    const email = userData.email?.toLowerCase().trim();
    if (email) {
      const existing = users.find(u => u.email?.toLowerCase().trim() === email);
      if (existing) {
        return { user: existing, serverSynced: false, error: `User with email ${email} already exists` };
      }
    }

    setIsLoading(true);

    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    if (isLocalToken) {
      setIsLoading(false);
      return {
        user: { ...userData, id: '', createdAt: new Date() } as unknown as User,
        serverSynced: false,
        error: 'You must be logged in with a server connection to create users. Please log out and log back in.',
      };
    }

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(`${API_BASE_URL}/api/v1/users?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
        body: JSON.stringify(apiPayload || {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          phone: userData.phone,
          role: userData.role,
          assignedFacility: userData.assignedFacility,
          region: userData.region || 'default',
        }),
        signal: controller.signal,
      });
      clearTimeout(t);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.error('[AddUser] Non-JSON response:', text.substring(0, 200));
        setIsLoading(false);
        return {
          user: { ...userData, id: '', createdAt: new Date() } as unknown as User,
          serverSynced: false,
          error: 'Backend returned an invalid response. The server may be restarting — try again in 30 seconds.',
        };
      }

      const result = await res.json();

      if (!res.ok || !result.success) {
        const errorMsg = result.error?.message || result.error || `Server error: ${res.status}`;
        setIsLoading(false);
        return {
          user: { ...userData, id: '', createdAt: new Date() } as unknown as User,
          serverSynced: false,
          error: errorMsg,
        };
      }

      const backendUser = result.data?.user || result.data;
      const serverId = backendUser?._id || backendUser?.id || uuidv4();

      const newUser: DBUser = {
        ...userData,
        id: serverId,
        createdAt: backendUser?.createdAt ? new Date(backendUser.createdAt) : new Date(),
        lastSyncedAt: new Date(),
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
      setIsLoading(false);

      return {
        user: newUser as User,
        serverSynced: true,
        error: result.data?.tempPassword ? `Temp password: ${result.data.tempPassword}` : undefined,
      };

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setIsLoading(false);
        return {
          user: { ...userData, id: '', createdAt: new Date() } as unknown as User,
          serverSynced: false,
          error: 'Server is taking too long to respond. The backend may be waking up — try again in 30–60 seconds.',
        };
      }

      const isNetworkError =
        err.message?.includes('fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('Failed to fetch') ||
        !navigator.onLine;

      if (isNetworkError) {
        setIsLoading(false);
        return {
          user: { ...userData, id: '', createdAt: new Date() } as unknown as User,
          serverSynced: false,
          error: 'Network error — cannot reach the backend server. Please check your connection and try again.',
        };
      }

      setIsLoading(false);
      return {
        user: { ...userData, id: '', createdAt: new Date() } as unknown as User,
        serverSynced: false,
        error: err.message || 'Failed to create user',
      };
    }
  }, [loadUsers, users]);

  const updateUser = useCallback(async (id: string, updates: Partial<User>): Promise<User | null> => {
    setIsLoading(true);
    const existing = await localDB.getUserById(id);
    if (!existing) {
      setIsLoading(false);
      return null;
    }

    const updated = { ...existing, ...updates } as DBUser;
    await localDB.putUser(updated);
    await loadUsers();
    setIsLoading(false);
    return updated as User;
  }, [loadUsers]);

  const toggleUserStatus = useCallback(async (id: string): Promise<boolean> => {
    const user = users.find(u => u.id === id);
    if (!user) return false;
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    await updateUser(id, { status: newStatus });
    return true;
  }, [users, updateUser]);

  const clearUsers = useCallback(async () => {
    await localDB.clearAllUsers();
    setUsers([]);
  }, []);

  return {
    users,
    isLoading,
    loadUsers,
    getUsersByRole,
    getUserById,
    addUser,
    updateUser,
    toggleUserStatus,
    clearUsers,
  };
}

// ─── CHPs Hook ───

export function useChps() {
  const [chps, setChps] = useState<Chp[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChps();

    const handleSyncSuccess = () => loadChps();
    window.addEventListener('healthtrack-sync-success', handleSyncSuccess);
    return () => window.removeEventListener('healthtrack-sync-success', handleSyncSuccess);
  }, []);

  /**
   * Load CHPs — BACKEND-FIRST sync with REPLACE strategy.
   * Fetches from /api/v1/chps, replaces local IndexedDB data.
   */
  const loadChps = useCallback(async () => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/chps?_t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
          signal: controller.signal,
        });
        clearTimeout(t);

        if (res.ok) {
          const result = await res.json();
          const chpsArray = Array.isArray(result.data) ? result.data : [];
          if (result.success && chpsArray.length > 0) {
            await localDB.clearAllChps();
            for (const c of chpsArray) {
              await localDB.putChp({
                id: c._id || c.id,
                chpId: c.chpId,
                fullName: c.fullName,
                nationalId: c.nationalId,
                phone: c.phone,
                alternatePhone: c.alternatePhone,
                gender: c.gender,
                dateOfBirth: c.dateOfBirth,
                village: c.village,
                subLocation: c.subLocation,
                ward: c.ward,
                county: c.county,
                languages: c.languages || [],
                yearsOfExperience: c.yearsOfExperience,
                chpRegNumber: c.chpRegNumber,
                supervisorName: c.supervisorName,
                supervisorPhone: c.supervisorPhone,
                facilityId: c.facilityId,
                facilityName: c.facilityName,
                status: c.status || 'active',
                email: c.email,
                avatar: c.avatar,
                createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
                lastSyncedAt: new Date(),
              } as Chp);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn('[loadChps] Backend fetch timed out (45s). Server may be cold-starting.');
        } else {
          console.warn('[loadChps] Backend fetch failed:', err.message || err);
        }
      }
    }

    const all = await localDB.getAllChps();
    setChps(all);
    setIsLoading(false);
  }, []);

  const addChp = useCallback(async (chpData: Omit<Chp, 'id' | 'chpId' | 'createdAt'>): Promise<Chp> => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    // Backend-first: try API first
    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/chps?_t=${Date.now()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
          body: JSON.stringify(chpData),
          signal: controller.signal,
        });
        clearTimeout(t);

        if (res.ok || res.status === 201) {
          const result = await res.json();
          const backendChp = result.data?.chp || result.data;
          if (backendChp) {
            const newChp: Chp = {
              ...chpData,
              id: backendChp._id || backendChp.id || uuidv4(),
              chpId: backendChp.chpId,
              createdAt: backendChp.createdAt ? new Date(backendChp.createdAt) : new Date(),
              lastSyncedAt: new Date(),
            };
            await localDB.putChp(newChp);
            await loadChps();
            return newChp;
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[addChp] Backend create failed, falling back to local:', err.message);
        }
      }
    }

    // Fallback: save locally (offline mode)
    const existing = chps.find(c => c.nationalId === chpData.nationalId);
    if (existing) return existing;

    const id = uuidv4();
    const count = chps.length;
    const chpId = `CHP-${String(count + 1).padStart(4, '0')}`;

    const newChp: Chp = {
      ...chpData,
      id,
      chpId,
      createdAt: new Date(),
    };

    await localDB.putChp(newChp);
    await loadChps();
    return newChp;
  }, [chps, loadChps]);

  const getChpsByFacility = useCallback(async (facilityId: string): Promise<Chp[]> => {
    if (!facilityId) return chps.filter(c => c.status === 'active');
    return localDB.getChpsByFacility(facilityId);
  }, [chps]);

  const deleteChp = useCallback(async (id: string) => {
    await localDB.deleteChp(id);
    await loadChps();
  }, [loadChps]);

  const clearChps = useCallback(async () => {
    await localDB.clearAllChps();
    setChps([]);
  }, []);

  return {
    chps,
    isLoading,
    loadChps,
    addChp,
    getChpsByFacility,
    deleteChp,
    clearChps,
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

  const addPatient = useCallback(async (
    patientData: Omit<Patient, 'id' | 'patientId' | 'registrationDate' | 'lastUpdated'>
  ): Promise<Patient> => {
    const count = patients.length;
    const newPatient: DBPatient = {
      ...patientData,
      id: uuidv4(),
      patientId: `P1-${String(count + 1).padStart(6, '0')}`,
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
    const existing = await localDB.getPatientById(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates } as DBPatient;
    await localDB.putPatient(updated);
    await loadPatients();
    return updated as Patient;
  }, [loadPatients]);

  const getPatientsByCollector = useCallback((collectorId: string): Patient[] => {
    return patients.filter(p => p.registeredBy === collectorId);
  }, [patients]);

  return {
    patients,
    isLoading,
    loadPatients,
    addPatient,
    updatePatient,
    getPatientsByCollector,
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

  return { records, isLoading, addRecord, getRecordsByPatient, getRecordsByCollector, getRecordById, loadRecords };
}

// ─── Aggregated Healthcare Hook ───

export function useHealthcareData() {
  const patients = usePatients();
  const medicalRecords = useMedicalRecords();
  const users = useUsers();
  const chps = useChps();
  const dashboard = useDashboard();
  return { patients, medicalRecords, users, chps, dashboard };
}
