/**
 * Analytics Controller — Compute Dashboard KPIs from MongoDB ChangeRecords
 *
 * The backend does not maintain a separate Patient collection. Instead,
 * patient data lives as append-only ChangeRecords (delta sync log).
 *
 * To compute KPIs we reconstruct the current state of each patient by
 * finding the latest non-deleted change record per entityId and
 * reading its payload.
 */

import type { Request, Response } from 'express';
import ChangeRecord from '../models/ChangeRecord.js';
import User from '../models/User.js';
import type { DashboardKPIs } from '../../types.js';

/**
 * Reconstruct current patient state from ChangeRecords.
 *
 * Algorithm:
 *   1. Query all patient-type change records, sorted by version DESC.
 *   2. For each unique entityId, take the first (latest) record.
 *   3. If the latest operation is 'delete', skip it.
 *   4. Return the payload as the current entity state.
 *
 * PERFORMANCE NOTE:
 *   For 10,000 patients with ~5 changes each, this scans ~50,000 docs.
 *   In production you'd want a materialized Patient collection updated
 *   via ChangeRecord post-save hooks. This implementation is the
 *   "genuine" approach that works with the existing delta architecture.
 */
async function reconstructPatientsFromChanges(): Promise<Array<Record<string, unknown> & { id: string }>> {
  const changes = await ChangeRecord
    .find({ entityType: 'patient' })
    .sort({ entityId: 1, version: -1 })
    .select('entityId operation payload')
    .lean();

  const patients: Array<Record<string, unknown> & { id: string }> = [];
  const seen = new Set<string>();

  for (const change of changes) {
    const eid = change.entityId.toString();
    if (seen.has(eid)) continue;
    seen.add(eid);
    if (change.operation === 'delete') continue;
    patients.push({ id: eid, ...change.payload });
  }

  return patients;
}

async function reconstructRecordsFromChanges(): Promise<Array<Record<string, unknown> & { id: string }>> {
  const changes = await ChangeRecord
    .find({ entityType: 'medicalRecord' })
    .sort({ entityId: 1, version: -1 })
    .select('entityId operation payload')
    .lean();

  const records: Array<Record<string, unknown> & { id: string }> = [];
  const seen = new Set<string>();

  for (const change of changes) {
    const eid = change.entityId.toString();
    if (seen.has(eid)) continue;
    seen.add(eid);
    if (change.operation === 'delete') continue;
    records.push({ id: eid, ...change.payload });
  }

  return records;
}

function toDate(d: unknown): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d === 'string') {
    const p = new Date(d);
    return isNaN(p.getTime()) ? null : p;
  }
  return null;
}

function calculateAge(dob: unknown): number {
  const d = toDate(dob);
  if (!d) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return Math.max(0, age);
}

function getAgeGroup(age: number): string {
  if (age < 18) return '0-18';
  if (age < 36) return '19-35';
  if (age < 51) return '36-50';
  if (age < 66) return '51-65';
  return '65+';
}

/**
 * GET /api/v1/analytics/dashboard
 *
 * Returns a full DashboardKPIs object computed from the latest
 * ChangeRecord payloads in MongoDB.
 */
export async function getDashboardAnalytics(_req: Request, res: Response): Promise<void> {
  try {
    const [patients, records] = await Promise.all([
      reconstructPatientsFromChanges(),
      reconstructRecordsFromChanges(),
    ]);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── Basic counts ──
    const totalPatients = patients.length;

    const newPatientsToday = patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && d >= today;
    }).length;

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1);
    const newPatientsThisWeek = patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && d >= weekStart;
    }).length;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newPatientsThisMonth = patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && d >= monthStart;
    }).length;

    // ── Referral counts ──
    const activeReferrals = patients.filter((p) =>
      ['referred', 'accepted', 'in-treatment'].includes(String(p.referralStatus))
    ).length;
    const pendingReferrals = patients.filter((p) => p.referralStatus === 'screened').length;
    const completedReferrals = patients.filter((p) => p.referralStatus === 'completed').length;
    const rejectedReferrals = patients.filter((p) => p.referralStatus === 'rejected').length;
    const pendingScreenings = patients.filter((p) => p.referralStatus === 'registered').length;

    // ── Gender ──
    const patientsByGender = {
      male: patients.filter((p) => p.gender === 'male').length,
      female: patients.filter((p) => p.gender === 'female').length,
      other: patients.filter((p) => p.gender === 'other').length,
    };

    // ── Age groups ──
    const ageGroups: Record<string, number> = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };
    patients.forEach((p) => {
      const group = getAgeGroup(calculateAge(p.dateOfBirth));
      ageGroups[group] = (ageGroups[group] || 0) + 1;
    });

    // ── Referrals by status ──
    const statusKeys = ['registered', 'screened', 'referred', 'accepted', 'in-treatment', 'completed', 'rejected'] as const;
    const referralsByStatus = Object.fromEntries(
      statusKeys.map((s) => [s, patients.filter((p) => p.referralStatus === s).length])
    ) as DashboardKPIs['referralsByStatus'];

    // ── Referrals by month (last 12) ──
    const referralsByMonth: DashboardKPIs['referralsByMonth'] = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = patients.filter((p) => {
        const d = toDate(p.registrationDate);
        return d && d >= m && d < mEnd;
      }).length;
      referralsByMonth.push({
        month: m.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        count,
      });
    }

    // ── Top conditions from medical records ──
    const conditionCounts = new Map<string, number>();
    records.forEach((r) => {
      const dx = String(r.preliminaryDiagnosis || r.chiefComplaint || '').trim();
      if (dx) conditionCounts.set(dx, (conditionCounts.get(dx) || 0) + 1);
    });
    const topConditions = Array.from(conditionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([condition, count]) => ({ condition, count }));

    // ── Avg wait time ──
    let totalWaitDays = 0;
    let waitCount = 0;
    patients.filter((p) => p.referralStatus === 'completed').forEach((patient) => {
      const patientRecords = records.filter((r) => r.patientId === patient.id);
      if (patientRecords.length >= 2) {
        const dates = patientRecords.map((r) => toDate(r.recordedAt)).filter(Boolean) as Date[];
        dates.sort((a, b) => a.getTime() - b.getTime());
        const days = Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24));
        if (days >= 0) { totalWaitDays += days; waitCount++; }
      }
    });
    const avgWaitTimeDays = waitCount > 0 ? Math.round(totalWaitDays / waitCount) : 0;

    // ── Rejection rate ──
    const totalWithOutcome = completedReferrals + rejectedReferrals;
    const rejectionRate = totalWithOutcome > 0 ? Math.round((rejectedReferrals / totalWithOutcome) * 100) : 0;

    // ── Recent activity ──
    const recentActivity: DashboardKPIs['recentActivity'] = patients
      .map((p) => ({ ...p, _regDate: toDate(p.registrationDate) }))
      .filter((p) => p._regDate)
      .sort((a, b) => (b._regDate as Date).getTime() - (a._regDate as Date).getTime())
      .slice(0, 10)
      .map((p) => ({
        id: `act-${p.id}`,
        userId: String(p.registeredBy || 'system'),
        userName: 'System',
        action: 'patient_registered',
        entityType: 'patient' as const,
        entityId: p.id,
        description: `Registered patient ${p.firstName} ${p.lastName}`,
        timestamp: p._regDate as Date,
      }));

    const kpis: DashboardKPIs = {
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

    res.status(200).json({ success: true, kpis });
  } catch (err) {
    console.error('[Analytics] Dashboard computation failed:', err);
    res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_ERROR', message: 'Failed to compute analytics' },
    });
  }
}
