import { useState, useMemo, useCallback } from 'react';
import type { DashboardKPIs, ReferralStatus, Patient, User as UserType, MedicalRecord } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { useStatusConfig } from '@/i18n/statusLabels';
import {
  ArrowRight, Search, User, Clock, AlertTriangle,
  MapPin, Stethoscope, UserCheck, Download,
  Loader2, TrendingUp, Building2, Activity,
  ChevronRight, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

interface ReferralTrackingProps {
  kpis: DashboardKPIs;
  patients: Patient[];
  users: UserType[];
  getRecordsByPatient: (patientId: string) => MedicalRecord[];
  onUpdatePatient: (id: string, updates: Partial<Patient>) => Promise<Patient | null>;
}

const statusFlow: ReferralStatus[] = ['registered', 'screened', 'referred', 'accepted', 'in-treatment', 'completed'];

/* ═══════════════════════════ Referral Tracking ═══════════════════════════ */

export default function ReferralTracking({
  kpis,
  patients,
  users,
  getRecordsByPatient,
  onUpdatePatient,
}: ReferralTrackingProps) {
  const { t } = useI18n();
  const statusConfig = useStatusConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'overdue'>('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [changingStatusFor, setChangingStatusFor] = useState<string | null>(null);

  /* ── Referral patients (in pipeline) ── */
  const referralPatients = useMemo(() => {
    return patients.filter((p) =>
      ['screened', 'referred', 'accepted', 'in-treatment', 'completed', 'rejected'].includes(p.referralStatus)
    );
  }, [patients]);

  /* ── Search & filter ── */
  const filtered = useMemo(() => {
    let result = referralPatients.filter((p) => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const matchesSearch =
        name.includes(searchQuery.toLowerCase()) ||
        p.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone.includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || p.referralStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });

    if (sortBy === 'newest') {
      result = result.sort((a, b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime());
    } else if (sortBy === 'oldest') {
      result = result.sort((a, b) => new Date(a.registrationDate).getTime() - new Date(b.registrationDate).getTime());
    } else if (sortBy === 'overdue') {
      result = result.sort((a, b) => daysInStage(b) - daysInStage(a));
    }
    return result;
  }, [referralPatients, searchQuery, statusFilter, sortBy]);

  /* ── Decision metrics ── */
  const metrics = useMemo(() => {
    const total = referralPatients.length;
    const active = referralPatients.filter((p) =>
      ['screened', 'referred', 'accepted', 'in-treatment'].includes(p.referralStatus)
    ).length;

    const overdue = referralPatients.filter((p) => {
      const days = daysInStage(p);
      return ['screened', 'referred', 'accepted'].includes(p.referralStatus) && days > 14;
    }).length;

    const avgDays = total > 0
      ? Math.round(
          referralPatients.reduce((sum, p) => sum + daysInStage(p), 0) / total
        )
      : 0;

    // Facility breakdown (originating city)
    const facilityCounts = new Map<string, number>();
    referralPatients.forEach((p) => {
      const city = p.address?.city?.trim() || t('common.unknown');
      facilityCounts.set(city, (facilityCounts.get(city) || 0) + 1);
    });
    const topFacility = Array.from(facilityCounts.entries()).sort((a, b) => b[1] - a[1])[0];

    // Collector breakdown
    const collectorCounts = new Map<string, { name: string; count: number }>();
    referralPatients.forEach((p) => {
      const collector = users.find((u) => u.id === p.registeredBy);
      const name = collector ? `${collector.firstName} ${collector.lastName}` : t('common.unknown');
      const existing = collectorCounts.get(p.registeredBy);
      if (existing) existing.count++;
      else collectorCounts.set(p.registeredBy, { name, count: 1 });
    });
    const topCollector = Array.from(collectorCounts.entries()).sort((a, b) => b[1].count - a[1].count)[0];

    // Stage bottleneck (most patients stuck)
    const stageCounts: Record<string, number> = {};
    referralPatients.forEach((p) => {
      stageCounts[p.referralStatus] = (stageCounts[p.referralStatus] || 0) + 1;
    });
    const bottleneck = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      total, active, overdue, avgDays,
      topFacility: topFacility ? { name: topFacility[0], count: topFacility[1] } : null,
      topCollector: topCollector ? { name: topCollector[1].name, count: topCollector[1].count } : null,
      bottleneck: bottleneck ? { stage: bottleneck[0], count: bottleneck[1] } : null,
    };
  }, [referralPatients, users]);

  /* ── Helpers ── */
  function daysInStage(p: Patient): number {
    return Math.max(0, differenceInDays(new Date(), new Date(p.lastUpdated)));
  }

  function getCollectorName(registeredBy: string): string {
    const u = users.find((x) => x.id === registeredBy);
    return u ? `${u.firstName} ${u.lastName}` : t('common.unknown');
  }

  function getLatestRecord(patientId: string): MedicalRecord | undefined {
    const recs = getRecordsByPatient(patientId);
    return recs.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];
  }

  function getNextStatus(current: ReferralStatus): ReferralStatus | null {
    const idx = statusFlow.indexOf(current);
    if (idx >= 0 && idx < statusFlow.length - 1) return statusFlow[idx + 1];
    return null;
  }

  function getPrevStatus(current: ReferralStatus): ReferralStatus | null {
    const idx = statusFlow.indexOf(current);
    if (idx > 0) return statusFlow[idx - 1];
    return null;
  }

  const handleStatusChange = useCallback(async (patient: Patient, newStatus: ReferralStatus) => {
    setChangingStatusFor(patient.id);
    const updated = await onUpdatePatient(patient.id, { referralStatus: newStatus, lastUpdated: new Date() });
    if (updated) {
      toast.success(`${patient.firstName} ${patient.lastName} → ${statusConfig[newStatus].label}`);
      setChangingStatusFor(null);
    } else {
      toast.error(t('toast.statusUpdateFailed'));
      setChangingStatusFor(null);
    }
  }, [onUpdatePatient]);

  const handleExport = useCallback(() => {
    setExporting(true);
    try {
      const rows = filtered.map((p) => ({
        [t('export.patientId')]: p.patientId,
        [t('export.name')]: `${p.firstName} ${p.lastName}`,
        [t('export.phone')]: p.phone,
        [t('export.referralStatus')]: p.referralStatus,
        [t('export.daysInStage')]: daysInStage(p),
        [t('export.city')]: p.address?.city || '',
        [t('export.collector')]: getCollectorName(p.registeredBy),
        [t('export.registered')]: format(new Date(p.registrationDate), 'yyyy-MM-dd'),
        [t('export.lastUpdated')]: format(new Date(p.lastUpdated), 'yyyy-MM-dd'),
      }));
      if (rows.length === 0) {
        toast.error(t('toast.noReferralsToExport'));
        setExporting(false);
        return;
      }
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(','),
        ...rows.map((r) =>
          headers.map((h) => {
            const s = String(r[h as keyof typeof r] ?? '');
            return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(',')
        ),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `referral-pipeline-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast.success(t('toast.referralPipelineExported'));
    } catch {
      toast.error(t('toast.exportFailed'));
    }
    setExporting(false);
  }, [filtered]);

  /* ═══════════════════════════ Render ═══════════════════════════ */

  return (
    <div className="space-y-6 animate-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('referrals.title')}</h1>
          <p className="text-gray-500 mt-1">
            {metrics.total <= 1
              ? t('referrals.subtitle_one', { count: String(metrics.total) })
              : t('referrals.subtitle_other', { count: String(metrics.total) })}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || metrics.total === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {t('referrals.export')}
        </button>
      </div>

      {/* ── Decision Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={<Activity className="w-4 h-4 text-sky-600" />}
          iconBg="bg-sky-50"
          value={metrics.active.toLocaleString()}
          label={t('referrals.active')}
          change={`${metrics.overdue} ${t('referrals.overdue').toLowerCase()}`}
          changeColor={metrics.overdue > 0 ? 'text-rose-600' : 'text-gray-400'}
        />
        <MetricCard
          icon={<Clock className="w-4 h-4 text-amber-600" />}
          iconBg="bg-amber-50"
          value={`${metrics.avgDays}${t('common.daysSuffix')}`}
          label={t('referrals.avgWait')}
          change={metrics.avgDays > 14 ? t('referrals.aboveTarget') : t('referrals.withinTarget')}
          changeColor={metrics.avgDays > 14 ? 'text-amber-600' : 'text-emerald-600'}
        />
        <MetricCard
          icon={<Building2 className="w-4 h-4 text-purple-600" />}
          iconBg="bg-purple-50"
          value={metrics.topFacility?.name ?? '—'}
          label={t('referrals.topFacility')}
          change={`${metrics.topFacility?.count ?? 0} ${t('referrals.patients')}`}
          changeColor="text-gray-400"
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-50"
          value={metrics.bottleneck ? statusConfig[metrics.bottleneck.stage as ReferralStatus]?.label ?? metrics.bottleneck.stage : '—'}
          label={t('referrals.bottleneck')}
          change={`${metrics.bottleneck?.count ?? 0} ${t('referrals.stuck')}`}
          changeColor="text-gray-400"
        />
      </div>

      {/* ── Status Filter Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {(['registered', 'screened', 'referred', 'accepted', 'in-treatment', 'completed', 'rejected'] as ReferralStatus[]).map((status) => {
          const cfg = statusConfig[status];
          const count = kpis.referralsByStatus[status] ?? 0;
          const selected = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(selected ? 'all' : status)}
              className={`p-3 rounded-xl border-2 transition-all text-left ${
                selected
                  ? `${cfg.bg} ${cfg.border} shadow-sm`
                  : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
            >
              <p className={`text-xl font-bold ${selected ? cfg.text : 'text-gray-700'}`}>{count}</p>
              <p className={`text-xs mt-0.5 ${selected ? 'text-gray-600' : 'text-gray-400'}`}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Filters & Sort ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('referrals.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm text-gray-700"
        >
          <option value="newest">{t('referrals.newest')}</option>
          <option value="oldest">{t('referrals.oldest')}</option>
          <option value="overdue">{t('referrals.overdue')}</option>
        </select>
      </div>

      {/* ── Referral List ── */}
      <div className="space-y-3">
        {filtered.map((patient) => {
          const cfg = statusConfig[patient.referralStatus];
          const days = daysInStage(patient);
          const isOverdue = ['screened', 'referred', 'accepted'].includes(patient.referralStatus) && days > 14;
          const latestRecord = getLatestRecord(patient.id);
          const collector = getCollectorName(patient.registeredBy);
          const expanded = expandedId === patient.id;
          const next = getNextStatus(patient.referralStatus);
          const prev = getPrevStatus(patient.referralStatus);

          return (
            <div
              key={patient.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                isOverdue ? 'border-rose-200' : 'border-gray-200'
              }`}
            >
              {/* Main row */}
              <div
                className="p-4 sm:p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : patient.id)}
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Patient block */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{patient.firstName} {patient.lastName}</p>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 uppercase tracking-wide">
                            <AlertTriangle className="w-3 h-3" />
                            {days}{t('common.daysSuffix')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span>{patient.patientId}</span>
                        <span>·</span>
                        <span>{patient.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Facility + Diagnosis */}
                  <div className="flex-1 min-w-0 lg:max-w-xs">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{patient.address?.city || t('referrals.unknownLocation')}</span>
                    </div>
                    {latestRecord?.preliminaryDiagnosis && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                        <Stethoscope className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{latestRecord.preliminaryDiagnosis}</span>
                      </div>
                    )}
                    {!latestRecord?.preliminaryDiagnosis && latestRecord?.chiefComplaint && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                        <Stethoscope className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{latestRecord.chiefComplaint}</span>
                      </div>
                    )}
                  </div>

                  {/* Collector + Time */}
                  <div className="flex items-center gap-6 lg:justify-end">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <UserCheck className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs text-gray-500">{collector}</span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className={`text-xs font-medium ${isOverdue ? 'text-rose-600' : 'text-gray-500'}`}>
                          {days}{t('common.daysSuffix')} in {cfg.label.toLowerCase()}
                        </span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border} shrink-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>

                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {/* Mini progress bar */}
                <div className="mt-3">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${((statusFlow.indexOf(patient.referralStatus) + 1) / statusFlow.length) * 100}%`,
                        backgroundColor: patient.referralStatus === 'rejected' ? '#f43f5e' : '#0ea5e9',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Expanded detail panel */}
              {expanded && (
                <div className="border-t border-gray-100 px-4 sm:px-5 py-4 bg-gray-50/50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('referrals.fullAddress')}</label>
                      <p className="text-sm text-gray-700 mt-1">
                        {patient.address?.street ? `${patient.address.street}, ` : ''}
                        {patient.address?.city || t('referrals.unknownLocation')}
                        {patient.address?.state ? `, ${patient.address.state}` : ''}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('referrals.chiefComplaint')}</label>
                      <p className="text-sm text-gray-700 mt-1">{latestRecord?.chiefComplaint || t('referrals.noRecords')}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('referrals.preliminaryDiagnosis')}</label>
                      <p className="text-sm text-gray-700 mt-1">{latestRecord?.preliminaryDiagnosis || t('referrals.noDiagnosis')}</p>
                    </div>
                  </div>

                  {/* Status change actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider mr-1">{t('referrals.moveTo')}</span>
                    {prev && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStatusChange(patient, prev); }}
                        disabled={changingStatusFor === patient.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <ArrowDownRight className="w-3 h-3" />
                        {statusConfig[prev].label}
                      </button>
                    )}
                    {next && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStatusChange(patient, next); }}
                        disabled={changingStatusFor === patient.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        {changingStatusFor === patient.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        {statusConfig[next].label}
                      </button>
                    )}
                    {patient.referralStatus !== 'rejected' && patient.referralStatus !== 'completed' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStatusChange(patient, 'rejected'); }}
                        disabled={changingStatusFor === patient.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-medium text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50 ml-auto sm:ml-0"
                      >
                        <Minus className="w-3 h-3" />
                        {t('referrals.reject')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <ArrowRight className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">{t('referrals.noMatch')}</p>
            <p className="text-gray-400 text-sm mt-1">{t('referrals.adjustFilters')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════ Sub-components ═══════════════════════════ */

function MetricCard({
  icon,
  iconBg,
  value,
  label,
  change,
  changeColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
  change: string;
  changeColor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
      <p className={`text-xs mt-0.5 ${changeColor}`}>{change}</p>
    </div>
  );
}
