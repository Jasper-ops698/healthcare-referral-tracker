import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { DashboardKPIs, ActivityLog, CollectorStats } from '@/types';
import { getLocalDatabase } from '@/lib/dexieDatabase';
import { differenceInDays, differenceInYears, format, startOfDay, startOfWeek, startOfMonth, subMonths, isAfter, isSameDay } from 'date-fns';
import { API_BASE_URL } from '@/lib/config';

const localDB = getLocalDatabase();

// ───────────────────────────────────────────────────────────────────────────
//  REAL KPI COMPUTATION FROM INDEXEDDB
//  Computes all dashboard metrics from the actual patient / record / user
//  data stored in Dexie.js.  This runs entirely offline.
// ───────────────────────────────────────────────────────────────────────────

function calculateAge(dateOfBirth: Date | string): number {
  try {
    return differenceInYears(new Date(), new Date(dateOfBirth));
  } catch {
    return 0;
  }
}

function getAgeGroup(age: number): string {
  if (age < 18) return '0-18';
  if (age < 36) return '19-35';
  if (age < 51) return '36-50';
  if (age < 66) return '51-65';
  return '65+';
}

function toDate(d: Date | string | undefined): Date | null {
  if (!d) return null;
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

async function computeKPIsFromIndexedDB(): Promise<DashboardKPIs> {
  const [patients, records, users] = await Promise.all([
    localDB.getAllPatients(),
    localDB.getAllMedicalRecords(),
    localDB.getAllUsers(),
  ]);

  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  // ── Basic counts ──
  const totalPatients = patients.length;

  const newPatientsToday = patients.filter((p) => {
    const d = toDate(p.registrationDate);
    return d && isSameDay(d, today);
  }).length;

  const newPatientsThisWeek = patients.filter((p) => {
    const d = toDate(p.registrationDate);
    return d && (isAfter(d, weekStart) || isSameDay(d, weekStart));
  }).length;

  const newPatientsThisMonth = patients.filter((p) => {
    const d = toDate(p.registrationDate);
    return d && (isAfter(d, monthStart) || isSameDay(d, monthStart));
  }).length;

  // ── Referral counts ──
  const activeReferrals = patients.filter((p) =>
    ['referred', 'accepted', 'in-treatment'].includes(p.referralStatus)
  ).length;

  const pendingReferrals = patients.filter((p) =>
    p.referralStatus === 'screened'
  ).length;

  const completedReferrals = patients.filter((p) =>
    p.referralStatus === 'completed'
  ).length;

  const rejectedReferrals = patients.filter((p) =>
    p.referralStatus === 'rejected'
  ).length;

  const pendingScreenings = patients.filter((p) =>
    p.referralStatus === 'registered'
  ).length;

  // ── Gender breakdown ──
  const patientsByGender = {
    male: patients.filter((p) => p.gender === 'male').length,
    female: patients.filter((p) => p.gender === 'female').length,
    other: patients.filter((p) => p.gender === 'other').length,
  };

  // ── Age groups ──
  const ageGroups: Record<string, number> = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };
  patients.forEach((p) => {
    const age = calculateAge(p.dateOfBirth);
    const group = getAgeGroup(age);
    ageGroups[group] = (ageGroups[group] || 0) + 1;
  });

  // ── Referrals by status ──
  const statusKeys: Array<keyof DashboardKPIs['referralsByStatus']> = [
    'registered', 'screened', 'referred', 'accepted',
    'in-treatment', 'completed', 'rejected',
  ];
  const referralsByStatus = Object.fromEntries(
    statusKeys.map((s) => [s, patients.filter((p) => p.referralStatus === s).length])
  ) as DashboardKPIs['referralsByStatus'];

  // ── Referrals by month (last 12 months) ──
  const referralsByMonth: DashboardKPIs['referralsByMonth'] = [];
  for (let i = 11; i >= 0; i--) {
    const monthStartDate = startOfMonth(subMonths(now, i));
    const monthEndDate = startOfMonth(subMonths(now, i - 1));
    const count = patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && (isAfter(d, monthStartDate) || isSameDay(d, monthStartDate)) && d < monthEndDate;
    }).length;
    referralsByMonth.push({
      month: format(monthStartDate, 'MMM yyyy'),
      count,
    });
  }

  // ── Top conditions from medical records ──
  // Use preliminaryDiagnosis only. Do NOT double-count chiefComplaint.
  const conditionCounts = new Map<string, number>();
  records.forEach((r) => {
    const diagnosis = r.preliminaryDiagnosis?.trim();
    if (diagnosis) {
      conditionCounts.set(diagnosis, (conditionCounts.get(diagnosis) || 0) + 1);
    }
  });
  // If no preliminaryDiagnoses exist, fall back to chiefComplaint
  if (conditionCounts.size === 0) {
    records.forEach((r) => {
      const complaint = r.chiefComplaint?.trim();
      if (complaint) {
        conditionCounts.set(complaint, (conditionCounts.get(complaint) || 0) + 1);
      }
    });
  }
  const topConditions = Array.from(conditionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([condition, count]) => ({ condition, count }));

  // ── Average wait time: registrationDate → lastUpdated for completed patients ──
  // (Proxy for "how long from registration to completion")
  let totalWaitDays = 0;
  let waitCount = 0;
  patients.filter((p) => p.referralStatus === 'completed').forEach((patient) => {
    const regDate = toDate(patient.registrationDate);
    const lastDate = toDate(patient.lastUpdated);
    if (regDate && lastDate) {
      const days = differenceInDays(lastDate, regDate);
      if (days >= 0) {
        totalWaitDays += days;
        waitCount++;
      }
    }
  });
  const avgWaitTimeDays = waitCount > 0 ? Math.round(totalWaitDays / waitCount) : 0;

  // ── Rejection rate ──
  const totalWithOutcome = completedReferrals + rejectedReferrals;
  const rejectionRate = totalWithOutcome > 0 ? Math.round((rejectedReferrals / totalWithOutcome) * 100) : 0;

  // ── Recent activity ──
  const recentActivity: ActivityLog[] = [
    ...patients
      .sort((a, b) => {
        const da = toDate(a.registrationDate);
        const db = toDate(b.registrationDate);
        return (db?.getTime() || 0) - (da?.getTime() || 0);
      })
      .slice(0, 5)
      .map((p) => {
        const collector = users.find((u) => u.id === p.registeredBy);
        return {
          id: `act-p-${p.id}`,
          userId: p.registeredBy,
          userName: collector ? `${collector.firstName} ${collector.lastName}` : '_system_',
          action: 'patient_registered',
          entityType: 'patient' as const,
          entityId: p.id,
          description: `patient_registered|${p.firstName} ${p.lastName}`,
          timestamp: toDate(p.registrationDate) || new Date(),
        };
      }),
    ...records
      .sort((a, b) => {
        const da = toDate(a.recordedAt);
        const db = toDate(b.recordedAt);
        return (db?.getTime() || 0) - (da?.getTime() || 0);
      })
      .slice(0, 5)
      .map((r) => {
        const collector = users.find((u) => u.id === r.recordedBy);
        const patient = patients.find((p) => p.id === r.patientId);
        return {
          id: `act-r-${r.id}`,
          userId: r.recordedBy,
          userName: collector ? `${collector.firstName} ${collector.lastName}` : '_system_',
          action: 'record_created',
          entityType: 'medical-record' as const,
          entityId: r.id,
          description: `record_created|${patient ? `${patient.firstName} ${patient.lastName}` : '_unknown_'}`,
          timestamp: toDate(r.recordedAt) || new Date(),
        };
      }),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10);

  return {
    totalPatients,
    newPatientsToday,
    newPatientsThisWeek,
    newPatientsThisMonth,
    activeReferrals,
    pendingReferrals,
    completedReferrals,
    rejectedReferrals,
    pendingScreenings,
    avgWaitTimeDays,
    rejectionRate,
    patientsByGender,
    patientsByAgeGroup: ageGroups,
    referralsByStatus,
    referralsByMonth,
    topConditions,
    recentActivity,
  };
}

// ─── API-first fetch with IndexedDB fallback ───

async function fetchDashboardFromAPI(): Promise<DashboardKPIs | null> {
  try {
    const token = localStorage.getItem('healthtrack_jwt_token');
    const apiUrl = import.meta.env.VITE_API_URL || API_BASE_URL;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${apiUrl}/api/v1/analytics/dashboard`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.kpis) return data.kpis as DashboardKPIs;
    }
  } catch {
    // Network error — fall through to IndexedDB
  }
  return null;
}

// ─── Dashboard Hook ───

export function useDashboard() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshCount = useRef(0);

  const loadKPIs = useCallback(async () => {
    setIsLoading(true);

    // Strategy 1: Try backend API first
    const apiKpis = await fetchDashboardFromAPI();
    if (apiKpis) {
      setKpis(apiKpis);
      setIsLoading(false);
      return;
    }

    // Strategy 2: Compute from IndexedDB (offline mode)
    const localKpis = await computeKPIsFromIndexedDB();
    setKpis(localKpis);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadKPIs();
  }, [loadKPIs]);

  // Refresh every 30 seconds while online
  useEffect(() => {
    const interval = setInterval(() => {
      refreshCount.current++;
      // Every 30s try to refresh from API
      fetchDashboardFromAPI().then((apiKpis) => {
        if (apiKpis) setKpis(apiKpis);
      }).catch(() => {
        // Silently fail — keep showing IndexedDB data
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const getCollectorStats = useCallback((_collectorId: string): CollectorStats => {
    if (!kpis) {
      return {
        patientsRegistered: 0,
        recordsEntered: 0,
        referralsMade: 0,
        pendingTasks: 0,
        recentPatients: [],
        monthlyActivity: [],
      };
    }

    // These would need collector-scoped data; for now return from kpis
    return {
      patientsRegistered: kpis.totalPatients,
      recordsEntered: 0,
      referralsMade: kpis.activeReferrals,
      pendingTasks: kpis.pendingScreenings + kpis.pendingReferrals,
      recentPatients: [],
      monthlyActivity: kpis.referralsByMonth.map((m) => ({
        month: m.month,
        patients: m.count,
        records: 0,
      })),
    };
  }, [kpis]);

  const defaultKPIs: DashboardKPIs = useMemo(() => ({
    totalPatients: 0,
    newPatientsToday: 0,
    newPatientsThisWeek: 0,
    newPatientsThisMonth: 0,
    activeReferrals: 0,
    pendingReferrals: 0,
    completedReferrals: 0,
    rejectedReferrals: 0,
    pendingScreenings: 0,
    avgWaitTimeDays: 0,
    rejectionRate: 0,
    patientsByGender: { male: 0, female: 0, other: 0 },
    patientsByAgeGroup: { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 },
    referralsByStatus: {
      registered: 0, screened: 0, referred: 0, accepted: 0,
      'in-treatment': 0, completed: 0, rejected: 0,
    },
    referralsByMonth: [],
    topConditions: [],
    recentActivity: [],
  }), []);

  return {
    kpis: kpis ?? defaultKPIs,
    isLoading,
    refresh: loadKPIs,
    getCollectorStats,
  };
}
