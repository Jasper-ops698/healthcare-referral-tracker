/**
 * CounterReferralView — Unified incoming referrals + patient history + counter-referral creation
 *
 * UX Flow:
 *   1. List view: Incoming referrals to this station with patient summaries
 *   2. Detail view: Click a patient → see full referral context + patient journey history
 *   3. Counter-referral form: Create counter-referral with final diagnosis, treatment, recovery
 *
 * Resonates with "Send Referral" — it's the receiving end that completes the loop.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  ClipboardList, Search, CheckCircle, Clock, AlertTriangle,
  ArrowLeft, Stethoscope, User, Phone, MapPin, Ambulance,
  RefreshCw, ChevronRight, Sparkles, Activity, HeartPulse,
  Pill, Syringe, Calendar, AlertOctagon, Mail, Send,
  Loader2, FileText, TrendingUp,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import type { ReferralV2, RecoveryStatus } from '@/types';

interface CounterReferralViewProps {
  stationId: string;
  stationName: string;
  collectorId: string;
  collectorName: string;
}

type ViewMode = 'list' | 'detail';
type StatusFilter = 'all' | 'pending' | 'in-transit' | 'accepted' | 'in-treatment';

const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', icon: Clock },
  'in-transit': { label: 'In Transit', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', icon: Ambulance },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', icon: CheckCircle },
  'in-treatment': { label: 'In Treatment', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', icon: Stethoscope },
};

const URGENCY_META = {
  emergency: { bg: 'bg-red-500', label: 'Emergency' },
  urgent: { bg: 'bg-amber-500', label: 'Urgent' },
  routine: { bg: 'bg-blue-400', label: 'Routine' },
};

const RECOVERY_OPTIONS: { value: RecoveryStatus; label: string; color: string; bg: string }[] = [
  { value: 'fully-recovered', label: 'Fully Recovered', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300' },
  { value: 'partially-recovered', label: 'Partially Recovered', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300' },
  { value: 'still-unwell', label: 'Still Unwell', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },
  { value: 'deceased', label: 'Deceased', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-300' },
  { value: 'lost-to-follow-up', label: 'Lost to Follow-up', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-300' },
];

/** Mock patient referral history — in production, this comes from API */
function getPatientHistory(patientId: string, currentReferralId: string): Partial<ReferralV2>[] {
  const all = loadReferralsFromStorage();
  return all
    .filter(r => r.patientId === patientId && r.id !== currentReferralId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function loadReferralsFromStorage(): ReferralV2[] {
  try {
    const raw = localStorage.getItem('healthtrack_referrals_v2');
    if (!raw) return getMockIncomingReferrals();
    return JSON.parse(raw).map((r: any) => ({ ...r, createdAt: new Date(r.createdAt) }));
  } catch { return getMockIncomingReferrals(); }
}

function getMockIncomingReferrals(): ReferralV2[] {
  return [
    {
      id: 'ref_001', patientId: 'P-KSM-2847', patientName: 'Amina Hassan', patientAge: 34, patientGender: 'female', patientPhone: '254712345678',
      sourceStationId: 'hip-bom', sourceStationName: 'HIP - Bomani', sourceStationType: 'hip',
      sourceCollectorId: 'col_1', sourceCollectorName: 'James Mwangi',
      destinationStationId: 'rc-kgh', destinationStationName: 'Kilifi General Hospital', destinationStationType: 'referral-center',
      initialDiagnosis: 'Severe abdominal pain, suspected appendicitis. Patient unable to stand straight. Nausea and low-grade fever for 2 days.',
      aiSuggestedCategory: 'Surgical: Appendicitis', aiConfidence: 0.82,
      reasonForReferral: 'Requires surgical evaluation and possible appendectomy. HIP lacks surgical capability.',
      modeOfTransport: 'ambulance', urgency: 'urgent', status: 'accepted', notes: '',
      chpName: 'Fatuma Ali', chpPhone: '254723456789',
      createdAt: new Date(Date.now() - 3600000),
    },
    {
      id: 'ref_002', patientId: 'P-BMN-1953', patientName: 'Omari Juma', patientAge: 67, patientGender: 'male', patientPhone: '254798765432',
      sourceStationId: 'hip-mar', sourceStationName: 'HIP - Marereni', sourceStationType: 'hip',
      sourceCollectorId: 'col_2', sourceCollectorName: 'Grace Wanjiku',
      destinationStationId: 'rc-kgh', destinationStationName: 'Kilifi General Hospital', destinationStationType: 'referral-center',
      initialDiagnosis: 'Chest pain radiating to left arm, shortness of breath, sweating. History of hypertension.',
      aiSuggestedCategory: 'Cardiac: Possible MI', aiConfidence: 0.91,
      reasonForReferral: 'Emergency cardiac evaluation needed. ECG and troponin testing required.',
      modeOfTransport: 'ambulance', urgency: 'emergency', status: 'in-treatment', notes: '',
      chpName: 'Bakari Mwendwa', chpPhone: '254734567890',
      createdAt: new Date(Date.now() - 7200000),
    },
    {
      id: 'ref_003', patientId: 'P-KSM-3156', patientName: 'Wanjiru Kamau', patientAge: 28, patientGender: 'female', patientPhone: '254756789012',
      sourceStationId: 'hh-gen', sourceStationName: 'Household (General)', sourceStationType: 'household',
      sourceCollectorId: 'col_3', sourceCollectorName: 'Peter Ochieng',
      destinationStationId: 'rc-bom', destinationStationName: 'Bomani Dispensary', destinationStationType: 'referral-center',
      initialDiagnosis: 'Persistent cough for 3 weeks, night sweats, weight loss, low-grade fever.',
      aiSuggestedCategory: 'Respiratory: TB Suspected', aiConfidence: 0.76,
      reasonForReferral: 'TB screening and sputum testing. Household level suspects chronic infection.',
      modeOfTransport: 'matatu', urgency: 'routine', status: 'in-transit', notes: '',
      chpName: 'Lucy Muthoni', chpPhone: '254745678901', chpEmail: 'lucy.m@chp.co.ke',
      createdAt: new Date(Date.now() - 1800000),
    },
  ] as ReferralV2[];
}

export default function CounterReferralView({ stationId, stationName, collectorId: _cid, collectorName: _cname }: CounterReferralViewProps) {
  const [referrals, setReferrals] = useState<ReferralV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [selectedReferral, setSelectedReferral] = useState<ReferralV2 | null>(null);

  // Counter-referral form state
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [treatmentProvided, setTreatmentProvided] = useState('');
  const [medications, setMedications] = useState('');
  const [procedures, setProcedures] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('still-unwell');
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [warningSigns, setWarningSigns] = useState('');
  const [chpName, setChpName] = useState('');
  const [chpPhone, setChpPhone] = useState('');
  const [chpEmail, setChpEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Load incoming referrals for this station
    const all = loadReferralsFromStorage();
    const incoming = all.filter(r => r.destinationStationId === stationId);
    setReferrals(incoming);
    setLoading(false);
  }, [stationId]);

  const handleAccept = async (referralId: string) => {
    setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'accepted' as const } : r));
  };

  const handleOpenDetail = (referral: ReferralV2) => {
    setSelectedReferral(referral);
    setView('detail');
    setShowCounterForm(false);
    // Pre-fill CHP from original referral
    setChpName(referral.chpName || '');
    setChpPhone(referral.chpPhone || '');
    setChpEmail(referral.chpEmail || '');
  };

  const handleSubmitCounter = async () => {
    if (!finalDiagnosis || !treatmentProvided || !followUpInstructions) return;
    setSubmitting(true);
    // Simulate API call
    await new Promise(r => setTimeout(r, 1000));
    toast.success('Counter-referral created and CHP notified');
    setSubmitting(false);
    setShowCounterForm(false);
  };

  const filtered = referrals.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.patientName.toLowerCase().includes(q) || r.patientId.toLowerCase().includes(q);
  });

  // Stats
  const stats = {
    total: referrals.length,
    pending: referrals.filter(r => r.status === 'pending' || r.status === 'in-transit').length,
    active: referrals.filter(r => r.status === 'accepted' || r.status === 'in-treatment').length,
    emergency: referrals.filter(r => r.urgency === 'emergency').length,
  };

  // ─── LIST VIEW ───
  if (view === 'list') {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Counter-Referral
          </h2>
          <p className="text-sm text-muted-foreground">
            Patients referred to {stationName} — view history and create counter-referrals
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Incoming', value: stats.total, icon: ClipboardList, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100' },
            { label: 'Active', value: stats.active, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Emergency', value: stats.emergency, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card rounded-xl p-3 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by patient name or ID..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border text-sm bg-background" />
          </div>
          <div className="flex gap-2">
            {(['all', 'pending', 'in-transit', 'accepted', 'in-treatment'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === s ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
                }`}>
                {s === 'all' ? 'All' : STATUS_META[s]?.label || s}
              </button>
            ))}
          </div>
        </div>

        {/* Referral List */}
        {loading ? (
          <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No incoming referrals</p>
            <p className="text-xs mt-1">Referrals sent to {stationName} will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(referral => {
              const sMeta = STATUS_META[referral.status] || STATUS_META.pending;
              const StatusIcon = sMeta.icon;
              const uMeta = URGENCY_META[referral.urgency];
              return (
                <button
                  key={referral.id}
                  onClick={() => handleOpenDetail(referral)}
                  className="w-full bg-card rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${uMeta.bg}`}>{uMeta.label}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${sMeta.bg} ${sMeta.text} ${sMeta.border} border`}>
                          <StatusIcon className="w-3 h-3" /> {sMeta.label}
                        </span>
                      </div>
                      <p className="font-semibold text-sm mt-2">{referral.patientName} <span className="text-muted-foreground font-normal font-mono text-xs">({referral.patientId})</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">{referral.patientAge}y · {referral.patientGender} · {referral.patientPhone}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> From: {referral.sourceStationName}</span>
                        <span className="flex items-center gap-1"><Ambulance className="w-3 h-3" /> {referral.modeOfTransport}</span>
                      </div>
                      <p className="text-xs mt-2 line-clamp-2 text-amber-700 bg-amber-50 px-2 py-1 rounded">{referral.initialDiagnosis}</p>
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
  if (!selectedReferral) return null;
  const history = getPatientHistory(selectedReferral.patientId, selectedReferral.id);
  const sMeta = STATUS_META[selectedReferral.status] || STATUS_META.pending;
  const StatusIcon = sMeta.icon;
  const uMeta = URGENCY_META[selectedReferral.urgency];

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Back */}
      <button onClick={() => setView('list')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to incoming referrals
      </button>

      {/* Patient Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${uMeta.bg}`}>{uMeta.label}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${sMeta.bg} ${sMeta.text} ${sMeta.border} border`}>
                <StatusIcon className="w-3 h-3" /> {sMeta.label}
              </span>
            </div>
            <h2 className="text-xl font-bold">{selectedReferral.patientName}</h2>
            <p className="text-sm text-muted-foreground font-mono">{selectedReferral.patientId} · {selectedReferral.patientAge}y · {selectedReferral.patientGender}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Referred</p>
            <p className="text-sm font-medium">{selectedReferral.createdAt && isValid(new Date(selectedReferral.createdAt)) ? format(new Date(selectedReferral.createdAt), 'MMM d, h:mm a') : 'Unknown'}</p>
          </div>
        </div>
      </div>

      {/* Referral Journey */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Referral Journey</h3>
        </div>
        <div className="p-5 space-y-4">
          {/* Source */}
          <JourneyStep icon={MapPin} color="bg-blue-500" label="Origin" station={selectedReferral.sourceStationName} collector={selectedReferral.sourceCollectorName} />
          {/* Arrow */}
          <div className="flex items-center gap-3 pl-3">
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{selectedReferral.modeOfTransport} · {selectedReferral.urgency}</span>
          </div>
          {/* Destination (current) */}
          <JourneyStep icon={Stethoscope} color="bg-emerald-500" label="Current" station={selectedReferral.destinationStationName} isCurrent />
        </div>
      </div>

      {/* Original Referral Context */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold">Referral Context</h3>
        </div>
        <div className="p-5 space-y-4">
          {selectedReferral.aiSuggestedCategory && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-amber-800">AI Classification</span>
              </div>
              <p className="text-sm font-semibold text-amber-700">{selectedReferral.aiSuggestedCategory}</p>
              <p className="text-xs text-amber-600">{Math.round((selectedReferral.aiConfidence || 0) * 100)}% confidence · Urgency: {selectedReferral.urgency}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Initial Diagnosis</p>
            <p className="text-sm">{selectedReferral.initialDiagnosis}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reason for Referral</p>
            <p className="text-sm">{selectedReferral.reasonForReferral}</p>
          </div>
        </div>
      </div>

      {/* Patient Referral History */}
      {history.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-500" />
            <h3 className="text-sm font-bold">Patient History — {history.length} previous referral{history.length > 1 ? 's' : ''}</h3>
          </div>
          <div className="divide-y divide-border">
            {history.map((h, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">{history.length - i}</div>
                <div>
                  <p className="text-sm font-medium">{h.sourceStationName} → {h.destinationStationName}</p>
                  <p className="text-xs text-muted-foreground">{h.initialDiagnosis}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{h.createdAt ? format(new Date(h.createdAt), 'MMM d, yyyy') : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {(selectedReferral.status === 'pending' || selectedReferral.status === 'in-transit') && (
        <button onClick={() => handleAccept(selectedReferral.id)}
          className="w-full px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4" /> Accept Patient
        </button>
      )}

      {/* Counter-Referral Toggle */}
      {(selectedReferral.status === 'accepted' || selectedReferral.status === 'in-treatment') && !showCounterForm && (
        <button onClick={() => setShowCounterForm(true)}
          className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
          <ClipboardList className="w-4 h-4" /> Create Counter-Referral
        </button>
      )}

      {/* Counter-Referral Form */}
      {showCounterForm && (
        <div className="bg-card rounded-xl border border-primary/30 overflow-hidden">
          <div className="px-5 py-3 border-b border-primary/20 bg-primary/5 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Counter-Referral</h3>
          </div>
          <div className="p-5 space-y-4">
            {/* Final Diagnosis */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Final Diagnosis *</label>
              <textarea required rows={2} value={finalDiagnosis} onChange={e => setFinalDiagnosis(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="e.g., Confirmed malaria with mild anemia" />
            </div>

            {/* Treatment */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Treatment Provided *</label>
              <textarea required rows={2} value={treatmentProvided} onChange={e => setTreatmentProvided(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="e.g., Artemether-Lumefantrine course, IV fluids" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wide"><Pill className="w-3 h-3" /> Medications</label>
                <textarea rows={2} value={medications} onChange={e => setMedications(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="List medications with dosages" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wide"><Syringe className="w-3 h-3" /> Procedures</label>
                <textarea rows={2} value={procedures} onChange={e => setProcedures(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="e.g., RDT, hemoglobin test" />
              </div>
            </div>

            {/* Recovery Status */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Recovery Status *</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {RECOVERY_OPTIONS.map(({ value, label, color, bg }) => (
                  <button key={value} type="button" onClick={() => setRecoveryStatus(value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs font-semibold transition-all ${
                      recoveryStatus === value ? `${bg}` : 'border-border hover:bg-muted/50'
                    }`}>
                    <HeartPulse className={`w-5 h-5 ${color}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Follow-up */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wide"><Calendar className="w-3 h-3" /> Next Visit Date</label>
                <input type="date" value={nextVisitDate} onChange={e => setNextVisitDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Follow-up Instructions *</label>
              <textarea required rows={3} value={followUpInstructions} onChange={e => setFollowUpInstructions(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background"
                placeholder="Instructions for CHP and patient. e.g., Complete full ACT course, return if fever persists beyond 48 hours" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1 uppercase tracking-wide"><AlertOctagon className="w-3 h-3 text-red-500" /> Warning Signs</label>
              <textarea rows={2} value={warningSigns} onChange={e => setWarningSigns(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-red-200 bg-red-50/30 text-sm"
                placeholder="Signs that require immediate re-referral. e.g., Persistent high fever, confusion" />
            </div>

            {/* CHP */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 space-y-3">
              <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1"><User className="w-3 h-3" /> CHP for Follow-up</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-blue-700 mb-1 block">Name *</label>
                  <input type="text" required value={chpName} onChange={e => setChpName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="CHP full name" />
                </div>
                <div>
                  <label className="text-xs text-blue-700 mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</label>
                  <input type="tel" value={chpPhone} onChange={e => setChpPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="2547XXXXXXXX" />
                </div>
                <div>
                  <label className="text-xs text-blue-700 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
                  <input type="email" value={chpEmail} onChange={e => setChpEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="For follow-up form" />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button onClick={handleSubmitCounter} disabled={submitting || !finalDiagnosis || !treatmentProvided || !followUpInstructions || !chpName}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                : <><Send className="w-4 h-4" /> Create Counter-Referral & Notify CHP</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function JourneyStep({ icon: Icon, color, label, station, collector, isCurrent }: {
  icon: typeof MapPin; color: string; label: string; station: string; collector?: string; isCurrent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center shrink-0 ${isCurrent ? 'ring-4 ring-emerald-100' : ''}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-sm font-semibold ${isCurrent ? 'text-emerald-700' : 'text-foreground'}`}>{station}</p>
        {collector && <p className="text-xs text-muted-foreground">by {collector}</p>}
      </div>
    </div>
  );
}


