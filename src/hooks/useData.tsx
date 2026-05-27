import { useState, useCallback, useEffect } from 'react';
import type {
  Patient,
  MedicalRecord,
  User,
  Chp,
  Facility,
  Referral,
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
   * Add user — OFFLINE-FIRST with outbox queue.
   *
   * 1. Save user locally with a temp ID
   * 2. Add to outbox so sync engine can retry later
   * 3. Try backend API call
   * 4. On success: update with server ID, mark outbox as sent
   * 5. On failure: outbox entry stays pending → sync engine retries
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

    // ── STEP 1: Save locally FIRST with temp ID ──
    const tempId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const localUser: DBUser = {
      ...userData,
      id: tempId,
      createdAt: new Date(),
      lastSyncedAt: undefined,
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
    await localDB.putUser(localUser);

    // ── STEP 2: Queue in outbox for sync engine ──
    const outboxPayload = apiPayload || {
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      phone: userData.phone,
      role: userData.role,
      assignedFacility: userData.assignedFacility,
      region: userData.region || 'default',
    };
    const outboxEntry = await localDB.enqueueChange('user', tempId, 'create', outboxPayload);
    setUsers(prev => [...prev, localUser as User]);

    // ── STEP 3: Try backend API ──
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
        body: JSON.stringify(outboxPayload),
        signal: controller.signal,
      });
      clearTimeout(t);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.error('[AddUser] Non-JSON response:', text.substring(0, 200));
        setIsLoading(false);
        return { user: localUser as User, serverSynced: false };
      }

      const result = await res.json();

      if (!res.ok || !result.success) {
        console.error('[AddUser] Backend error:', result.error);
        setIsLoading(false);
        return { user: localUser as User, serverSynced: false };
      }

      // ── STEP 4: Backend success — update with server ID, mark synced ──
      const backendUser = result.data?.user || result.data;
      const serverId = backendUser?._id || backendUser?.id || tempId;

      const updatedUser: DBUser = {
        ...localUser,
        id: serverId,
        lastSyncedAt: new Date(),
      };
      await localDB.putUser(updatedUser);
      await localDB.markAsSent(outboxEntry.changeId); // Mark outbox entry as sent
      await loadUsers();
      setIsLoading(false);

      return {
        user: updatedUser as User,
        serverSynced: true,
        error: result.data?.tempPassword ? `Temp password: ${result.data.tempPassword}` : undefined,
      };

    } catch (err: any) {
      // ── STEP 5: Backend failed — outbox stays pending, sync engine will retry ──
      if (err.name === 'AbortError') {
        console.warn('[AddUser] Backend timed out — user saved locally, sync engine will retry');
      } else {
        console.warn('[AddUser] Backend error — user saved locally, sync engine will retry:', err.message);
      }
      setIsLoading(false);
      return { user: localUser as User, serverSynced: false };
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
          const chpsArray = Array.isArray(result.data)
            ? result.data
            : result.data?.chps || [];
          if (result.success && chpsArray.length > 0) {
            // Merge: update existing, add new — NEVER clear all
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

    // ── STEP 1: Save locally FIRST ──
    const existing = chps.find(c => c.nationalId === chpData.nationalId);
    if (existing) return existing;

    const tempId = `local_chp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const count = chps.length;
    const localChp: Chp = {
      ...chpData,
      id: tempId,
      chpId: `CHP-${String(count + 1).padStart(4, '0')}`,
      createdAt: new Date(),
    };
    await localDB.putChp(localChp);

    // ── STEP 2: Queue in outbox for sync engine ──
    let chpOutboxEntry: { changeId: string } | null = null;
    if (!isLocalToken) {
      chpOutboxEntry = await localDB.enqueueChange('chp', tempId, 'create', { ...chpData });
    }
    setChps(prev => [...prev, localChp]);

    // ── STEP 3: Try backend API ──
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
            const updatedChp: Chp = {
              ...chpData,
              id: backendChp._id || backendChp.id || tempId,
              chpId: backendChp.chpId || localChp.chpId,
              createdAt: backendChp.createdAt ? new Date(backendChp.createdAt) : new Date(),
              lastSyncedAt: new Date(),
            };
            await localDB.putChp(updatedChp);
            if (chpOutboxEntry) await localDB.markAsSent(chpOutboxEntry.changeId);
            await loadChps();
            return updatedChp;
          }
        }
      } catch (err: any) {
        console.warn('[addChp] Backend create failed — CHP saved locally, sync engine will retry:', err.message);
      }
    }

    await loadChps();
    return localChp;
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

    const handleSyncSuccess = () => loadPatients();
    window.addEventListener('healthtrack-sync-success', handleSyncSuccess);
    return () => window.removeEventListener('healthtrack-sync-success', handleSyncSuccess);
  }, []);

  /**
   * Load Patients — BACKEND-FIRST sync with REPLACE strategy.
   */
  const loadPatients = useCallback(async () => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/patients?_t=${Date.now()}`, {
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
          const patientsArray = Array.isArray(result.data)
            ? result.data
            : result.data?.patients || [];
          if (result.success && patientsArray.length > 0) {
            // Merge: update existing, add new — NEVER clear all
            for (const p of patientsArray) {
              await localDB.putPatient({
                id: p._id || p.id,
                patientId: p.patientId,
                firstName: p.firstName,
                lastName: p.lastName,
                dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : new Date(),
                gender: p.gender,
                phone: p.phone,
                email: p.email,
                address: p.address,
                emergencyContact: p.emergencyContact,
                bloodType: p.bloodType,
                allergies: p.allergies || [],
                chronicConditions: p.chronicConditions || [],
                insuranceInfo: p.insuranceInfo,
                registeredBy: p.registeredBy?.toString() || '',
                assignedChpId: p.assignedChpId?.toString(),
                assignedChpName: p.assignedChpName,
                referralStages: p.referralStages || [],
                referralStatus: p.referralStatus || 'registered',
                registrationDate: p.createdAt ? new Date(p.createdAt) : new Date(),
                lastUpdated: p.updatedAt ? new Date(p.updatedAt) : new Date(),
                status: p.status || 'active',
                _sync: {
                  version: p._sync?.version || 1,
                  modifiedAt: p.updatedAt || new Date().toISOString(),
                  modifiedBy: localDB.getDeviceId(),
                  checksum: '',
                  isDeleted: false,
                  createdAt: p.createdAt || new Date().toISOString(),
                  createdBy: localDB.getDeviceId(),
                },
              } as DBPatient);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn('[loadPatients] Backend fetch timed out (45s). Server may be cold-starting.');
        } else {
          console.warn('[loadPatients] Backend fetch failed:', err.message || err);
        }
      }
    }

    const all = await localDB.getAllPatients();
    setPatients(all as Patient[]);
    setIsLoading(false);
  }, []);

  const searchPatientByPhone = useCallback(async (phone: string): Promise<Patient | null> => {
    // 1. Search local IndexedDB
    const localAll = await localDB.getAllPatients();
    const localMatch = localAll.find(p => p.phone === phone);
    if (localMatch) return localMatch as Patient;

    // 2. Try backend search
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    if (jwtToken && !jwtToken.startsWith('local_')) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/patients/search?q=${encodeURIComponent(phone)}`, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (res.ok) {
          const result = await res.json();
          const patientsArray = result.data?.patients || result.data || [];
          if (patientsArray.length > 0) {
            // Cache the found patient locally
            const p = patientsArray[0];
            const dbPatient: DBPatient = {
              id: p._id || p.id,
              patientId: p.patientId,
              firstName: p.firstName,
              lastName: p.lastName,
              dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : new Date(),
              gender: p.gender,
              phone: p.phone,
              email: p.email,
              address: p.address,
              emergencyContact: p.emergencyContact,
              bloodType: p.bloodType,
              allergies: p.allergies || [],
              chronicConditions: p.chronicConditions || [],
              insuranceInfo: p.insuranceInfo,
              registeredBy: p.registeredBy?.toString() || '',
              assignedChpId: p.assignedChpId?.toString(),
              assignedChpName: p.assignedChpName,
              currentFacilityId: p.currentFacilityId,
              currentFacilityName: p.currentFacilityName,
              currentCollectorId: p.currentCollectorId,
              currentCollectorName: p.currentCollectorName,
              referralStages: p.referralStages || [],
              referralStatus: p.referralStatus || 'registered',
              registrationDate: p.createdAt ? new Date(p.createdAt) : new Date(),
              lastUpdated: p.updatedAt ? new Date(p.updatedAt) : new Date(),
              status: p.status || 'active',
              _sync: {
                version: p._sync?.version || 1,
                modifiedAt: p.updatedAt || new Date().toISOString(),
                modifiedBy: localDB.getDeviceId(),
                checksum: '',
                isDeleted: false,
                createdAt: p.createdAt || new Date().toISOString(),
                createdBy: localDB.getDeviceId(),
              },
            } as DBPatient;
            await localDB.putPatient(dbPatient);
            await loadPatients();
            return dbPatient as Patient;
          }
        }
      } catch (err) {
        console.warn('[searchPatientByPhone] Backend search failed:', err);
      }
    }
    return null;
  }, [loadPatients]);

  const addPatient = useCallback(async (
    patientData: Omit<Patient, 'id' | 'patientId' | 'registrationDate' | 'lastUpdated'>
  ): Promise<Patient> => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    // ── STEP 1: Save locally FIRST with temp ID ──
    const count = patients.length;
    const tempId = `local_p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const localPatient: DBPatient = {
      ...patientData,
      id: tempId,
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
    await localDB.putPatient(localPatient);

    // ── STEP 2: Queue in outbox for sync engine ──
    if (!isLocalToken) {
      await localDB.enqueueChange('patient', tempId, 'create', { ...patientData });
    }

    // ── STEP 3: Try backend API ──
    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/patients?_t=${Date.now()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
          body: JSON.stringify(patientData),
          signal: controller.signal,
        });
        clearTimeout(t);

        if (res.ok || res.status === 201) {
          const result = await res.json();
          const backendPatient = result.data?.patient || result.data;
          if (backendPatient) {
            const updatedPatient: DBPatient = {
              ...patientData,
              id: backendPatient._id || backendPatient.id || tempId,
              patientId: backendPatient.patientId || localPatient.patientId,
              registrationDate: backendPatient.createdAt ? new Date(backendPatient.createdAt) : new Date(),
              lastUpdated: backendPatient.updatedAt ? new Date(backendPatient.updatedAt) : new Date(),
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
            await localDB.putPatient(updatedPatient);
            await loadPatients();
            return updatedPatient as Patient;
          }
        }
      } catch (err: any) {
        console.warn('[addPatient] Backend create failed — patient saved locally, sync engine will retry:', err.message);
      }
    }

    await loadPatients();
    return localPatient as Patient;
  }, [patients.length, loadPatients]);

  const updatePatient = useCallback(async (id: string, updates: Partial<Patient>): Promise<Patient | null> => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    // Try backend update first
    if (!isLocalToken && !id.startsWith('local_') && id.length === 24) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/patients/${id}?_t=${Date.now()}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
          body: JSON.stringify(updates),
          signal: controller.signal,
        });
        clearTimeout(t);

        if (res.ok) {
          const existing = await localDB.getPatientById(id);
          if (existing) {
            const updated = { ...existing, ...updates, lastUpdated: new Date() } as DBPatient;
            await localDB.putPatient(updated);
            await loadPatients();
            return updated as Patient;
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[updatePatient] Backend update failed, falling back to local:', err.message);
        }
      }
    }

    // Local fallback
    const existing = await localDB.getPatientById(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, lastUpdated: new Date() } as DBPatient;
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
    searchPatientByPhone,
  };
}

// ─── Medical Records Hook ───

export function useMedicalRecords() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecords();

    const handleSyncSuccess = () => loadRecords();
    window.addEventListener('healthtrack-sync-success', handleSyncSuccess);
    return () => window.removeEventListener('healthtrack-sync-success', handleSyncSuccess);
  }, []);

  /**
   * Load Medical Records — BACKEND-FIRST sync with REPLACE strategy.
   */
  const loadRecords = useCallback(async () => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/medical-records?_t=${Date.now()}`, {
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
          const recordsArray = Array.isArray(result.data)
            ? result.data
            : result.data?.records || [];
          if (result.success && recordsArray.length > 0) {
            // Merge: update existing, add new — NEVER clear all
            for (const r of recordsArray) {
              await localDB.putMedicalRecord({
                id: r._id || r.id,
                patientId: r.patientId?.toString() || '',
                recordedBy: r.recordedBy?.toString() || '',
                recordedAt: r.createdAt ? new Date(r.createdAt) : new Date(),
                visitType: r.recordType || 'routine',
                vitalSigns: r.vitalSigns || { temperatureUnit: 'celsius', weightUnit: 'kg', recordedAt: new Date() },
                chiefComplaint: r.chiefComplaint || '',
                symptoms: [],
                physicalExamination: r.physicalExamination,
                preliminaryDiagnosis: Array.isArray(r.diagnosis) ? r.diagnosis[0] : r.diagnosis,
                icd10Code: undefined,
                testsOrdered: undefined,
                testResults: undefined,
                medications: r.medications,
                procedures: r.procedures,
                referrals: r.referralDetails ? [{
                  id: uuidv4(),
                  fromFacility: '',
                  toFacility: r.referralDetails.referredToFacility,
                  toDepartment: r.referralDetails.referredToDepartment,
                  reason: r.referralDetails.reasonForReferral,
                  urgency: r.referralDetails.urgency,
                  status: r.referralDetails.referralStatus,
                  referredAt: new Date(r.encounterDate),
                }] : undefined,
                clinicalNotes: r.clinicalNotes,
                followUpInstructions: r.followUpInstructions,
                attachments: undefined,
                _sync: {
                  version: r._sync?.version || 1,
                  modifiedAt: r.updatedAt || new Date().toISOString(),
                  modifiedBy: localDB.getDeviceId(),
                  checksum: '',
                  isDeleted: false,
                  createdAt: r.createdAt || new Date().toISOString(),
                  createdBy: localDB.getDeviceId(),
                },
              } as DBMedicalRecord);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn('[loadMedicalRecords] Backend fetch timed out (45s). Server may be cold-starting.');
        } else {
          console.warn('[loadMedicalRecords] Backend fetch failed:', err.message || err);
        }
      }
    }

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
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    // ── STEP 1: Save locally FIRST with temp ID ──
    setIsLoading(true);
    const tempId = `local_r_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const localRecord: DBMedicalRecord = {
      ...recordData,
      id: tempId,
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
    await localDB.putMedicalRecord(localRecord);

    // ── STEP 2: Queue in outbox for sync engine ──
    if (!isLocalToken) {
      await localDB.enqueueChange('medicalRecord', tempId, 'create', { ...recordData });
    }

    // ── STEP 3: Try backend API ──
    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/medical-records?_t=${Date.now()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
          body: JSON.stringify(recordData),
          signal: controller.signal,
        });
        clearTimeout(t);

        if (res.ok || res.status === 201) {
          const result = await res.json();
          const backendRecord = result.data?.record || result.data;
          if (backendRecord) {
            const updatedRecord: DBMedicalRecord = {
              ...recordData,
              id: backendRecord._id || backendRecord.id || tempId,
              recordedAt: backendRecord.createdAt ? new Date(backendRecord.createdAt) : new Date(),
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
            await localDB.putMedicalRecord(updatedRecord);
            await loadRecords();
            setIsLoading(false);
            return updatedRecord as MedicalRecord;
          }
        }
      } catch (err: any) {
        console.warn('[addRecord] Backend create failed — record saved locally, sync engine will retry:', err.message);
      }
    }

    await loadRecords();
    setIsLoading(false);
    return localRecord as MedicalRecord;
  }, [loadRecords]);

  return { records, isLoading, addRecord, getRecordsByPatient, getRecordsByCollector, getRecordById, loadRecords };
}

// ─── Facilities Hook ───

export function useFacilities() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFacilities();

    const handleSyncSuccess = () => loadFacilities();
    window.addEventListener('healthtrack-sync-success', handleSyncSuccess);
    return () => window.removeEventListener('healthtrack-sync-success', handleSyncSuccess);
  }, []);

  /**
   * Load Facilities — BACKEND-FIRST sync with REPLACE strategy.
   */
  const loadFacilities = useCallback(async () => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const isLocalToken = !jwtToken || jwtToken.startsWith('local_');

    if (!isLocalToken) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(`${API_BASE_URL}/api/v1/facilities?_t=${Date.now()}`, {
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
          const facilitiesArray = Array.isArray(result.data)
            ? result.data
            : result.data?.facilities || [];
          if (result.success && facilitiesArray.length > 0) {
            await localDB.clearAllFacilities();
            for (const f of facilitiesArray) {
              await localDB.putFacility({
                id: f._id || f.id,
                name: f.name,
                type: f.type,
                address: f.address || { street: '', city: '', state: '', postalCode: '', country: 'Kenya' },
                phone: f.phone,
                email: f.email,
                departments: f.departments || [],
                services: f.services || [],
                isActive: f.isActive !== false,
              } as Facility);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn('[loadFacilities] Backend fetch timed out (45s). Server may be cold-starting.');
        } else {
          console.warn('[loadFacilities] Backend fetch failed:', err.message || err);
        }
      }
    }

    const all = await localDB.getAllFacilities();
    setFacilities(all);
    setIsLoading(false);
  }, []);

  const getFacilityById = useCallback((id: string): Facility | undefined => {
    return facilities.find(f => f.id === id);
  }, [facilities]);

  const getFacilitiesByCounty = useCallback((county: string): Facility[] => {
    return facilities.filter(f => f.address?.state === county);
  }, [facilities]);

  return { facilities, isLoading, loadFacilities, getFacilityById, getFacilitiesByCounty };
}

// ─── Aggregated Healthcare Hook ───

export function useHealthcareData() {
  const patients = usePatients();
  const medicalRecords = useMedicalRecords();
  const users = useUsers();
  const chps = useChps();
  const facilities = useFacilities();
  const dashboard = useDashboard();
  return { patients, medicalRecords, users, chps, facilities, dashboard };
}


// ─── Referrals Hook ───

export function useReferrals() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadReferrals = useCallback(async () => {
    setIsLoading(true);
    try {
      // Try local first
      const local = await db.table('referrals').toArray();
      if (local.length > 0) {
        setReferrals(local.map((r: any) => ({ ...r })) as Referral[]);
      }

      // Try backend
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      if (jwtToken && !jwtToken.startsWith('local_')) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/referrals/patient/all`, {
            headers: {
              'Authorization': `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (res.ok) {
            const result = await res.json();
            const refsArray = result.data?.referrals || result.data || [];
            const mapped = refsArray.map(mapReferralFromBackend);
            setReferrals(mapped);
            // Cache locally
            await db.table('referrals').bulkPut(
              mapped.map((r: any) => ({ ...r, _sync: { version: 1, modifiedAt: new Date().toISOString(), modifiedBy: localDB.getDeviceId(), checksum: '', isDeleted: false, createdAt: r.createdAt, createdBy: localDB.getDeviceId() } }))
            );
          }
        } catch (err) {
          console.warn('[loadReferrals] Backend failed:', err);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadIncomingReferrals = useCallback(async (facilityId: string, status?: string) => {
    setIsLoading(true);
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      if (jwtToken && !jwtToken.startsWith('local_')) {
        try {
          const url = status
            ? `${API_BASE_URL}/api/v1/referrals/incoming/${facilityId}?status=${status}`
            : `${API_BASE_URL}/api/v1/referrals/incoming/${facilityId}`;
          const res = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (res.ok) {
            const result = await res.json();
            const refsArray = result.data?.referrals || result.data || [];
            const mapped = refsArray.map(mapReferralFromBackend);
            setReferrals(mapped);
            return mapped;
          }
        } catch (err) {
          console.warn('[loadIncomingReferrals] Backend failed:', err);
        }
      }
      // Fallback: filter local
      const allLocal = await db.table('referrals').toArray();
      const filtered = allLocal.filter((r: any) => r.toFacilityId === facilityId && (!status || r.status === status));
      setReferrals(filtered);
      return filtered as Referral[];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acceptReferral = useCallback(async (referralId: string, collectorId: string, collectorName: string) => {
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      if (jwtToken && !jwtToken.startsWith('local_')) {
        const res = await fetch(`${API_BASE_URL}/api/v1/referrals/${referralId}/accept`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ collectorId, collectorName }),
        });
        if (!res.ok) throw new Error('Accept failed');
        const result = await res.json();
        return result.data?.referral;
      }
    } catch (err) {
      console.error('[acceptReferral] Failed:', err);
      throw err;
    }
  }, []);

  const createReferral = useCallback(async (referralData: Partial<Referral>) => {
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      if (jwtToken && !jwtToken.startsWith('local_')) {
        const res = await fetch(`${API_BASE_URL}/api/v1/referrals`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(referralData),
        });
        if (!res.ok) throw new Error('Create failed');
        const result = await res.json();
        return result.data?.referral;
      }
    } catch (err) {
      console.error('[createReferral] Failed:', err);
      throw err;
    }
  }, []);

  return {
    referrals,
    isLoading,
    loadReferrals,
    loadIncomingReferrals,
    acceptReferral,
    createReferral,
  };
}

function mapReferralFromBackend(r: any): Referral {
  return {
    id: r._id?.toString() || r.id,
    patientId: r.patientId?.toString() || r.patientId,
    patientName: r.patientName,
    patientPhone: r.patientPhone,
    patientIdNumber: r.patientIdNumber,
    fromFacilityId: r.fromFacilityId,
    fromFacilityName: r.fromFacilityName,
    fromCollectorId: r.fromCollectorId?.toString() || r.fromCollectorId,
    fromCollectorName: r.fromCollectorName,
    toFacilityId: r.toFacilityId,
    toFacilityName: r.toFacilityName,
    toCollectorId: r.toCollectorId?.toString() || r.toCollectorId,
    toCollectorName: r.toCollectorName,
    chpId: r.chpId,
    chpName: r.chpName,
    reason: r.reason,
    urgency: r.urgency,
    notes: r.notes,
    status: r.status,
    medicalRecordId: r.medicalRecordId?.toString() || r.medicalRecordId,
    createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    acceptedAt: r.acceptedAt ? new Date(r.acceptedAt) : undefined,
    completedAt: r.completedAt ? new Date(r.completedAt) : undefined,
    rejectedAt: r.rejectedAt ? new Date(r.rejectedAt) : undefined,
    rejectedReason: r.rejectedReason,
  };
}
