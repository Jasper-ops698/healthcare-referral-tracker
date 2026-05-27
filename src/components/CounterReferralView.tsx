/**
 * CounterReferralView v3 — Shows ALL referrals (incoming + outgoing)
 *
 * Issue fixed: Previously only showed incoming. Now shows:
 *   - Incoming: patients referred TO the collector's station
 *   - Outgoing: patients the collector referred FROM their station
 *   - Clear direction badge on each card
 */

import { useState, useEffect } from 'react';
import {
  ClipboardList, Search, CheckCircle, Clock, AlertTriangle,
  ArrowLeft, Stethoscope, User, MapPin, Ambulance, Send,
  RefreshCw, ChevronRight, Sparkles, HeartPulse,
  Calendar, Mail, ArrowDownLeft, ArrowUpRight,
  Loader2, FileText, TrendingUp,
} from 'lucide-react';
import {
  getIncomingReferrals, getOutgoingReferrals, acceptReferralV2,
  updateReferralV2Status, createCounterReferral,
} from '@/lib/apiClient';
import type { ReferralV2, RecoveryStatus } from '@/types';

interface Props { stationId: string; stationName: string; collectorId: string; collectorName: string; }
type ViewMode = 'list' | 'detail';
type StatusFilter = 'all' | 'pending' | 'in-transit' | 'accepted' | 'in-treatment';
type DirFilter = 'all' | 'incoming' | 'outgoing';

const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', icon: Clock },
  'in-transit': { label: 'In Transit', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', icon: Ambulance },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', icon: CheckCircle },
  'in-treatment': { label: 'In Treatment', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', icon: Stethoscope },
  'counter-referral-created': { label: 'Counter-Ref', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', icon: ClipboardList },
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

export default function CounterReferralView({ stationId, stationName, collectorId, collectorName }: Props) {
  const [incoming, setIncoming] = useState<ReferralV2[]>([]);
  const [outgoing, setOutgoing] = useState<ReferralV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dirFilter, setDirFilter] = useState<DirFilter>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<ReferralV2 | null>(null);
  const [selectedDir, setSelectedDir] = useState<'incoming' | 'outgoing'>('incoming');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
  const [chpEmail, setChpEmail] = useState('');

  useEffect(() => { loadData(); }, [stationId, collectorId]);

  const loadData = async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [iRes, oRes] = await Promise.all([
        getIncomingReferrals(stationId),
        getOutgoingReferrals(stationId),
      ]);
      if (iRes.success) setIncoming(((iRes.data as any)?.referrals || []) as ReferralV2[]);
      if (oRes.success) setOutgoing(((oRes.data as any)?.referrals || []) as ReferralV2[]);
    } catch (e) { console.error('Load referrals failed:', e); }
    finally { setLoading(false); }
  };

  const handleAccept = async (id: string) => {
    try { await acceptReferralV2(id); await loadData(); } catch (e) { console.error('Accept failed:', e); }
  };

  const openDetail = (r: ReferralV2, dir: 'incoming' | 'outgoing') => {
    setSelected(r); setSelectedDir(dir); setView('detail'); setShowForm(false);
    setChpName(r.chpName || ''); setChpPhone(r.chpPhone || ''); setChpEmail(r.chpEmail || '');
  };

  const submitCounter = async () => {
    if (!finalDiagnosis || !treatment || !followUp || !chpName || !selected) return;
    setSubmitting(true);
    try {
      await createCounterReferral({
        referralId: selected.id, patientId: selected.patientId, patientName: selected.patientName,
        stationId, stationName, collectorId, collectorName,
        finalDiagnosis: finalDiagnosis, treatmentProvided: treatment,
        medicationsGiven: medications || undefined, proceduresDone: procedures || undefined,
        recoveryStatus, nextVisitDate: nextVisitDate ? new Date(nextVisitDate) : undefined,
        followUpInstructions: followUp, warningSigns: warningSigns || undefined,
        chpName, chpPhone: chpPhone || undefined, chpEmail: chpEmail || undefined,
      });
      await updateReferralV2Status(selected.id, 'counter-referral-created');
      setShowForm(false); await loadData();
    } catch (e) { console.error('Counter-referral failed:', e); }
    finally { setSubmitting(false); }
  };

  // Merge and filter
  const allReferrals: (ReferralV2 & { _dir: 'incoming' | 'outgoing' })[] = [
    ...incoming.map(r => ({ ...r, _dir: 'incoming' as const })),
    ...outgoing.map(r => ({ ...r, _dir: 'outgoing' as const })),
  ];

  const filtered = allReferrals.filter(r => {
    if (dirFilter !== 'all' && r._dir !== dirFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.patientName.toLowerCase().includes(q) || r.patientId.toLowerCase().includes(q);
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Stats
  const stats = {
    total: allReferrals.length,
    incoming: incoming.length,
    outgoing: outgoing.length,
    pending: incoming.filter(r => r.status === 'pending' || r.status === 'in-transit').length,
    active: incoming.filter(r => r.status === 'accepted' || r.status === 'in-treatment').length,
    emergency: allReferrals.filter(r => r.urgency === 'emergency').length,
  };

  // ─── LIST VIEW ───
  if (view === 'list') {
    return (
      <div className="space-y-5">
        <div><h2 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5 text-primary" />Counter-Referral</h2>
          <p className="text-sm text-muted-foreground">All referrals involving {stationName} — incoming and outgoing</p></div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[{l:'Total',v:stats.total,i:ClipboardList,c:'text-primary',b:'bg-primary/10'},{l:'Incoming',v:stats.incoming,i:ArrowDownLeft,c:'text-emerald-600',b:'bg-emerald-50'},{l:'Outgoing',v:stats.outgoing,i:ArrowUpRight,c:'text-sky-600',b:'bg-sky-50'},{l:'Pending',v:stats.pending,i:Clock,c:'text-amber-600',b:'bg-amber-50'},{l:'Emergency',v:stats.emergency,i:AlertTriangle,c:'text-red-600',b:'bg-red-50'}].map(({l,v,i:I,c,b}) => (
            <div key={l} className="bg-card rounded-xl p-3 border border-border"><div className="flex items-center gap-2 mb-1"><div className={`w-7 h-7 rounded-lg ${b} flex items-center justify-center`}><I className={`w-4 h-4 ${c}`} /></div><span className="text-xs text-muted-foreground">{l}</span></div><p className="text-2xl font-bold">{v}</p></div>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by patient name or ID..." className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border text-sm bg-background" /></div>
          <div className="flex gap-2">
            {(['all','incoming','outgoing'] as const).map(d => (
              <button key={d} onClick={() => setDirFilter(d)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${dirFilter === d ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}>{d === 'all' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}</button>
            ))}
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 flex-wrap">
          {(['all','pending','in-transit','accepted','in-treatment'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${statusFilter === s ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>{s === 'all' ? 'All Status' : (STATUS_META[s]?.label || s)}</button>
          ))}
        </div>

        {loading ? <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground"><ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-sm">No referrals found</p></div>
          : <div className="space-y-2">{filtered.map(r => {
            const s = STATUS_META[r.status] || STATUS_META.pending;
            const u = URGENCY_META[r.urgency];
            const isIncoming = r._dir === 'incoming';
            return (
              <button key={`${r._dir}-${r.id}`} onClick={() => openDetail(r, r._dir)} className="w-full bg-card rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all text-left">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {/* Direction badge */}
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                        {isIncoming ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        {isIncoming ? 'Incoming' : 'Outgoing'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${u.bg}`}>{u.label}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${s.bg} ${s.text} ${s.border} border`}><s.icon className="w-3 h-3" />{s.label}</span>
                    </div>
                    <p className="font-semibold text-sm">{r.patientName} <span className="text-muted-foreground font-normal font-mono text-xs">({r.patientId})</span></p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{isIncoming ? `From: ${r.sourceStationName}` : `To: ${r.destinationStationName}`}</span>
                      <span className="flex items-center gap-1"><Ambulance className="w-3 h-3" />{r.modeOfTransport}</span>
                    </div>
                    <p className="text-xs mt-2 line-clamp-2 text-amber-700 bg-amber-50 px-2 py-1 rounded">{r.initialDiagnosis}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-1" />
                </div>
              </button>
            );
          })}</div>}
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  if (!selected) return null;
  const s = STATUS_META[selected.status] || STATUS_META.pending;
  const u = URGENCY_META[selected.urgency];
  const isIncoming = selectedDir === 'incoming';

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" />Back to all referrals</button>

      {/* Direction + Patient Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold ${isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                {isIncoming ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                {isIncoming ? 'Incoming' : 'Outgoing'} Referral
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${u.bg}`}>{u.label}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${s.bg} ${s.text} ${s.border} border`}><s.icon className="w-3 h-3" />{s.label}</span>
            </div>
            <h2 className="text-xl font-bold">{selected.patientName}</h2>
            <p className="text-sm text-muted-foreground font-mono">{selected.patientId} &middot; {selected.patientAge}y &middot; {selected.patientGender}</p>
          </div>
          <div className="text-right"><p className="text-xs text-muted-foreground">{isIncoming ? 'Referred to' : 'Sent from'}</p><p className="text-sm font-medium">{stationName}</p></div>
        </div>
      </div>

      {/* Journey */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold">Referral Journey</h3></div>
        <div className="p-5 space-y-4">
          <JStep icon={MapPin} color="bg-blue-500" label="Origin" station={selected.sourceStationName} collector={selected.sourceCollectorName} />
          <div className="flex items-center gap-3 pl-3"><ChevronRight className="w-4 h-4 text-muted-foreground/40" /><div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground">{selected.modeOfTransport} &middot; {selected.urgency}</span></div>
          <JStep icon={Stethoscope} color="bg-emerald-500" label="Destination" station={selected.destinationStationName} isCurrent />
        </div>
      </div>

      {/* Context */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2"><FileText className="w-4 h-4 text-amber-500" /><h3 className="text-sm font-bold">Referral Context</h3></div>
        <div className="p-5 space-y-4">
          {selected.aiSuggestedCategory && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-amber-500" /><span className="text-xs font-bold text-amber-800">AI Classification</span></div>
              <p className="text-sm font-semibold text-amber-700">{selected.aiSuggestedCategory}</p>
              <p className="text-xs text-amber-600">{Math.round((selected.aiConfidence || 0) * 100)}% confidence</p>
            </div>
          )}
          <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Initial Diagnosis</p><p className="text-sm">{selected.initialDiagnosis}</p></div>
          <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reason for Referral</p><p className="text-sm">{selected.reasonForReferral}</p></div>
        </div>
      </div>

      {/* Actions — only for incoming */}
      {isIncoming && (selected.status === 'pending' || selected.status === 'in-transit') && (
        <button onClick={() => handleAccept(selected.id)} className="w-full px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"><CheckCircle className="w-4 h-4" />Accept Patient</button>
      )}
      {isIncoming && (selected.status === 'accepted' || selected.status === 'in-treatment') && !showForm && (
        <button onClick={() => setShowForm(true)} className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"><ClipboardList className="w-4 h-4" />Create Counter-Referral</button>
      )}

      {/* Counter-Referral Form */}
      {showForm && (
        <div className="bg-card rounded-xl border border-primary/30 overflow-hidden">
          <div className="px-5 py-3 border-b border-primary/20 bg-primary/5 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold">Counter-Referral</h3></div>
          <div className="p-5 space-y-4">
            <F label="Final Diagnosis *" value={finalDiagnosis} onChange={setFinalDiagnosis} rows={2} placeholder="e.g., Confirmed malaria with mild anemia" />
            <F label="Treatment Provided *" value={treatment} onChange={setTreatment} rows={2} placeholder="e.g., Artemether-Lumefantrine course, IV fluids" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Medications" value={medications} onChange={setMedications} rows={2} placeholder="List medications with dosages" />
              <F label="Procedures" value={procedures} onChange={setProcedures} rows={2} placeholder="e.g., RDT, hemoglobin test" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Recovery Status *</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {RECOVERY_OPTS.map(({ value, label, color, bg }) => (
                  <button key={value} onClick={() => setRecoveryStatus(value)} className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs font-semibold transition-all ${recoveryStatus === value ? bg : 'border-border hover:bg-muted/50'}`}><HeartPulse className={`w-5 h-5 ${color}`} />{label}</button>
                ))}
              </div>
            </div>
            <div><label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wide"><Calendar className="w-3 h-3" />Next Visit Date</label>
              <input type="date" value={nextVisitDate} onChange={e => setNextVisitDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" /></div>
            <F label="Follow-up Instructions *" value={followUp} onChange={setFollowUp} rows={3} placeholder="Instructions for CHP and patient" />
            <F label="Warning Signs" value={warningSigns} onChange={setWarningSigns} rows={2} placeholder="Signs requiring immediate re-referral" cls="border-red-200 bg-red-50/30" />

            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 space-y-3">
              <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1"><User className="w-3 h-3" />CHP for Follow-up</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-xs text-blue-700 mb-1 block">Name *</label><input type="text" required value={chpName} onChange={e => setChpName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="CHP full name" /></div>
                <div><label className="text-xs text-blue-700 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" />Phone</label><input type="tel" value={chpPhone} onChange={e => setChpPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="2547XXXXXXXX" /></div>
                <div><label className="text-xs text-blue-700 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" />Email</label><input type="email" value={chpEmail} onChange={e => setChpEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="For follow-up form" /></div>
              </div>
            </div>

            <button onClick={submitCounter} disabled={submitting || !finalDiagnosis || !treatment || !followUp || !chpName}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Send className="w-4 h-4" />Create Counter-Referral & Notify CHP</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JStep({ icon: Icon, color, label, station, collector, isCurrent }: { icon: typeof MapPin; color: string; label: string; station: string; collector?: string; isCurrent?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center shrink-0 ${isCurrent ? 'ring-4 ring-emerald-100' : ''}`}><Icon className="w-5 h-5 text-white" /></div>
      <div><p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p><p className={`text-sm font-semibold ${isCurrent ? 'text-emerald-700' : ''}`}>{station}</p>{collector && <p className="text-xs text-muted-foreground">by {collector}</p>}</div>
    </div>
  );
}

function F({ label, value, onChange, rows = 2, placeholder, cls = '' }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; cls?: string }) {
  return (
    <div><label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">{label}</label>
      <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} className={`w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary ${cls}`} placeholder={placeholder} /></div>
  );
}
