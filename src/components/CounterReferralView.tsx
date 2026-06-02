/**
 * CounterReferralView v4 — Collector-Driven Workflow
 *
 * The collector independently manages the entire counter-referral process:
 *   1. Needs Attention → Patient arrived, collector receives them
 *   2. In Care → Collector is providing treatment
 *   3. Completed → Counter-referral done, CHP assigned for follow-up
 *
 * Admin monitors via dashboard/reports only — no admin-controlled stages.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/useI18n';
import {
  ClipboardList, Search, CheckCircle, Clock, AlertTriangle,
  ArrowLeft, Stethoscope, User, MapPin, Ambulance, Send,
  RefreshCw, ChevronRight, Sparkles, HeartPulse,
  Calendar, ArrowDownLeft, ArrowUpRight,
  Loader2, FileText, TrendingUp, PackageCheck, Phone,
} from 'lucide-react';
import {
  getIncomingReferrals, getOutgoingReferrals, acceptReferralV2,
  updateReferralV2Status, createCounterReferral,
  getChpAlertJourney,
} from '@/lib/apiClient';
import type { ReferralV2, RecoveryStatus } from '@/types';

interface Props { stationId: string; stationName: string; collectorId: string; collectorName: string; }
type ViewMode = 'list' | 'detail';
type ActionFilter = 'all' | 'needs-attention' | 'in-care' | 'completed';
type DirFilter = 'all' | 'incoming' | 'outgoing';

/** Collector-centric status labels — not admin pipeline */
const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string; icon: typeof Clock }> = {
  pending: { label: 'Needs Attention', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', icon: AlertTriangle },
  'in-transit': { label: 'Needs Attention', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', icon: AlertTriangle },
  accepted: { label: 'In Care', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-300', icon: Stethoscope },
  'in-treatment': { label: 'In Care', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-300', icon: Stethoscope },
  'counter-referral-created': { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', icon: CheckCircle },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', icon: CheckCircle },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: AlertTriangle },
};

const URGENCY_META = {
  emergency: { bg: 'bg-red-500', label: 'Emergency' },
  urgent: { bg: 'bg-amber-500', label: 'Urgent' },
  routine: { bg: 'bg-blue-400', label: 'Routine' },
};

const RECOVERY_OPTS: { value: RecoveryStatus; label: string; color: string; bg: string }[] = [
  { value: 'fully-recovered', label: 'Fully Recovered', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300' },
  { value: 'partially-recovered', label: 'Partially Recovered', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300' },
  { value: 'still-unwell', label: 'Still Unwell', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },
  { value: 'deceased', label: 'Deceased', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-300' },
  { value: 'lost-to-follow-up', label: 'Lost to Follow-up', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-300' },
];

/** Map raw status to collector action bucket */
function toBucket(status: string): 'needs-attention' | 'in-care' | 'completed' {
  if (status === 'pending' || status === 'in-transit') return 'needs-attention';
  if (status === 'accepted' || status === 'in-treatment') return 'in-care';
  return 'completed';
}

export default function CounterReferralView({ stationId, stationName, collectorId, collectorName }: Props) {
  const { t } = useI18n();
  const [incoming, setIncoming] = useState<ReferralV2[]>([]);
  const [outgoing, setOutgoing] = useState<ReferralV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [dirFilter, setDirFilter] = useState<DirFilter>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<ReferralV2 | null>(null);
  const [selectedDir, setSelectedDir] = useState<'incoming' | 'outgoing'>('incoming');
  const [showForm, setShowForm] = useState(false);
  const [submittedReferralIds, setSubmittedReferralIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Phase C: Previous journey state for follow-up referrals
  const [previousJourney, setPreviousJourney] = useState<any>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  // Form state
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [medications, setMedications] = useState('');
  const [procedures, setProcedures] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('still-unwell');
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [warningSigns, setWarningSigns] = useState('');
  const [chpName, setChpName] = useState('');
  const [chpPhone, setChpPhone] = useState('');

  useEffect(() => { loadData(); }, [stationId, stationName, collectorId]);

  const loadData = async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [iRes, oRes] = await Promise.all([
        getIncomingReferrals(stationId, undefined, stationName),
        getOutgoingReferrals(stationId),
      ]);
      // Map MongoDB _id to frontend id field
      const mapId = (r: any): ReferralV2 => ({ ...r, id: r.id || r._id?.toString() || r._id });
      if (iRes.success) setIncoming((((iRes.data as any)?.referrals || []) as any[]).map(mapId));
      if (oRes.success) setOutgoing((((oRes.data as any)?.referrals || []) as any[]).map(mapId));
    } catch (e) { console.error('Load referrals failed:', e); }
    finally { setLoading(false); }
  };

  /** Receive patient — marks as accepted, collector now owns the case */
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const handleReceive = async (id: string) => {
    if (!id || id === 'undefined') {
      toast.error(t('counterReferral.invalidId'));
      return;
    }
    setReceivingId(id);
    try {
      const res = await acceptReferralV2(id);
      if (res.success) {
        toast.success(t('counterReferral.careStarted'), {
          description: 'Fill the counter-referral form now, or close it and come back later.',
        });
        await loadData();
        // Auto-open the counter-referral form so collector can immediately
        // fill in diagnosis, treatment, and CHP details
        setShowForm(true);
      } else {
        toast.error((res as any).error?.message || t('counterReferral.receiveFailed'));
      }
    } catch (e: any) {
      toast.error(e.message || t('counterReferral.networkError'));
    } finally {
      setReceivingId(null);
    }
  };

  const openDetail = (r: ReferralV2, dir: 'incoming' | 'outgoing') => {
    setSelected(r); setSelectedDir(dir); setView('detail'); setShowForm(false);
    setChpName(r.chpName || ''); setChpPhone(r.chpPhone || '');
    setPreviousJourney(null);

    // Phase C: Fetch previous journey for follow-up referrals
    if (r.referralType === 'follow-up' && (r as any).previousReferralId) {
      setJourneyLoading(true);
      getChpAlertJourney((r as any).chpAlertId || (r as any).previousReferralId)
        .then(res => {
          if (res.success && res.data) {
            setPreviousJourney((res.data as any).journey);
          }
        })
        .catch(() => {})
        .finally(() => setJourneyLoading(false));
    }
  };

  const submitCounter = async () => {
    if (!finalDiagnosis || !treatment || !followUp || !chpName || !selected) {
      toast.error(t('counterReferral.fillRequired'));
      return;
    }
    const refId = selected.id || (selected as any)._id;
    if (!refId) {
      toast.error(t('counterReferral.invalidReferral'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        referralId: refId, patientId: selected.patientId, patientName: selected.patientName,
        stationId, stationName, collectorId, collectorName,
        finalDiagnosis, treatmentProvided: treatment,
        medicationsGiven: medications || undefined, proceduresDone: procedures || undefined,
        recoveryStatus, nextVisitDate: nextVisitDate ? new Date(nextVisitDate) : undefined,
        followUpInstructions: followUp, warningSigns: warningSigns || undefined,
        chpName, chpPhone: chpPhone || undefined,
      };
      const cRes = await createCounterReferral(payload);
      if (!cRes.success) {
        const statusCode = (cRes as any).error?.statusCode || (cRes as any).status;
        const errMsg = (cRes as any).error?.message || JSON.stringify((cRes as any).error) || 'Failed to create counter-referral';
        // 409 = duplicate key — counter-referral already exists
        if (statusCode === 409 || errMsg.includes('already been submitted')) {
          toast.error('Counter-referral already submitted for this patient.', {
            description: 'This form has already been completed.',
          });
        } else {
          toast.error(errMsg);
        }
        console.error('[CounterReferral] API error:', cRes);
        setSubmitting(false);
        return;
      }
      const cData = cRes.data as any;
      if (chpPhone && !cData?.smsSent) {
        toast.warning(
          `SMS failed: ${cData?.smsError || t('counterReferral.smsConfigMissing')}. ${t('counterReferral.contactChpManually')}`,
          { duration: 8000 }
        );
      }
      const sRes = await updateReferralV2Status(refId, 'counter-referral-created');
      if (sRes.success) {
        const toastMsg = cData?.smsSent
          ? t('counterReferral.chpSmsNotified')
          : t('counterReferral.counterCreated');
        toast.success(toastMsg);
        // Mark as submitted so button stays disabled
        setSubmittedReferralIds(prev => new Set(prev).add(refId));
        setShowForm(false);
        // Clear form state
        setFinalDiagnosis(''); setTreatment(''); setMedications(''); setProcedures('');
        setFollowUp(''); setWarningSigns(''); setChpName(''); setChpPhone('');
        await loadData();
      } else {
        toast.error((sRes as any).error?.message || t('counterReferral.statusFailed'));
      }
    } catch (e: any) {
      console.error('[CounterReferral] Exception:', e);
      toast.error(e.message || t('counterReferral.networkError'));
    } finally { setSubmitting(false); }
  };

  // Merge and filter
  const allReferrals: (ReferralV2 & { _dir: 'incoming' | 'outgoing' })[] = [
    ...incoming.map(r => ({ ...r, _dir: 'incoming' as const })),
    ...outgoing.map(r => ({ ...r, _dir: 'outgoing' as const })),
  ];

  const filtered = allReferrals.filter(r => {
    if (dirFilter !== 'all' && r._dir !== dirFilter) return false;
    if (actionFilter !== 'all' && toBucket(r.status) !== actionFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.patientName.toLowerCase().includes(q) || r.patientId.toLowerCase().includes(q);
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Stats — collector action buckets (count across both incoming + outgoing)
  const allCaseReferrals = [...incoming, ...outgoing];
  const needsAttention = allCaseReferrals.filter(r => toBucket(r.status) === 'needs-attention').length;
  const inCare = allCaseReferrals.filter(r => toBucket(r.status) === 'in-care').length;
  const completed = allCaseReferrals.filter(r => toBucket(r.status) === 'completed').length;

  const stats = [
    { label: 'Needs Attention', value: needsAttention, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', desc: 'Patients to receive' },
    { label: 'In Care', value: inCare, icon: Stethoscope, color: 'text-sky-600', bg: 'bg-sky-50', desc: 'Currently treating' },
    { label: 'Completed', value: completed, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', desc: 'Counter-referrals done' },
    { label: 'My Referrals', value: outgoing.length, icon: ArrowUpRight, color: 'text-purple-600', bg: 'bg-purple-50', desc: 'Sent by me' },
    { label: 'Emergency', value: allReferrals.filter(r => r.urgency === 'emergency').length, icon: HeartPulse, color: 'text-red-600', bg: 'bg-red-50', desc: 'Urgent cases' },
  ];

  // ─── LIST VIEW ───
  if (view === 'list') {
    return (
      <div className="space-y-5 w-full">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />Counter-Referral
          </h2>
          <p className="text-sm text-muted-foreground">Manage referrals at {stationName} — receive, treat, and send back</p>
        </div>

        {/* Collector Action Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {stats.map(({ label, value, icon: I, color, bg, desc }) => (
            <button
              key={label}
              onClick={() => {
                if (label === 'Needs Attention') setActionFilter('needs-attention');
                else if (label === 'In Care') setActionFilter('in-care');
                else if (label === 'Completed') setActionFilter('completed');
                else setActionFilter('all');
              }}
              className={`bg-card rounded-xl p-3 border text-left transition-all hover:shadow-sm ${
                (label === 'Needs Attention' && actionFilter === 'needs-attention') ||
                (label === 'In Care' && actionFilter === 'in-care') ||
                (label === 'Completed' && actionFilter === 'completed')
                  ? 'border-primary ring-1 ring-primary'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                  <I className={`w-4 h-4 ${color}`} />
                </div>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>

        {/* Search & Direction Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('counterReferral.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border text-sm bg-background"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'incoming', 'outgoing'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDirFilter(d)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  dirFilter === d ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
                }`}
              >
                {d === 'all' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Action filter chips — collector-centric, not admin pipeline */}
        <div className="flex gap-2 flex-wrap">
          {([
            { k: 'all', label: 'All Cases' },
            { k: 'needs-attention', label: 'Needs Attention' },
            { k: 'in-care', label: 'In Care' },
            { k: 'completed', label: 'Completed' },
          ] as const).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setActionFilter(k)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                actionFilter === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Referral List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No referrals found</p>
            <p className="text-xs mt-1">{actionFilter !== 'all' ? 'Try a different filter' : 'Referrals will appear here'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => {
              const s = STATUS_META[r.status] || STATUS_META.pending;
              const u = URGENCY_META[r.urgency];
              const isIncoming = r._dir === 'incoming';
              const bucket = toBucket(r.status);
              return (
                <button
                  key={`${r._dir}-${r.id}`}
                  onClick={() => openDetail(r, r._dir)}
                  className="w-full bg-card rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {/* Direction badge */}
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {isIncoming ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {isIncoming ? 'Incoming' : 'My Referral'}
                        </span>
                        {/* Urgency */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${u.bg}`}>{u.label}</span>
                        {/* Collector action bucket */}
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${s.bg} ${s.text} ${s.border} border`}>
                          <s.icon className="w-3 h-3" />{s.label}
                        </span>
                        {/* Quick action hint */}
                        {isIncoming && bucket === 'needs-attention' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium animate-pulse">
                            Tap to receive
                          </span>
                        )}
                        {isIncoming && bucket === 'in-care' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">
                            Tap to complete
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-sm">
                        {r.patientName}
                        <span className="text-muted-foreground font-normal font-mono text-xs ml-1">({r.patientId})</span>
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {isIncoming ? `From: ${r.sourceStationName}` : `To: ${r.destinationStationName}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Ambulance className="w-3 h-3" />{r.modeOfTransport}
                        </span>
                        {r.chpName && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <User className="w-3 h-3" />CHP: {r.chpName}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-2 line-clamp-2 text-amber-700 bg-amber-50 px-2 py-1 rounded">{r.initialDiagnosis}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  if (!selected) return null;
  const s = STATUS_META[selected.status] || STATUS_META.pending;
  const u = URGENCY_META[selected.urgency];
  const isIncoming = selectedDir === 'incoming';
  const bucket = toBucket(selected.status);

  return (
    <div className="space-y-5 w-full">
      <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" />Back to all referrals
      </button>

      {/* Patient Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold ${
                isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {isIncoming ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                {isIncoming ? 'Incoming' : 'My Referral'}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${u.bg}`}>{u.label}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${s.bg} ${s.text} ${s.border} border`}>
                <s.icon className="w-3 h-3" />{s.label}
              </span>
            </div>
            <h2 className="text-xl font-bold">{selected.patientName}</h2>
            <p className="text-sm text-muted-foreground font-mono">
              {selected.patientId} &middot; {selected.patientAge}y &middot; {selected.patientGender}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{isIncoming ? 'Referred to' : 'Sent from'}</p>
            <p className="text-sm font-medium">{stationName}</p>
          </div>
        </div>
      </div>

      {/* Journey */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">{t('counterReferral.patientJourney')}</h3>
        </div>
        <div className="p-5 space-y-4">
          <JStep icon={MapPin} color="bg-blue-500" label={t('counterReferral.origin')} station={selected.sourceStationName} collector={selected.sourceCollectorName} />
          <div className="flex items-center gap-3 pl-3">
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{selected.modeOfTransport} &middot; {selected.urgency}</span>
          </div>
          <JStep icon={Stethoscope} color="bg-emerald-500" label={t('counterReferral.destination')} station={selected.destinationStationName} isCurrent />
        </div>
      </div>

      {/* Phase C: Follow-up badge */}
      {selected.referralType === 'follow-up' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Follow-up Referral</p>
            <p className="text-xs text-amber-600">
              Patient returning for continued care. Previous treatment and CHP observations are available below.
            </p>
          </div>
        </div>
      )}

      {/* Phase C: Previous Patient Journey (for follow-ups) */}
      {selected.referralType === 'follow-up' && (previousJourney || journeyLoading) && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-blue-50/50 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold">Previous Patient Journey</h3>
          </div>
          <div className="p-5">
            {journeyLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : previousJourney?.timeline ? (
              <div className="space-y-3">
                {previousJourney.timeline.map((event: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      event.stage === 'chp-response' ? 'bg-red-500' :
                      event.stage === 'counter-referral' ? 'bg-emerald-500' :
                      'bg-blue-400'
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.description}</p>
                      {event.details?.chpSymptomsObserved && (
                        <p className="text-xs text-red-600 mt-1">
                          <strong>CHP observed:</strong> {event.details.chpSymptomsObserved}
                        </p>
                      )}
                      {event.details?.chpNeedsMedicalAttention && (
                        <p className="text-xs text-red-600 font-medium">⚠ Needs medical attention</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Previous journey data not available</p>
            )}
          </div>
        </div>
      )}

      {/* Context */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold">Referral Context</h3>
        </div>
        <div className="p-5 space-y-4">
          {selected.aiSuggestedCategory && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-amber-800">AI Classification</span>
              </div>
              <p className="text-sm font-semibold text-amber-700">{selected.aiSuggestedCategory}</p>
              <p className="text-xs text-amber-600">{Math.round((selected.aiConfidence || 0) * 100)}% confidence</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Initial Diagnosis</p>
            <p className="text-sm">{selected.initialDiagnosis}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reason for Referral</p>
            <p className="text-sm">{selected.reasonForReferral}</p>
          </div>
          {selected.chpName && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-xs font-semibold text-blue-800 mb-1">Assigned CHP</p>
              <p className="text-sm text-blue-700">{selected.chpName} {selected.chpPhone && `· ${selected.chpPhone}`}</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── COLLECTOR ACTIONS ─── */}
      {isIncoming && bucket === 'needs-attention' && (
        <button
          onClick={() => handleReceive(selected.id || (selected as any)._id)}
          disabled={receivingId === (selected.id || (selected as any)._id)}
          className="w-full px-6 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {receivingId === (selected.id || (selected as any)._id) ? (
            <><Loader2 className="w-5 h-5 animate-spin" />Receiving...</>
          ) : (
            <><PackageCheck className="w-5 h-5" />Receive Patient — Start Care</>
          )}
        </button>
      )}

      {isIncoming && bucket === 'in-care' && !showForm && (
        <div className="space-y-3">
          <button
            onClick={() => {
              if (!submittedReferralIds.has(selected.id || (selected as any)._id)) {
                setShowForm(true);
              }
            }}
            disabled={submittedReferralIds.has(selected.id || (selected as any)._id)}
            className="w-full px-6 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ClipboardList className="w-5 h-5" />
            {submittedReferralIds.has(selected.id || (selected as any)._id)
              ? 'Counter-Referral Submitted'
              : 'Complete & Create Counter-Referral'}
          </button>
          <p className="text-xs text-muted-foreground text-center">
            {submittedReferralIds.has(selected.id || (selected as any)._id)
              ? 'This counter-referral has already been submitted.'
              : 'Record final diagnosis, treatment provided, and assign a CHP for follow-up.'}
          </p>
        </div>
      )}

      {/* Counter-Referral Form */}
      {showForm && (
        <div className="bg-card rounded-xl border border-primary/30 overflow-hidden">
          <div className="px-5 py-3 border-b border-primary/20 bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">Counter-Referral Form</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              {t('common.cancel') || 'Cancel'}
            </button>
          </div>
          <div className="p-5 space-y-4">
            <F label={`${t('counterReferral.finalDiagnosis')} *`} value={finalDiagnosis} onChange={setFinalDiagnosis} rows={2} placeholder="e.g., Confirmed malaria with mild anemia" />
            <F label={`${t('counterReferral.treatmentProvided')} *`} value={treatment} onChange={setTreatment} rows={2} placeholder="e.g., Artemether-Lumefantrine course, IV fluids" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label={t('counterReferral.medications')} value={medications} onChange={setMedications} rows={2} placeholder="List medications with dosages" />
              <F label={t('counterReferral.procedures')} value={procedures} onChange={setProcedures} rows={2} placeholder="e.g., RDT, hemoglobin test" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Recovery Status *</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {RECOVERY_OPTS.map(({ value, label, color, bg }) => (
                  <button
                    key={value}
                    onClick={() => setRecoveryStatus(value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs font-semibold transition-all ${
                      recoveryStatus === value ? bg : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <HeartPulse className={`w-5 h-5 ${color}`} />{label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wide">
                <Calendar className="w-3 h-3" />Next Visit Date
              </label>
              <input
                type="date"
                value={nextVisitDate}
                onChange={e => setNextVisitDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background"
              />
            </div>

            <F label={`${t('counterReferral.followUpInstructions')} *`} value={followUp} onChange={setFollowUp} rows={3} placeholder="Instructions for CHP and patient" />
            <F label={t('counterReferral.warningSigns')} value={warningSigns} onChange={setWarningSigns} rows={2} placeholder="Signs requiring immediate re-referral" cls="border-red-200 bg-red-50/30" />

            {/* CHP Assignment */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 space-y-3">
              <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1">
                <User className="w-3 h-3" />CHP for Follow-up
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-blue-700 mb-1 block">Name *</label>
                  <input
                    type="text"
                    required
                    value={chpName}
                    onChange={e => setChpName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background"
                    placeholder={t('counterReferral.chpNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-xs text-blue-700 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" />Phone <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-1">SMS</span>
                  </label>
                  <input
                    type="tel"
                    value={chpPhone}
                    onChange={e => setChpPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background"
                    placeholder={t('counterReferral.chpPhonePlaceholder')}
                    title={t('counterReferral.notifyViaSms')}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={submitCounter}
              disabled={submitting || !finalDiagnosis || !treatment || !followUp || !chpName}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Send className="w-4 h-4" />Send Counter-Referral & SMS CHP</>}
            </button>
          </div>
        </div>
      )}

      {/* Completed state */}
      {isIncoming && bucket === 'completed' && (
        <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Counter-referral completed</p>
            <p className="text-xs text-emerald-600">This patient has been sent back with CHP follow-up assigned.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function JStep({ icon: Icon, color, label, station, collector, isCurrent }: { icon: typeof MapPin; color: string; label: string; station: string; collector?: string; isCurrent?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center shrink-0 ${isCurrent ? 'ring-4 ring-emerald-100' : ''}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-sm font-semibold ${isCurrent ? 'text-emerald-700' : ''}`}>{station}</p>
        {collector && <p className="text-xs text-muted-foreground">by {collector}</p>}
      </div>
    </div>
  );
}

function F({ label, value, onChange, rows = 2, placeholder, cls = '' }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; cls?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary ${cls}`}
        placeholder={placeholder}
      />
    </div>
  );
}
