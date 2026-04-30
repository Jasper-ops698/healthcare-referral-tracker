import { useMemo, useCallback } from 'react';
import type { DashboardKPIs, ActivityLog, CollectorStats, Patient, MedicalRecord } from '@/types';
import { usePatients, useMedicalRecords, useUsers } from './useData';
import {
  differenceInDays, differenceInYears, format, startOfDay, startOfWeek,
  startOfMonth, subMonths, isAfter, isSameDay,
} from 'date-fns';

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

// ─── Compute KPIs from live patient/record/user data ───
function computeKPIs(
  patients: Patient[],
  records: MedicalRecord[],
  users: { id: string; firstName: string; lastName: string }[],
): DashboardKPIs {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

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

  const activeReferrals = patients.filter((p) =>
    ['referred', 'accepted', 'in-treatment'].includes(p.referralStatus),
  ).length;

  const pendingReferrals = patients.filter((p) =>
    p.referralStatus === 'screened',
  ).length;

  const completedReferrals = patients.filter((p) =>
    p.referralStatus === 'completed',
  ).length;

  const rejectedReferrals = patients.filter((p) =>
    p.referralStatus === 'rejected',
  ).length;

  const pendingScreenings = patients.filter((p) =>
    p.referralStatus === 'registered',
  ).length;

  const patientsByGender = {
    male: patients.filter((p) => p.gender === 'male').length,
    female: patients.filter((p) => p.gender === 'female').length,
    other: patients.filter((p) => p.gender === 'other').length,
  };

  const ageGroups: Record<string, number> = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };
  patients.forEach((p) => {
    const age = calculateAge(p.dateOfBirth);
    const group = getAgeGroup(age);
    ageGroups[group] = (ageGroups[group] || 0) + 1;
  });

  const statusKeys: Array<keyof DashboardKPIs['referralsByStatus']> = [
    'registered', 'screened', 'referred', 'accepted',
    'in-treatment', 'completed', 'rejected',
  ];
  const referralsByStatus = Object.fromEntries(
    statusKeys.map((s) => [s, patients.filter((p) => p.referralStatus === s).length]),
  ) as DashboardKPIs['referralsByStatus'];

  const referralsByMonth: DashboardKPIs['referralsByMonth'] = [];
  for (let i = 11; i >= 0; i--) {
    const monthStartDate = startOfMonth(subMonths(now, i));
    const monthEndDate = startOfMonth(subMonths(now, i - 1));
    const count = patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && (isAfter(d, monthStartDate) || isSameDay(d, monthStartDate)) && d < monthEndDate;
    }).length;
    referralsByMonth.push({ month: format(monthStartDate, 'MMM yyyy'), count });
  }

  const conditionCounts = new Map<string, number>();
  records.forEach((r) => {
    const diagnosis = r.preliminaryDiagnosis?.trim();
    if (diagnosis) {
      conditionCounts.set(diagnosis, (conditionCounts.get(diagnosis) || 0) + 1);
    }
  });
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

  const totalWithOutcome = completedReferrals + rejectedReferrals;
  const rejectionRate = totalWithOutcome > 0 ? Math.round((rejectedReferrals / totalWithOutcome) * 100) : 0;

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
          action: 'record_added',
          entityType: 'medical-record' as const,
          entityId: r.id,
          description: `record_added|${patient ? `${patient.firstName} ${patient.lastName}` : r.patientId}`,
          timestamp: toDate(r.recordedAt) || new Date(),
        };
      }),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);

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

// ─── Collector Stats ───
function computeCollectorStats(
  allPatients: Patient[],
  allRecords: MedicalRecord[],
  collectorId: string,
): CollectorStats {
  const myPatients = allPatients.filter((p) => p.registeredBy === collectorId);
  const myRecords = allRecords.filter((r) => r.recordedBy === collectorId);
  const myReferrals = myPatients.filter((p) => p.referralStatus === 'referred');

  // Pending = patients that need attention (registered but not yet screened/referred)
  const pendingTasks = myPatients.filter((p) =>
    ['registered', 'screened'].includes(p.referralStatus),
  ).length;

  // Monthly activity for the last 6 months
  const now = new Date();
  const monthlyActivity: { month: string; patients: number; records: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(now, i));
    const monthEnd = startOfMonth(subMonths(now, i - 1));
    const monthLabel = format(monthStart, 'MMM');
    const patientsThisMonth = myPatients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && (isAfter(d, monthStart) || isSameDay(d, monthStart)) && d < monthEnd;
    }).length;
    const recordsThisMonth = myRecords.filter((r) => {
      const d = toDate(r.recordedAt);
      return d && (isAfter(d, monthStart) || isSameDay(d, monthStart)) && d < monthEnd;
    }).length;
    monthlyActivity.push({ month: monthLabel, patients: patientsThisMonth, records: recordsThisMonth });
  }

  const recentPatients = myPatients
    .sort((a, b) => {
      const da = toDate(a.registrationDate);
      const db = toDate(b.registrationDate);
      return (db?.getTime() || 0) - (da?.getTime() || 0);
    })
    .slice(0, 5);

  return {
    patientsRegistered: myPatients.length,
    recordsEntered: myRecords.length,
    referralsMade: myReferrals.length,
    pendingTasks,
    recentPatients,
    monthlyActivity,
  };
}

// ─── Dashboard Hook ───
export function useDashboard() {
  const { patients, isLoading: patientsLoading } = usePatients();
  const { records, isLoading: recordsLoading } = useMedicalRecords();
  const { users } = useUsers();

  const kpis = useMemo(() => {
    return computeKPIs(patients, records, users);
  }, [patients, records, users]);

  const getCollectorStats = useCallback((collectorId: string): CollectorStats => {
    return computeCollectorStats(patients, records, collectorId);
  }, [patients, records]);

  return {
    kpis,
    isLoading: patientsLoading || recordsLoading,
    getCollectorStats,
  };
}
