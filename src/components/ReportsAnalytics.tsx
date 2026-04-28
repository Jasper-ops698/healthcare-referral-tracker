import { useState, useMemo, useCallback } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useFormatDate } from '@/i18n/dateFormat';
import { useDashboard } from '@/hooks/useDashboard';
import { usePatients, useUsers } from '@/hooks/useData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  Download, Calendar, FileText, TrendingUp, Users, Activity,
  Loader2, ArrowDown, Stethoscope, Building2,
  ChevronRight,
} from 'lucide-react';
import { format, subMonths, startOfMonth, isAfter, isSameDay, addMonths, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

/* ── Date helpers ── */
function toDate(d: Date | string | undefined): Date | null {
  if (!d) return null;
  try {
    const p = new Date(d);
    return isNaN(p.getTime()) ? null : p;
  } catch { return null; }
}

/* ── Export helpers ── */
function downloadJSON(filename: string, data: unknown): boolean {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    return true;
  } catch {
    return false;
  }
}

function downloadCSV(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) {
    return false;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = r[h];
        const s = v === null || v === undefined ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  return true;
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

/* ── Percentage change, signed ── */
function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${Math.round(change)}%`;
}

/* ── Age group from years ── */
function getAgeGroup(ageYears: number): string {
  if (ageYears < 18) return '0-18';
  if (ageYears < 36) return '19-35';
  if (ageYears < 51) return '36-50';
  if (ageYears < 66) return '51-65';
  return '65+';
}

/* ═══════════════════════════ Reports & Analytics ═══════════════════════════ */

export default function ReportsAnalytics() {
  const { t } = useI18n();
  const formatDate = useFormatDate();
  const { kpis, isLoading } = useDashboard();
  const { patients } = usePatients();
  const { users } = useUsers();
  const [dateRange, setDateRange] = useState<Period>('6months');
  const [exporting, setExporting] = useState<string | null>(null);

  const periodStart = getPeriodStart(dateRange);
  const now = new Date();

  // ── Patients registered within the selected period ──
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && (isAfter(d, periodStart) || isSameDay(d, periodStart));
    });
  }, [patients, periodStart]);

  // ── Previous-period patients ──
  const prevPeriodPatients = useMemo(() => {
    const periodLength = now.getTime() - periodStart.getTime();
    const prevStart = new Date(periodStart.getTime() - periodLength);
    return patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && d >= prevStart && d < periodStart;
    });
  }, [patients, periodStart]);

  // ── Patients who entered the referral pipeline ──
  const referredPatients = useMemo(() => {
    return patients.filter((p) =>
      ['referred', 'accepted', 'in-treatment', 'completed', 'rejected'].includes(p.referralStatus)
    );
  }, [patients]);

  // ── Completion rate ──
  const completionRate = useMemo(() => {
    const pipeline = referredPatients.length;
    if (pipeline === 0) return 0;
    return Math.round((kpis.completedReferrals / pipeline) * 100);
  }, [kpis.completedReferrals, referredPatients.length]);

  // ── Period-over-period change ──
  const totalChange = pctChange(filteredPatients.length, prevPeriodPatients.length);

  // ── Trend data ──
  const trendData = useMemo(() => {
    const monthCount = dateRange === '1year' ? 12 : dateRange === '6months' ? 6 : dateRange === '3months' ? 3 : 1;
    return Array.from({ length: monthCount }, (_, i) => {
      const monthDate = subMonths(now, monthCount - 1 - i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = startOfMonth(addMonths(monthDate, 1));
      const monthLabel = formatDate(monthDate, 'short').split(' ')[1] || format(monthDate, 'MMM');

      const registrations = patients.filter((p) => {
        const d = toDate(p.registrationDate);
        return d && d >= monthStart && d < monthEnd;
      }).length;

      const referrals = patients.filter((p) => {
        const d = toDate(p.registrationDate);
        return d && d >= monthStart && d < monthEnd &&
          ['referred', 'accepted', 'in-treatment', 'completed', 'rejected'].includes(p.referralStatus);
      }).length;

      const completions = patients.filter((p) => {
        const d = toDate(p.registrationDate);
        return d && d >= monthStart && d < monthEnd && p.referralStatus === 'completed';
      }).length;

      return { month: monthLabel, registrations, referrals, completions };
    });
  }, [patients, dateRange, formatDate]);

  // ── Top conditions ──
  const conditionData = useMemo(() => {
    const colors = ['#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#10b981'];
    return kpis.topConditions.map((c, i) => ({
      name: c.condition,
      value: c.count,
      color: colors[i % colors.length],
    }));
  }, [kpis.topConditions]);

  // ── Demographics by age & gender ──
  const genderAgeData = useMemo(() => {
    const groups = ['0-18', '19-35', '36-50', '51-65', '65+'];
    return groups.map((ageGroup) => ({
      ageGroup,
      male: patients.filter((p) => {
        if (!p.dateOfBirth || p.gender !== 'male') return false;
        const age = differenceInDays(new Date(), new Date(p.dateOfBirth)) / 365.25;
        return getAgeGroup(age) === ageGroup;
      }).length,
      female: patients.filter((p) => {
        if (!p.dateOfBirth || p.gender !== 'female') return false;
        const age = differenceInDays(new Date(), new Date(p.dateOfBirth)) / 365.25;
        return getAgeGroup(age) === ageGroup;
      }).length,
    }));
  }, [patients]);

  // ── Per-collector breakdown ──
  const collectorStats = useMemo(() => {
    const stats = new Map<string, { name: string; patients: number; referrals: number; completed: number }>();
    patients.forEach((p) => {
      const collector = users.find((u) => u.id === p.registeredBy);
      const name = collector ? `${collector.firstName} ${collector.lastName}` : 'Unknown';
      const existing = stats.get(p.registeredBy) || { name, patients: 0, referrals: 0, completed: 0 };
      existing.patients++;
      if (['referred', 'accepted', 'in-treatment', 'completed', 'rejected'].includes(p.referralStatus)) {
        existing.referrals++;
      }
      if (p.referralStatus === 'completed') {
        existing.completed++;
      }
      stats.set(p.registeredBy, existing);
    });
    return Array.from(stats.entries()).map(([, data]) => data);
  }, [patients, users]);

  // ── Export handlers ──
  const handleExport = useCallback((type: string) => {
    setExporting(type);
    try {
      switch (type) {
        case 'patients': {
          const rows = patients.map((p) => ({
            [t('export.patientId')]: p.patientId,
            [t('export.firstName')]: p.firstName,
            [t('export.lastName')]: p.lastName,
            [t('export.gender')]: p.gender,
            [t('export.phone')]: p.phone,
            [t('export.status')]: p.status,
            [t('export.referralStatus')]: p.referralStatus,
            [t('export.registeredDate')]: p.registrationDate ? format(new Date(p.registrationDate), 'yyyy-MM-dd') : '',
            [t('export.city')]: p.address?.city || '',
          }));
          const ok = downloadCSV('patient-registration-report.csv', rows);
          if (ok) {
            toast.success(t('reports.exportSuccess') || 'Patient registration report exported');
          } else {
            toast.error(t('common.noData'));
          }
          break;
        }
        case 'referrals': {
          const rows = patients
            .filter((p) => p.referralStatus !== 'registered')
            .map((p) => ({
              [t('export.patientId')]: p.patientId,
              [t('export.name')]: `${p.firstName} ${p.lastName}`,
              [t('export.referralStatus')]: p.referralStatus,
              [t('export.currentStatus')]: p.status,
              [t('export.city')]: p.address?.city || '',
            }));
          const ok = downloadCSV('referral-status-report.csv', rows);
          if (ok) {
            toast.success(t('reports.exportReferralSuccess') || 'Referral status report exported');
          } else {
            toast.error(t('common.noData'));
          }
          break;
        }
        case 'collectors': {
          const rows = collectorStats.map((c) => ({
            [t('export.collectorName')]: c.name,
            [t('export.patientsRegistered')]: c.patients,
            [t('export.referralsInitiated')]: c.referrals,
            [t('export.referralsCompleted')]: c.completed,
            [t('export.completionRate')]: c.referrals > 0 ? `${Math.round((c.completed / c.referrals) * 100)}%` : 'N/A',
          }));
          const ok = downloadCSV('collector-performance-report.csv', rows);
          if (ok) {
            toast.success(t('reports.exportCollectorSuccess') || 'Collector performance report exported');
          } else {
            toast.error(t('common.noData'));
          }
          break;
        }
        case 'monthly': {
          const ok = downloadJSON('monthly-statistics-report.json', {
            monthly: kpis.referralsByMonth,
            period: dateRange,
            generatedAt: new Date().toISOString(),
            summary: {
              totalPatients: kpis.totalPatients,
              newThisPeriod: filteredPatients.length,
              newToday: kpis.newPatientsToday,
              newThisWeek: kpis.newPatientsThisWeek,
              newThisMonth: kpis.newPatientsThisMonth,
            },
          });
          if (ok) {
            toast.success(t('reports.exportMonthlySuccess') || 'Monthly statistics report exported');
          } else {
            toast.error(t('common.noData'));
          }
          break;
        }
        case 'conditions': {
          const totalDiagnosed = kpis.topConditions.reduce((sum, c) => sum + c.count, 0) || 1;
          const rows = kpis.topConditions.map((c) => ({
            [t('export.condition')]: c.condition,
            [t('export.caseCount')]: c.count,
            [t('export.percentageDiagnosed')]: `${Math.round((c.count / totalDiagnosed) * 100)}%`,
          }));
          const ok = downloadCSV('condition-prevalence-report.csv', rows);
          if (ok) {
            toast.success(t('reports.exportConditionSuccess') || 'Condition prevalence report exported');
          } else {
            toast.error(t('common.noData'));
          }
          break;
        }
        case 'facilities': {
          const cityCounts = new Map<string, number>();
          patients.forEach((p) => {
            const city = p.address?.city?.trim() || 'Unknown';
            cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
          });
          const total = patients.length || 1;
          const rows = Array.from(cityCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([city, count]) => ({
              [t('export.city')]: city,
              [t('export.patientCount')]: count,
              [t('export.percentage')]: `${Math.round((count / total) * 100)}%`,
            }));
          const ok = downloadCSV('facility-utilization-report.csv', rows);
          if (ok) {
            toast.success(t('reports.exportFacilitySuccess') || 'Facility utilization report exported');
          } else {
            toast.error(t('common.noData'));
          }
          break;
        }
        default:
          toast.info(t('common.comingSoon') || 'Coming soon');
      }
      setExporting(null);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error(t('common.exportFailed') || 'Export failed. Please try again.');
      setExporting(null);
    }
  }, [patients, kpis, dateRange, filteredPatients.length, collectorStats, t]);

  const handleBulkExport = useCallback(() => {
    setExporting('bulk');
    try {
      const report = {
        generatedAt: new Date().toISOString(),
        period: dateRange,
        summary: {
          totalPatients: kpis.totalPatients,
          newPatientsThisPeriod: filteredPatients.length,
          newPatientsToday: kpis.newPatientsToday,
          newPatientsThisWeek: kpis.newPatientsThisWeek,
          newPatientsThisMonth: kpis.newPatientsThisMonth,
          referredPatients: referredPatients.length,
          activeReferrals: kpis.activeReferrals,
          pendingReferrals: kpis.pendingReferrals,
          completedReferrals: kpis.completedReferrals,
          rejectedReferrals: kpis.rejectedReferrals,
          completionRate: `${completionRate}%`,
          avgProcessingDays: kpis.avgWaitTimeDays,
          rejectionRate: `${kpis.rejectionRate}%`,
        },
        demographics: {
          byGender: kpis.patientsByGender,
          byAgeGroup: kpis.patientsByAgeGroup,
        },
        referralsByStatus: kpis.referralsByStatus,
        monthlyTrend: trendData,
        topConditions: kpis.topConditions,
        collectorPerformance: collectorStats,
        recentActivity: kpis.recentActivity.slice(0, 20),
      };
      const ok = downloadJSON(`healthtrack-analytics-${format(new Date(), 'yyyy-MM-dd')}.json`, report);
      if (ok) {
        toast.success(t('reports.exportAllSuccess') || 'Full analytics report exported');
      } else {
        toast.error(t('common.noData'));
      }
      setExporting(null);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error(t('common.exportFailed') || 'Export failed. Please try again.');
      setExporting(null);
    }
  }, [kpis, trendData, dateRange, completionRate, filteredPatients.length, referredPatients.length, collectorStats, t]);

  // ── Subtitle with correct pluralization ──
  const subtitleText = kpis.totalPatients === 1
    ? t('reports.subtitle_one', { count: String(kpis.totalPatients) })
    : t('reports.subtitle_other', { count: String(kpis.totalPatients) });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('reports.title')}</h1>
          <p className="text-gray-500 mt-1">{subtitleText}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as Period)}
            className="px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm text-gray-700"
          >
            <option value="30days">{t('reports.period.30days')}</option>
            <option value="3months">{t('reports.period.3months')}</option>
            <option value="6months">{t('reports.period.6months')}</option>
            <option value="1year">{t('reports.period.1year')}</option>
          </select>
          <button
            onClick={handleBulkExport}
            disabled={exporting === 'bulk'}
            className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {exporting === 'bulk' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t('reports.exportAll')}
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Users className="w-5 h-5 text-teal-600" />}
          iconBg="bg-teal-50"
          label={t('reports.totalPatients')}
          value={kpis.totalPatients.toLocaleString()}
          change={totalChange}
          changeLabel={t('reports.vsPreviousPeriod')}
        />
        <SummaryCard
          icon={<Activity className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label={t('reports.activeReferrals')}
          value={kpis.activeReferrals.toLocaleString()}
          change={`${kpis.pendingReferrals} ${t('reports.awaitingAction')}`}
          changeLabel=""
        />
        <SummaryCard
          icon={<FileText className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50"
          label={t('reports.completionRate')}
          value={`${completionRate}%`}
          change={`${kpis.completedReferrals} ${t('reports.referredOf', { count: String(referredPatients.length) })}`}
          changeLabel={t('reports.patientsCompleted')}
        />
        <SummaryCard
          icon={<Calendar className="w-5 h-5 text-purple-600" />}
          iconBg="bg-purple-50"
          label={t('reports.avgProcessing')}
          value={`${kpis.avgWaitTimeDays} ${kpis.avgWaitTimeDays !== 1 ? t('reports.days') : t('reports.day')}`}
          change={kpis.avgWaitTimeDays > 0 ? t('reports.registrationToCompletion') : t('reports.noCompletedYet')}
          changeLabel=""
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient Flow Trends */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('reports.patientFlowTrends')}</h3>
          <div className="h-80">
            {trendData.every((d) => d.registrations === 0 && d.referrals === 0 && d.completions === 0) ? (
              <EmptyChart message={t('reports.noTrendData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRef" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [value, '']}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="registrations" name={t('reports.newRegistrations')} stroke="#0ea5e9" fillOpacity={1} fill="url(#colorReg)" />
                  <Area type="monotone" dataKey="referrals" name={t('reports.referralsMade')} stroke="#f59e0b" fillOpacity={1} fill="url(#colorRef)" />
                  <Area type="monotone" dataKey="completions" name={t('reports.completions')} stroke="#14b8a6" fillOpacity={1} fill="url(#colorComp)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Most Common Conditions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('reports.mostCommonConditions')}</h3>
          <div className="h-72">
            {conditionData.length === 0 ? (
              <EmptyChart message={t('reports.noDiagnosisData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={conditionData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                    {conditionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value} ${t('reports.cases')}`, name]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Demographics by Age & Gender */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('reports.demographics')}</h3>
          <div className="h-72">
            {genderAgeData.every((d) => d.male === 0 && d.female === 0) ? (
              <EmptyChart message={t('reports.noDemographicData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={genderAgeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="ageGroup" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend />
                  <Bar dataKey="male" name={t('common.male')} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="female" name={t('common.female')} fill="#ec4899" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Available Reports ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('reports.availableReports')}</h3>
          <span className="text-xs text-gray-400">
            {kpis.totalPatients > 0 ? `${kpis.totalPatients} ${t('reports.records')}` : t('common.noData')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: t('reports.patientRegistrations'), icon: Users, type: 'patients', count: patients.length },
            { name: t('reports.referralStatus'), icon: Activity, type: 'referrals', count: referredPatients.length },
            { name: t('reports.collectorPerformance'), icon: TrendingUp, type: 'collectors', count: collectorStats.length },
            { name: t('reports.monthlyStatistics'), icon: Calendar, type: 'monthly', count: kpis.referralsByMonth.length },
            { name: t('reports.conditionPrevalence'), icon: Stethoscope, type: 'conditions', count: kpis.topConditions.length },
            { name: t('reports.facilityUtilization'), icon: Building2, type: 'facilities', count: new Set(patients.map((p) => p.address?.city).filter(Boolean)).size },
          ].map((report) => (
            <button
              key={report.type}
              onClick={() => handleExport(report.type)}
              disabled={exporting === report.type}
              className="group flex items-center gap-3 text-left rounded-lg border border-gray-200 px-4 py-3 hover:border-teal-300 hover:shadow-sm transition-all disabled:opacity-60"
              title={`${t('common.export')} ${report.name} — ${report.count.toLocaleString()} ${t('reports.records')}`}
            >
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center group-hover:bg-teal-100 transition-colors shrink-0">
                {exporting === report.type ? (
                  <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
                ) : (
                  <report.icon className="w-4 h-4 text-teal-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{report.name}</p>
                <p className="text-xs text-gray-400">{report.count.toLocaleString()} {t('reports.records')}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Sub-components ═══════════════════════════ */

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
  change,
  changeLabel,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  change: string;
  changeLabel: string;
}) {
  const isPositive = change.startsWith('+');
  const isNeutral = !isPositive && !change.startsWith('-');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`text-xs font-semibold ${isNeutral ? 'text-gray-400' : isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {change}
        </span>
        {changeLabel && (
          <span className="text-xs text-gray-400">{changeLabel}</span>
        )}
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
