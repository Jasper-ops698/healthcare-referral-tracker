import { useMemo } from 'react';
import type { DashboardKPIs, Patient, User } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { useFormatDate } from '@/i18n/dateFormat';
import type { TranslationKey } from '@/i18n/translations';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  Users, Activity, Calendar, CheckCircle2, Clock, TrendingUp,
  MapPin, UserCheck, AlertTriangle,
  ChevronRight, Shield, BarChart3,
} from 'lucide-react';
import { differenceInDays, differenceInYears, subMonths, startOfMonth } from 'date-fns';

interface DashboardOverviewProps {
  kpis: DashboardKPIs;
  patients: Patient[];
  users: User[];
}

function toDate(d: Date | string | undefined): Date | null {
  if (!d) return null;
  try { const p = new Date(d); return isNaN(p.getTime()) ? null : p; } catch { return null; }
}

function getAgeGroup(ageYears: number): string {
  if (ageYears < 18) return '0-18';
  if (ageYears < 36) return '19-35';
  if (ageYears < 51) return '36-50';
  if (ageYears < 66) return '51-65';
  return '65+';
}

/* ═══════════════════════════ Dashboard Overview ═══════════════════════════ */

function translateActivityDescription(description: string, t: (key: TranslationKey, vars?: Record<string, string>) => string): string {
  const [key, ...rest] = description.split('|');
  const value = rest.join('|');
  if (key === 'patient_registered') return `${t('activity.registeredPatient')} ${value}`;
  if (key === 'record_created') {
    if (value === '_unknown_') return `${t('activity.medicalRecordFor')} ${t('activity.unknownPatient')}`;
    return `${t('activity.medicalRecordFor')} ${value}`;
  }
  return description;
}

export default function DashboardOverview({ kpis, patients, users }: DashboardOverviewProps) {
  const { t } = useI18n();
  const formatDate = useFormatDate();
  const now = new Date();

  /* ── Real monthly registration data (last 12 months) ── */
  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthDate = subMonths(now, 11 - i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = startOfMonth(subMonths(monthDate, -1));
      const monthLabel = formatDate(monthDate, 'short').split(' ')[1] || monthDate.toLocaleDateString('en', { month: 'short' });
      const registrations = patients.filter((p) => {
        const d = toDate(p.registrationDate);
        return d && d >= monthStart && d < monthEnd;
      }).length;
      return { month: monthLabel, registrations };
    });
  }, [patients, now, formatDate]);

  /* ── Real age groups from patient DOBs ── */
  const ageGroupData = useMemo(() => {
    const groups: Record<string, number> = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };
    patients.forEach((p) => {
      if (!p.dateOfBirth) return;
      const age = differenceInYears(now, new Date(p.dateOfBirth));
      const g = getAgeGroup(age);
      groups[g] = (groups[g] || 0) + 1;
    });
    return Object.entries(groups).map(([group, count]) => ({ group, count }));
  }, [patients, now]);

  /* ── Real gender distribution ── */
  const genderData = useMemo(() => {
    const male = patients.filter((p) => p.gender === 'male').length;
    const female = patients.filter((p) => p.gender === 'female').length;
    const other = patients.filter((p) => p.gender === 'other').length;
    return [
      { name: t('common.male'), value: male, color: '#0ea5e9' },
      { name: t('common.female'), value: female, color: '#ec4899' },
      { name: t('gender.other'), value: other, color: '#94a3b8' },
    ].filter((d) => d.value > 0);
  }, [patients, t]);

  /* ── Real referral status breakdown ── */
  const referralStatusData = useMemo(() => {
    return [
      { name: t('status.registeredShort'), value: kpis.referralsByStatus.registered, color: '#94a3b8' },
      { name: t('status.screenedShort'), value: kpis.referralsByStatus.screened, color: '#0ea5e9' },
      { name: t('status.pipeline'), value: kpis.activeReferrals, color: '#f59e0b' },
      { name: t('status.completedShort'), value: kpis.completedReferrals, color: '#14b8a6' },
      { name: t('status.rejectedShort'), value: kpis.referralsByStatus.rejected, color: '#f43f5e' },
    ].filter((d) => d.value > 0);
  }, [kpis, t]);

  /* ── Real period-over-period changes ── */
  const periodChanges = useMemo(() => {
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const twoMonthsAgo = startOfMonth(subMonths(now, 2));

    const lastMonthCount = patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && d >= lastMonthStart && d < thisMonthStart;
    }).length;
    const twoMonthsCount = patients.filter((p) => {
      const d = toDate(p.registrationDate);
      return d && d >= twoMonthsAgo && d < lastMonthStart;
    }).length;

    const totalChange = lastMonthCount > 0
      ? Math.round(((patients.length - lastMonthCount) / lastMonthCount) * 100)
      : 0;
    const todayChange = kpis.newPatientsToday > 0 ? 100 : 0;
    const activeChange = twoMonthsCount > 0
      ? Math.round(((kpis.activeReferrals - twoMonthsCount) / twoMonthsCount) * 100)
      : 0;
    const completedChange = lastMonthCount > 0
      ? Math.round(((kpis.completedReferrals - lastMonthCount) / lastMonthCount) * 100)
      : 0;

    return { totalChange, todayChange, activeChange, completedChange };
  }, [patients, kpis, now]);

  /* ── Collector leaderboard ── */
  const collectorLeaderboard = useMemo(() => {
    const stats = new Map<string, { name: string; patients: number; referrals: number }>();
    patients.forEach((p) => {
      const collector = users.find((u) => u.id === p.registeredBy);
      const name = collector ? `${collector.firstName} ${collector.lastName}` : t('common.unknown');
      const existing = stats.get(p.registeredBy);
      if (existing) {
        existing.patients++;
        if (['referred', 'accepted', 'in-treatment', 'completed'].includes(p.referralStatus)) {
          existing.referrals++;
        }
      } else {
        stats.set(p.registeredBy, {
          name,
          patients: 1,
          referrals: ['referred', 'accepted', 'in-treatment', 'completed'].includes(p.referralStatus) ? 1 : 0,
        });
      }
    });
    return Array.from(stats.values())
      .sort((a, b) => b.patients - a.patients)
      .slice(0, 5);
  }, [patients, users, t]);

  /* ── Facility breakdown (top cities) ── */
  const facilityBreakdown = useMemo(() => {
    const cities = new Map<string, number>();
    patients.forEach((p) => {
      const city = p.address?.city?.trim() || t('common.unknown');
      cities.set(city, (cities.get(city) || 0) + 1);
    });
    return Array.from(cities.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([city, count]) => ({ city, count }));
  }, [patients, t]);

  /* ── Overdue referrals ── */
  const overdueReferrals = useMemo(() => {
    return patients
      .filter((p) => ['screened', 'referred', 'accepted'].includes(p.referralStatus))
      .map((p) => ({ ...p, days: Math.max(0, differenceInDays(now, new Date(p.lastUpdated))) }))
      .filter((p) => p.days > 14)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  }, [patients, now]);

  const totalWithDiagnosis = kpis.topConditions.reduce((sum, c) => sum + c.count, 0) || 1;

  return (
    <div className="space-y-6 animate-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-500 mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <span className="text-sm text-gray-400">{formatDate(now, 'long')}</span>
      </div>

      {/* ── Primary KPI Cards (real data + real changes) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users className="w-5 h-5 text-sky-600" />}
          iconBg="bg-sky-50"
          label={t('dashboard.totalPatients')}
          value={kpis.totalPatients.toLocaleString()}
          change={periodChanges.totalChange}
          changeLabel={t('dashboard.vsLastMonth')}
        />
        <KpiCard
          icon={<Calendar className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label={t('dashboard.newToday')}
          value={kpis.newPatientsToday.toString()}
          change={periodChanges.todayChange}
          changeLabel={t('dashboard.newRegistrations')}
        />
        <KpiCard
          icon={<Activity className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50"
          label={t('dashboard.activeReferrals')}
          value={kpis.activeReferrals.toLocaleString()}
          change={periodChanges.activeChange}
          changeLabel={t('dashboard.vsPreviousPeriod')}
        />
        <KpiCard
          icon={<CheckCircle2 className="w-5 h-5 text-teal-600" />}
          iconBg="bg-teal-50"
          label={t('dashboard.completed')}
          value={kpis.completedReferrals.toLocaleString()}
          change={periodChanges.completedChange}
          changeLabel={t('dashboard.vsLastMonth')}
        />
      </div>

      {/* ── Secondary KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi icon={<Clock className="w-4 h-4 text-orange-500" />} label={t('dashboard.avgWaitTime')} value={`${kpis.avgWaitTimeDays}${t('common.daysSuffix')}`} />
        <MiniKpi icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} label={t('dashboard.overdue')} value={`${overdueReferrals.length}`} />
        <MiniKpi icon={<TrendingUp className="w-4 h-4 text-purple-500" />} label={t('dashboard.pendingScreenings')} value={`${kpis.pendingScreenings}`} />
        <MiniKpi icon={<Shield className="w-4 h-4 text-slate-500" />} label={t('dashboard.rejectionRate')} value={`${kpis.rejectionRate}%`} />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Registrations */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.monthlyRegistrations')}</h3>
          <div className="h-72">
            {monthlyData.every((d) => d.registrations === 0) ? (
              <EmptyState message={t('dashboard.empty.noRegistration')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="registrations" stroke="#0ea5e9" strokeWidth={2} fill="url(#regGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gender Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.genderDistribution')}</h3>
          <div className="h-72">
            {genderData.length === 0 || genderData.every((d) => d.value === 0) ? (
              <EmptyState message={t('dashboard.empty.noGender')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={genderData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                    {genderData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value} ${t('common.patients')}`, name]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Age Groups + Referral Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.ageGroups')}</h3>
          <div className="h-64">
            {ageGroupData.every((d) => d.count === 0) ? (
              <EmptyState message={t('dashboard.empty.noAge')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageGroupData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="group" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.referralStatus')}</h3>
          <div className="h-64">
            {referralStatusData.length === 0 ? (
              <EmptyState message={t('dashboard.empty.noReferral')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={referralStatusData} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="value">
                    {referralStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value} ${t('common.patients')}`, name]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Top Conditions + Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.topConditions')}</h3>
          {kpis.topConditions.length === 0 ? (
            <EmptyState message={t('dashboard.empty.noCondition')} />
          ) : (
            <div className="space-y-4">
              {kpis.topConditions.map((condition, index) => (
                <div key={condition.condition} className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-full bg-sky-50 text-sky-700 text-sm font-bold flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{condition.condition}</span>
                      <span className="text-sm text-gray-500 ml-2 shrink-0">{condition.count} {t('common.cases')} ({Math.round((condition.count / totalWithDiagnosis) * 100)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-500"
                        style={{ width: `${(condition.count / (kpis.topConditions[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.recentActivity')}</h3>
          {kpis.recentActivity.length === 0 ? (
            <EmptyState message={t('dashboard.empty.noActivity')} />
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {kpis.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50/60 hover:bg-gray-50 transition-colors">
                  <div className="w-2 h-2 mt-2 rounded-full bg-sky-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{translateActivityDescription(activity.description, t)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('activity.by')} {activity.userName === '_system_' ? t('activity.system') : activity.userName} · {formatDate(activity.timestamp, 'withTime')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Collector Leaderboard + Facility Breakdown + Overdue ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collector Leaderboard */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.topCollectors')}</h3>
          </div>
          {collectorLeaderboard.length === 0 ? (
            <EmptyState message={t('dashboard.empty.noCollector')} />
          ) : (
            <div className="space-y-3">
              {collectorLeaderboard.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.referrals} {t('common.referrals')}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{c.patients}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Facility Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.topFacilities')}</h3>
          </div>
          {facilityBreakdown.length === 0 ? (
            <EmptyState message={t('dashboard.empty.noFacility')} />
          ) : (
            <div className="space-y-3">
              {facilityBreakdown.map((f) => (
                <div key={f.city} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                    <Building className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{f.city}</p>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${(f.count / (facilityBreakdown[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{f.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Referrals */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.overdueReferrals')}</h3>
          </div>
          {overdueReferrals.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{t('dashboard.noOverdue')}</p>
          ) : (
            <div className="space-y-3">
              {overdueReferrals.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-rose-50/50 border border-rose-100">
                  <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.firstName} {p.lastName}</p>
                    <p className="text-xs text-gray-500 capitalize">{p.referralStatus} · {p.phone}</p>
                  </div>
                  <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-1 rounded-full shrink-0">
                    {p.days}{t('common.daysSuffix')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.quickActions')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t('dashboard.addPatient'), icon: Users, color: 'sky', desc: t('dashboard.desc.addPatient') },
            { label: t('dashboard.viewReferrals'), icon: Activity, color: 'amber', desc: t('dashboard.desc.viewReferrals') },
            { label: t('dashboard.reports'), icon: BarChart3, color: 'emerald', desc: t('dashboard.desc.reports') },
            { label: t('dashboard.userManagement'), icon: UserCheck, color: 'purple', desc: t('dashboard.desc.userManagement') },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => {
                const navItems: Record<string, string> = {
                  [t('dashboard.addPatient')]: 'patients',
                  [t('dashboard.viewReferrals')]: 'referrals',
                  [t('dashboard.reports')]: 'reports',
                  [t('dashboard.userManagement')]: 'users',
                };
                const target = navItems[action.label];
                if (target) {
                  const event = new CustomEvent('navigateToTab', { detail: target });
                  window.dispatchEvent(event);
                }
              }}
              className={`group flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-${action.color}-300 hover:shadow-md hover:bg-${action.color}-50/50 transition-all text-left`}
            >
              <div className={`w-10 h-10 rounded-lg bg-${action.color}-50 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <action.icon className={`w-5 h-5 text-${action.color}-600`} />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{action.label}</p>
                <p className="text-xs text-gray-400">{action.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 ml-auto transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Sub-components ═══════════════════════════ */

function KpiCard({ icon, iconBg, label, value, change, changeLabel }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string;
  change: number; changeLabel: string;
}) {
  const isPositive = change >= 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {isPositive ? '+' : ''}{change}%
        </span>
        <span className="text-xs text-gray-400">{changeLabel}</span>
      </div>
    </div>
  );
}

function MiniKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
      <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
      <p className="text-sm text-center max-w-xs">{message}</p>
    </div>
  );
}

function Building(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" /><path d="M16 6h.01" />
      <path d="M8 10h.01" /><path d="M16 10h.01" />
      <path d="M8 14h.01" /><path d="M16 14h.01" />
    </svg>
  );
}
