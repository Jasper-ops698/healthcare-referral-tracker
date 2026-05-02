import { useState, useMemo, useCallback } from 'react';
import { useDashboard } from '@/hooks/useDashboard';
import { usePatients, useUsers, useChps } from '@/hooks/useData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  Download, Calendar, FileText, TrendingUp, Users, Activity,
  Loader2, ArrowDown, Building2,
  ChevronRight, UserCheck, HeartPulse,
} from 'lucide-react';
import { format, subMonths, startOfMonth, isAfter, isSameDay, addMonths, differenceInYears } from 'date-fns';
import { toast } from 'sonner';

/* ── Date helpers ── */
function toDate(d: Date | string | undefined): Date | null {
  if (!d) return null;
  try { const p = new Date(d); return isNaN(p.getTime()) ? null : p; } catch { return null; }
}

/* ── CSV/JSON Export helpers ── */
function escapeCSV(val: string | number | undefined): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCSV(filename: string, headers: string[], rows: Record<string, string | number | undefined>[]) {
  if (rows.length === 0) return false;
  const csv = [
    headers.map(escapeCSV).join(','),
    ...rows.map((r) => headers.map((h) => escapeCSV(r[h])).join(',')),
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  return true;
}

function downloadJSON(filename: string, data: unknown) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    return true;
  } catch { return false; }
}

/* ── Period filter ── */
type Period = '30days' | '3months' | '6months' | '1year';
function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case '30days': return subMonths(now, 1);
    case '3months': return subMonths(now, 3);
    case '6months': return subMonths(now, 6);
    case '1year': return subMonths(now, 12);
  }
}

/* ── Age group ── */
function getAgeGroup(ageYears: number): string {
  if (ageYears < 1) return '<1';
  if (ageYears < 5) return '1-4';
  if (ageYears < 10) return '5-9';
  if (ageYears < 15) return '10-14';
  if (ageYears < 20) return '15-19';
  if (ageYears < 30) return '20-29';
  if (ageYears < 40) return '30-39';
  if (ageYears < 50) return '40-49';
  if (ageYears < 60) return '50-59';
  if (ageYears < 70) return '60-69';
  return '70+';
}

/* ═══════════════════════════ Reports & Analytics ═══════════════════════════ */

export default function ReportsAnalytics() {
  const { kpis, isLoading } = useDashboard();
  const { patients } = usePatients();
  const { users } = useUsers();
  const { chps } = useChps();
  const [dateRange, setDateRange] = useState<Period>('6months');
  const [exporting, setExporting] = useState<string | null>(null);

  const periodStart = getPeriodStart(dateRange);
  const now = new Date();

  const filteredPatients = useMemo(() => patients.filter((p) => {
    const d = toDate(p.registrationDate);
    return d && (isAfter(d, periodStart) || isSameDay(d, periodStart));
  }), [patients, periodStart]);

  const referredPatients = useMemo(() => patients.filter((p) =>
    ['referred', 'accepted', 'in-treatment', 'completed', 'rejected'].includes(p.referralStatus)
  ), [patients]);

  const completionRate = useMemo(() => {
    const pipeline = referredPatients.length;
    return pipeline === 0 ? 0 : Math.round((kpis.completedReferrals / pipeline) * 100);
  }, [kpis.completedReferrals, referredPatients.length]);

  // ── Trend data ──
  const trendData = useMemo(() => {
    const monthCount = dateRange === '1year' ? 12 : dateRange === '6months' ? 6 : dateRange === '3months' ? 3 : 1;
    return Array.from({ length: monthCount }, (_, i) => {
      const monthDate = subMonths(now, monthCount - 1 - i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = startOfMonth(addMonths(monthDate, 1));
      const registrations = patients.filter((p) => { const d = toDate(p.registrationDate); return d && d >= monthStart && d < monthEnd; }).length;
      const referred = patients.filter((p) => { const d = toDate(p.registrationDate); return d && d >= monthStart && d < monthEnd && ['referred', 'accepted', 'in-treatment', 'completed'].includes(p.referralStatus); }).length;
      const completed = patients.filter((p) => { const d = toDate(p.registrationDate); return d && d >= monthStart && d < monthEnd && p.referralStatus === 'completed'; }).length;
      return { month: format(monthDate, 'MMM yyyy'), registrations, referred, completed };
    });
  }, [patients, dateRange]);

  // ── Demographics ──
  const conditionData = useMemo(() => {
    const colors = ['#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#10b981'];
    return kpis.topConditions.map((c, i) => ({ name: c.condition, value: c.count, color: colors[i % colors.length] }));
  }, [kpis.topConditions]);

  const genderAgeData = useMemo(() => {
    const groups = ['<1', '1-4', '5-9', '10-14', '15-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70+'];
    return groups.map((ageGroup) => ({
      ageGroup,
      male: patients.filter((p) => p.gender === 'male' && p.dateOfBirth && getAgeGroup(differenceInYears(new Date(), new Date(p.dateOfBirth))) === ageGroup).length,
      female: patients.filter((p) => p.gender === 'female' && p.dateOfBirth && getAgeGroup(differenceInYears(new Date(), new Date(p.dateOfBirth))) === ageGroup).length,
    }));
  }, [patients]);

  // ── Collector stats ──
  const collectorStats = useMemo(() => {
    const stats = new Map<string, { name: string; patients: number; referred: number; completed: number; screeningNeeded: number }>();
    patients.forEach((p) => {
      const collector = users.find((u) => u.id === p.registeredBy);
      const name = collector ? `${collector.firstName} ${collector.lastName}` : 'Unknown';
      const existing = stats.get(p.registeredBy) || { name, patients: 0, referred: 0, completed: 0, screeningNeeded: 0 };
      existing.patients++;
      if (['referred', 'accepted', 'in-treatment', 'completed'].includes(p.referralStatus)) existing.referred++;
      if (p.referralStatus === 'completed') existing.completed++;
      if (p.referralStatus === 'registered') existing.screeningNeeded++;
      stats.set(p.registeredBy, existing);
    });
    return Array.from(stats.values());
  }, [patients, users]);

  /* ═══════════════ EXPORT HANDLERS ═══════════════ */

  const handleExport = useCallback((type: string) => {
    setExporting(type);
    try {
      switch (type) {

        /* ── 1. PATIENT REGISTRATION REPORT (MoH DHIS2 compliant) ── */
        case 'patients': {
          const headers = [
            'Patient ID', 'First Name', 'Last Name', 'Gender', 'Age (Years)', 'Age Group',
            'Phone Number', 'Blood Type',
            'Address (Street)', 'City', 'State', 'Postal Code', 'Country',
            'Registration Date', 'Registered By (Collector)',
            'CHP Assigned', 'Referral Status', 'Number of Referral Stages',
            'Chronic Conditions', 'Allergies', 'Status',
          ];
          const rows = patients.map((p) => {
            const age = p.dateOfBirth ? differenceInYears(new Date(), new Date(p.dateOfBirth)) : '';
            const collector = users.find((u) => u.id === p.registeredBy);
            return {
              'Patient ID': p.patientId,
              'First Name': p.firstName,
              'Last Name': p.lastName,
              'Gender': p.gender,
              'Age (Years)': age,
              'Age Group': age !== '' ? getAgeGroup(Number(age)) : '',
              'Phone Number': p.phone ? `\t${p.phone}` : '',
              'Blood Type': p.bloodType || '',
              'Address (Street)': p.address?.street || '',
              'City': p.address?.city || '',
              'State': p.address?.state || '',
              'Postal Code': p.address?.postalCode || '',
              'Country': p.address?.country || '',
              'Registration Date': p.registrationDate ? format(new Date(p.registrationDate), 'yyyy-MM-dd') : '',
              'Registered By (Collector)': collector ? `${collector.firstName} ${collector.lastName}` : p.registeredBy,
              'CHP Assigned': p.assignedChpName || '',
              'Referral Status': p.referralStatus,
              'Number of Referral Stages': p.referralStages?.length || 0,
              'Chronic Conditions': (p.chronicConditions || []).join('; '),
              'Allergies': (p.allergies || []).join('; '),
              'Status': p.status,
            };
          });
          downloadCSV(`patient-registration-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
          toast.success('Patient registration report exported (MoH format)');
          break;
        }

        /* ── 2. REFERRAL PIPELINE REPORT ── */
        case 'referrals': {
          const headers = [
            'Patient ID', 'Patient Name', 'Gender', 'Age', 'Phone',
            'From Facility', 'To Facility', 'Referral Stage', 'Stage Number',
            'Referral Date', 'CHP Accompanying', 'Referral Reason/Notes',
            'Current Status', 'Days Since Referral',
          ];
          const rows: Record<string, string | number | undefined>[] = [];
          patients.forEach((p) => {
            if (!p.referralStages || p.referralStages.length === 0) return;
            const age = p.dateOfBirth ? differenceInYears(new Date(), new Date(p.dateOfBirth)) : '';
            p.referralStages.forEach((stage) => {
              const daysSince = stage.date ? Math.floor((new Date().getTime() - new Date(stage.date).getTime()) / (1000 * 60 * 60 * 24)) : '';
              rows.push({
                'Patient ID': p.patientId,
                'Patient Name': `${p.firstName} ${p.lastName}`,
                'Gender': p.gender,
                'Age': age,
                'Phone': p.phone ? `\t${p.phone}` : '',
                'From Facility': stage.fromFacility || '',
                'To Facility': stage.toFacility || '',
                'Referral Stage': stage.status,
                'Stage Number': stage.stage,
                'Referral Date': stage.date ? format(new Date(stage.date), 'yyyy-MM-dd') : '',
                'CHP Accompanying': stage.chpName || p.assignedChpName || '',
                'Referral Reason/Notes': stage.notes || '',
                'Current Status': p.referralStatus,
                'Days Since Referral': daysSince,
              });
            });
          });
          downloadCSV(`referral-pipeline-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
          toast.success('Referral pipeline report exported');
          break;
        }

        /* ── 3. COLLECTOR PERFORMANCE REPORT ── */
        case 'collectors': {
          const headers = [
            'Collector Name', 'Facility', 'Patients Registered', 'Patients Referred',
            'Referrals Completed', 'Completion Rate (%)', 'Patients Needing Screening',
            'Active Cases', 'Total Cases',
          ];
          const rows = collectorStats.map((c) => ({
            'Collector Name': c.name,
            'Facility': '',
            'Patients Registered': c.patients,
            'Patients Referred': c.referred,
            'Referrals Completed': c.completed,
            'Completion Rate (%)': c.referred > 0 ? Math.round((c.completed / c.referred) * 100) : 0,
            'Patients Needing Screening': c.screeningNeeded,
            'Active Cases': c.referred - c.completed,
            'Total Cases': c.patients,
          }));
          downloadCSV(`collector-performance-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
          toast.success('Collector performance report exported');
          break;
        }

        /* ── 4. CHP ASSIGNMENT REPORT ── */
        case 'chps': {
          const headers = [
            'CHP Name', 'CHP ID', 'Phone', 'County', 'Sub County', 'Ward', 'Village',
            'Facility', 'Patients Assigned', 'Active Cases', 'Completed Cases',
            'Supervisor', 'Supervisor Phone', 'Languages Spoken',
          ];
          const rows = chps.map((chp) => {
            const assigned = patients.filter((p) => p.assignedChpId === chp.id || p.assignedChpName === chp.fullName);
            const active = assigned.filter((p) => ['referred', 'accepted', 'in-treatment'].includes(p.referralStatus)).length;
            const completed = assigned.filter((p) => p.referralStatus === 'completed').length;
            return {
              'CHP Name': chp.fullName,
              'CHP ID': chp.chpId || chp.id,
              'Phone': chp.phone ? `'${chp.phone}` : '',
              'County': chp.county || '',
              'Sub County': chp.subLocation || '',
              'Ward': chp.ward || '',
              'Village': chp.village || '',
              'Facility': chp.facilityName || '',
              'Patients Assigned': assigned.length,
              'Active Cases': active,
              'Completed Cases': completed,
              'Supervisor': chp.supervisorName || '',
              'Supervisor Phone': chp.supervisorPhone ? `'${chp.supervisorPhone}` : '',
              'Languages Spoken': (chp.languages || []).join('; '),
            };
          });
          downloadCSV(`chp-assignment-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
          toast.success('CHP assignment report exported');
          break;
        }

        /* ── 5. FACILITY ACTIVITY REPORT ── */
        case 'facilities': {
          const facilityMap = new Map<string, {
            patients: number; referred: number; completed: number;
            byGender: { male: number; female: number; other: number };
            ageGroups: Record<string, number>;
          }>();
          patients.forEach((p) => {
            const facility = p.address?.city || 'Unknown';
            const existing = facilityMap.get(facility) || { patients: 0, referred: 0, completed: 0, byGender: { male: 0, female: 0, other: 0 }, ageGroups: {} as Record<string, number> };
            existing.patients++;
            const gender = p.gender === 'male' || p.gender === 'female' ? p.gender : 'other';
            existing.byGender[gender]++;
            if (['referred', 'accepted', 'in-treatment', 'completed'].includes(p.referralStatus)) existing.referred++;
            if (p.referralStatus === 'completed') existing.completed++;
            if (p.dateOfBirth) {
              const ag = getAgeGroup(differenceInYears(new Date(), new Date(p.dateOfBirth)));
              existing.ageGroups[ag] = (existing.ageGroups[ag] || 0) + 1;
            }
            facilityMap.set(facility, existing);
          });
          const headers = ['Facility Name', 'Total Patients', 'Male', 'Female', 'Referred', 'Completed', 'Completion Rate (%)', 'Top Age Group'];
          const rows = Array.from(facilityMap.entries()).map(([name, data]) => ({
            'Facility Name': name,
            'Total Patients': data.patients,
            'Male': data.byGender.male,
            'Female': data.byGender.female,
            'Referred': data.referred,
            'Completed': data.completed,
            'Completion Rate (%)': data.referred > 0 ? Math.round((data.completed / data.referred) * 100) : 0,
            'Top Age Group': Object.entries(data.ageGroups).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
          }));
          downloadCSV(`facility-activity-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
          toast.success('Facility activity report exported');
          break;
        }

        /* ── 6. MEDICAL CONDITIONS / SURVEILLANCE REPORT ── */
        case 'conditions': {
          const headers = ['Condition/Diagnosis', 'Case Count', '% of Total', 'Male', 'Female', 'By Age Group'];
          const total = kpis.topConditions.reduce((s, c) => s + c.count, 0) || 1;
          const rows = kpis.topConditions.map((c) => ({
            'Condition/Diagnosis': c.condition,
            'Case Count': c.count,
            '% of Total': Math.round((c.count / total) * 100),
            'Male': '',
            'Female': '',
            'By Age Group': '',
          }));
          downloadCSV(`medical-conditions-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
          toast.success('Medical conditions report exported');
          break;
        }

        /* ── 7. MONTHLY STATISTICS (JSON) ── */
        case 'monthly': {
          downloadJSON(`monthly-statistics-${format(new Date(), 'yyyy-MM-dd')}.json`, {
            reportType: 'HealthTrack Monthly Statistics',
            generatedAt: new Date().toISOString(),
            period: dateRange,
            summary: {
              totalPatients: kpis.totalPatients,
              newThisPeriod: filteredPatients.length,
              referred: referredPatients.length,
              completed: kpis.completedReferrals,
              completionRate: `${completionRate}%`,
              avgProcessingDays: kpis.avgWaitTimeDays,
            },
            demographics: { byGender: kpis.patientsByGender, byAgeGroup: kpis.patientsByAgeGroup },
            monthlyTrend: trendData,
            topConditions: kpis.topConditions,
            collectorPerformance: collectorStats,
          });
          toast.success('Monthly statistics exported');
          break;
        }

        default:
          toast.info('Coming soon');
      }
      setExporting(null);
    } catch (err: any) {
      console.error('Export failed:', err);
      toast.error(`Export failed: ${err.message}`);
      setExporting(null);
    }
  }, [patients, kpis, dateRange, filteredPatients.length, referredPatients.length, collectorStats, chps, users, completionRate]);

  /* ── Bulk Export ── */
  const handleBulkExport = useCallback(() => {
    setExporting('bulk');
    try {
      downloadJSON(`healthtrack-full-report-${format(new Date(), 'yyyy-MM-dd')}.json`, {
        reportType: 'HealthTrack Comprehensive Report',
        generatedAt: new Date().toISOString(),
        period: dateRange,
        summary: {
          totalPatients: kpis.totalPatients,
          newThisPeriod: filteredPatients.length,
          referredPatients: referredPatients.length,
          activeReferrals: kpis.activeReferrals,
          completedReferrals: kpis.completedReferrals,
          completionRate: `${completionRate}%`,
          avgProcessingDays: kpis.avgWaitTimeDays,
          totalCollectors: users.length,
          totalChps: chps.length,
        },
        demographics: { byGender: kpis.patientsByGender, byAgeGroup: kpis.patientsByAgeGroup },
        referralsByStatus: kpis.referralsByStatus,
        monthlyTrend: trendData,
        topConditions: kpis.topConditions,
        collectorPerformance: collectorStats,
        patientList: patients.map((p) => ({
          patientId: p.patientId,
          name: `${p.firstName} ${p.lastName}`,
          gender: p.gender,
          age: p.dateOfBirth ? differenceInYears(new Date(), new Date(p.dateOfBirth)) : null,
          city: p.address?.city || '',
          referralStatus: p.referralStatus,
          assignedChp: p.assignedChpName || '',
          facility: p.address?.city || '',
        })),
      });
      toast.success('Full analytics report exported');
      setExporting(null);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
      setExporting(null);
    }
  }, [kpis, trendData, dateRange, completionRate, filteredPatients.length, referredPatients.length, collectorStats, patients, users.length, chps.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Loading reports...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">
            {kpis.totalPatients} patient{kpis.totalPatients !== 1 ? 's' : ''} registered — Ministry of Health compliant reports
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as Period)}
            className="px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm text-gray-700"
          >
            <option value="30days">Last 30 Days</option>
            <option value="3months">Last 3 Months</option>
            <option value="6months">Last 6 Months</option>
            <option value="1year">Last 1 Year</option>
          </select>
          <button
            onClick={handleBulkExport}
            disabled={exporting === 'bulk'}
            className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {exporting === 'bulk' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export All
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard icon={<Users className="w-5 h-5 text-teal-600" />} iconBg="bg-teal-50" label="Total Patients" value={kpis.totalPatients.toLocaleString()} change={`${filteredPatients.length} this period`} changeLabel="" />
        <SummaryCard icon={<Activity className="w-5 h-5 text-emerald-600" />} iconBg="bg-emerald-50" label="Active Referrals" value={kpis.activeReferrals.toLocaleString()} change={`${kpis.pendingReferrals} pending action`} changeLabel="" />
        <SummaryCard icon={<FileText className="w-5 h-5 text-amber-600" />} iconBg="bg-amber-50" label="Completion Rate" value={`${completionRate}%`} change={`${kpis.completedReferrals} of ${referredPatients.length}`} changeLabel="completed" />
        <SummaryCard icon={<Calendar className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-50" label="Avg. Processing" value={`${kpis.avgWaitTimeDays} ${kpis.avgWaitTimeDays !== 1 ? 'days' : 'day'}`} change={kpis.avgWaitTimeDays > 0 ? 'registration to completion' : 'no data yet'} changeLabel="" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Registration & Referral Trends</h3>
          <div className="h-80">
            {trendData.every((d) => d.registrations === 0 && d.referred === 0 && d.completed === 0)
              ? <EmptyChart message="No trend data available for selected period" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient>
                      <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                      <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/><stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                    <Legend />
                    <Area type="monotone" dataKey="registrations" name="New Registrations" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorReg)" />
                    <Area type="monotone" dataKey="referred" name="Referred" stroke="#f59e0b" fillOpacity={1} fill="url(#colorRef)" />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="#14b8a6" fillOpacity={1} fill="url(#colorComp)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Common Conditions</h3>
          <div className="h-72">
            {conditionData.length === 0
              ? <EmptyChart message="No diagnosis data available" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={conditionData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {conditionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [`${value} cases`, name]} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Demographics by Age & Gender</h3>
          <div className="h-72">
            {genderAgeData.every((d) => d.male === 0 && d.female === 0)
              ? <EmptyChart message="No demographic data available" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={genderAgeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="ageGroup" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="male" name="Male" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="female" name="Female" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>
      </div>

      {/* Available Reports */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Ministry of Health Reports</h3>
          <span className="text-xs text-gray-400">{kpis.totalPatients} records in database</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: 'Patient Registration', desc: 'Full demographics, facility, CHP, MoH DHIS2 format', icon: Users, type: 'patients', count: patients.length },
            { name: 'Referral Pipeline', desc: 'From → To facility, CHP, urgency, status tracking', icon: Activity, type: 'referrals', count: patients.reduce((s, p) => s + (p.referralStages?.length || 0), 0) },
            { name: 'Collector Performance', desc: 'Per-collector: registrations, referrals, completion rate', icon: TrendingUp, type: 'collectors', count: collectorStats.length },
            { name: 'CHP Assignment', desc: 'Per-CHP: patients assigned, cases, supervisor', icon: UserCheck, type: 'chps', count: chps.length },
            { name: 'Facility Activity', desc: 'Per-facility: patients, referrals, demographics', icon: Building2, type: 'facilities', count: new Set(patients.map((p) => p.address?.city).filter(Boolean)).size },
            { name: 'Medical Conditions', desc: 'Condition prevalence for disease surveillance', icon: HeartPulse, type: 'conditions', count: kpis.topConditions.length },
            { name: 'Monthly Statistics', desc: 'JSON export with trends, demographics, KPIs', icon: Calendar, type: 'monthly', count: trendData.length },
          ].map((report) => (
            <button
              key={report.type}
              onClick={() => handleExport(report.type)}
              disabled={exporting === report.type}
              className="group flex items-start gap-3 text-left rounded-lg border border-gray-200 px-4 py-3 hover:border-teal-300 hover:shadow-sm transition-all disabled:opacity-60"
            >
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center group-hover:bg-teal-100 transition-colors shrink-0">
                {exporting === report.type ? <Loader2 className="w-4 h-4 text-teal-600 animate-spin" /> : <report.icon className="w-4 h-4 text-teal-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{report.name}</p>
                <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{report.desc}</p>
                <p className="text-[10px] text-gray-300 mt-1">{report.count} records</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors shrink-0 self-center" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */
function SummaryCard({ icon, iconBg, label, value, change, changeLabel }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>{icon}</div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-xs font-semibold text-gray-400">{change}</span>
        {changeLabel && <span className="text-xs text-gray-400">{changeLabel}</span>}
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
      <ArrowDown className="w-8 h-8 mb-2 opacity-40" />
      <p className="text-sm text-center max-w-xs leading-relaxed">{message}</p>
    </div>
  );
}
