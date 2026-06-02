/**
 * ReferralForm v2 — Step-by-step referral creation with improved UX
 *
 * Features:
 *   - Step progress indicator (1-2-3-4)
 *   - AI-assisted diagnosis with animated classification
 *   - Visual transport mode selector
 *   - Section cards with icon headers
 *   - Review summary before submit
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Ambulance, Bus, Car, Footprints, Armchair, StretchHorizontal,
  AlertTriangle, Sparkles, Send, User, MapPin, Home, Building2,
  ChevronRight, ChevronLeft, Check, Stethoscope, HeartPulse,
  Shield, UserCheck, Search, X,
} from 'lucide-react';
import { useEdgeAI } from '@/hooks/useEdgeAI';
import { getCollectorStations } from '@/lib/apiClient';

import type { ReferralV2 } from '@/types';

interface ReferralFormProps {
  onSubmit: (referral: Partial<ReferralV2>) => Promise<void>;
  collectorId: string;
  collectorName: string;
  sourceStationId: string;
  sourceStationName: string;
  sourceStationType: 'household' | 'hip' | 'referral-center';
  followUpData?: Record<string, unknown>;
}

const TRANSPORT_MODES = [
  { value: 'ambulance', label: 'Ambulance', icon: Ambulance, color: 'text-red-500' },
  { value: 'matatu', label: 'Matatu', icon: Bus, color: 'text-blue-500' },
  { value: 'private-vehicle', label: 'Private Car', icon: Car, color: 'text-emerald-500' },
  { value: 'walking', label: 'Walking', icon: Footprints, color: 'text-amber-500' },
  { value: 'wheelchair', label: 'Wheelchair', icon: Armchair, color: 'text-purple-500' },
  { value: 'stretcher', label: 'Stretcher', icon: StretchHorizontal, color: 'text-rose-500' },
  { value: 'other', label: 'Other', icon: MapPin, color: 'text-gray-500' },
] as const;

const URGENCY_META = {
  routine: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', ring: 'ring-blue-300', label: 'Routine', desc: 'Standard referral process' },
  urgent: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', ring: 'ring-amber-300', label: 'Urgent', desc: 'Transport within 2-4 hours' },
  emergency: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', ring: 'ring-red-300', label: 'Emergency', desc: 'Immediate transport required' },
};

const STEPS = [
  { id: 1, label: 'Patient', icon: User },
  { id: 2, label: 'Diagnosis', icon: Stethoscope },
  { id: 3, label: 'Transport', icon: Ambulance },
  { id: 4, label: 'Review', icon: Check },
];

interface Facility {
  name: string;
  type: 'household' | 'hip' | 'referral-center';
  typeLabel: string;
  collectors: string[];
}

export default function ReferralForm({
  onSubmit, collectorId, collectorName, sourceStationId, sourceStationName, sourceStationType,
  followUpData,
}: ReferralFormProps) {
  const { classifySymptoms, isLoading: aiLoading } = useEdgeAI();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // ── Facility autocomplete ──
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [destQuery, setDestQuery] = useState('');
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);
  const destInputRef = useRef<HTMLInputElement>(null);

  // Fetch collector stations for facility autocomplete
  useEffect(() => {
    getCollectorStations().then(res => {
      if (res.success) {
        const stations = (res.data as any)?.stations || [];
        setFacilities(stations.map((s: any) => ({
          name: s.name,
          type: s.type || 'household',
          typeLabel: s.type === 'referral-center' ? 'Referral Center' : s.type === 'hip' ? 'HIP' : 'Household',
          collectors: s.collectors || [],
        })).sort((a: Facility, b: Facility) => a.name.localeCompare(b.name)));
      }
      setFacilitiesLoading(false);
    }).catch(() => setFacilitiesLoading(false));
  }, []);

  // Filter facilities based on query
  const filteredFacilities = useMemo(() => {
    if (!destQuery.trim()) return facilities;
    const q = destQuery.toLowerCase();
    return facilities.filter(f => f.name.toLowerCase().includes(q) || f.typeLabel.toLowerCase().includes(q));
  }, [destQuery, facilities]);

  // Also allow typing a custom facility (shown at bottom of list)
  const isCustomFacility = destQuery.trim() && !facilities.some(f => f.name.toLowerCase() === destQuery.toLowerCase().trim());

  const selectFacility = (facility: Facility) => {
    setForm(p => ({
      ...p,
      destinationStationName: facility.name,
      destinationStationType: facility.type,
      destinationStationId: `${facility.type}-${facility.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    }));
    setDestQuery(facility.name);
    setShowDestSuggestions(false);
  };

  const clearFacility = () => {
    setForm(p => ({ ...p, destinationStationName: '', destinationStationId: '' }));
    setDestQuery('');
    setShowDestSuggestions(true);
    destInputRef.current?.focus();
  };

  const handleDestInputChange = (value: string) => {
    setDestQuery(value);
    setForm(p => ({
      ...p,
      destinationStationName: value,
      destinationStationId: value ? `${p.destinationStationType}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '',
    }));
    setShowDestSuggestions(true);
  };

  const [form, setForm] = useState({
    patientName: '', patientAge: '', patientGender: 'male' as 'male' | 'female' | 'other',
    patientPhone: '', patientId: `REF-${Date.now().toString(36).toUpperCase()}`, village: '',
    destinationStationId: '', destinationStationName: '', destinationStationType: 'referral-center' as 'household' | 'hip' | 'referral-center',
    chpName: '', chpPhone: '', chpEmail: '',
    initialDiagnosis: '', aiSuggestedCategory: '', aiConfidence: 0,
    reasonForReferral: '', modeOfTransport: 'ambulance' as ReferralV2['modeOfTransport'],
    transportNotes: '', urgency: 'routine' as 'routine' | 'urgent' | 'emergency', notes: '',
  });

  // Phase C: Pre-populate form from follow-up data
  useEffect(() => {
    if (followUpData) {
      setForm(p => ({
        ...p,
        patientName: (followUpData.patientName as string) || p.patientName,
        patientAge: String(followUpData.patientAge || ''),
        patientGender: (followUpData.patientGender as 'male' | 'female' | 'other') || p.patientGender,
        patientPhone: (followUpData.patientPhone as string) || p.patientPhone,
        initialDiagnosis: (followUpData.initialDiagnosis as string) || p.initialDiagnosis,
        reasonForReferral: (followUpData.reasonForReferral as string) || p.reasonForReferral,
        urgency: (followUpData.urgency as 'routine' | 'urgent' | 'emergency') || p.urgency,
        notes: (followUpData.notes as string) || p.notes,
      }));
    }
  }, [followUpData]);

  const handleDiagnosisChange = async (text: string) => {
    setForm(p => ({ ...p, initialDiagnosis: text }));
    if (text.length > 10) {
      const result = await classifySymptoms(text);
      if (result) setForm(p => ({ ...p, aiSuggestedCategory: result.category, aiConfidence: result.confidence, urgency: result.urgency }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Auto-generate destinationStationId from name + type if user didn't click a type button
    const destId = form.destinationStationId
      || `${form.destinationStationType}-${form.destinationStationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    try {
      await onSubmit({
        patientId: form.patientId, patientName: form.patientName,
        patientAge: parseInt(form.patientAge) || 0, patientGender: form.patientGender, patientPhone: form.patientPhone,
        village: form.village?.trim() || undefined,
        sourceStationId, sourceStationName, sourceStationType,
        sourceCollectorId: collectorId, sourceCollectorName: collectorName,
        destinationStationId: destId, destinationStationName: form.destinationStationName, destinationStationType: form.destinationStationType,
        chpName: form.chpName || undefined, chpPhone: form.chpPhone || undefined, chpEmail: form.chpEmail || undefined,
        initialDiagnosis: form.initialDiagnosis, aiSuggestedCategory: form.aiSuggestedCategory || undefined,
        aiConfidence: form.aiConfidence || undefined, reasonForReferral: form.reasonForReferral,
        modeOfTransport: form.modeOfTransport, transportNotes: form.transportNotes || undefined,
        urgency: form.urgency, notes: form.notes || undefined,
      });
    } finally { setSubmitting(false); }
  };

  const canNext = () => {
    if (step === 1) return form.patientName && form.patientAge && form.patientPhone && form.destinationStationName;
    if (step === 2) return form.initialDiagnosis && form.reasonForReferral;
    if (step === 3) return true;
    return true;
  };

  const uMeta = URGENCY_META[form.urgency];
  const transportLabel = TRANSPORT_MODES.find(t => t.value === form.modeOfTransport)?.label || form.modeOfTransport;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 w-full">
      {/* Step Progress */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => { if (s.id < step || canNext()) setStep(s.id); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                step === s.id ? 'bg-primary text-primary-foreground shadow-sm' :
                s.id < step ? 'bg-primary/10 text-primary' :
                'bg-muted text-muted-foreground'
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.id}</span>
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
          </div>
        ))}
      </div>

      {/* ─── STEP 1: Patient Info ─── */}
      {step === 1 && (
        <div className="space-y-5">
          <SectionCard icon={User} title="Patient Information" accent="bg-primary">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Registration No." value={form.patientId} readOnly className="font-mono bg-muted" />
              <InputField label="Full Name *" value={form.patientName} onChange={v => setForm(p => ({ ...p, patientName: v }))} placeholder="e.g., Mary Akinyi" required />
              <InputField label="Age (years) *" type="number" value={form.patientAge} onChange={v => setForm(p => ({ ...p, patientAge: v }))} min={0} max={150} placeholder="e.g., 34" required />
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Gender *</label>
                <div className="flex gap-2">
                  {(['male', 'female', 'other'] as const).map(g => (
                    <button key={g} type="button" onClick={() => setForm(p => ({ ...p, patientGender: g }))}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium capitalize transition-all ${
                        form.patientGender === g ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-border hover:bg-muted'
                      }`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <InputField label="Phone *" type="tel" value={form.patientPhone} onChange={v => setForm(p => ({ ...p, patientPhone: v }))} placeholder="2547XXXXXXXX" required />
              <div>
                <InputField
                  label="Village"
                  value={form.village}
                  onChange={v => setForm(p => ({ ...p, village: v }))}
                  placeholder="e.g., Kisauni, Mtwapa, Ganze"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Used for disease incidence mapping in your area</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={MapPin} title="Destination" accent="bg-sky-500">
            <div className="space-y-4">
              {/* Facility Autocomplete */}
              <div className="relative">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                  Destination Facility *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    ref={destInputRef}
                    type="text"
                    required
                    value={destQuery}
                    onChange={e => handleDestInputChange(e.target.value)}
                    onFocus={() => setShowDestSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowDestSuggestions(false), 200)}
                    className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Search facilities with stationed collectors..."
                  />
                  {form.destinationStationName && (
                    <button
                      type="button"
                      onClick={clearFacility}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Suggestions dropdown */}
                {showDestSuggestions && (
                  <div className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                    {facilitiesLoading ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">Loading facilities...</div>
                    ) : filteredFacilities.length === 0 && !isCustomFacility ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        {destQuery.trim() ? 'No matching facilities' : 'Start typing to find facilities'}
                      </div>
                    ) : (
                      <>
                        {filteredFacilities.map(facility => (
                          <button
                            key={`${facility.name}-${facility.type}`}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); selectFacility(facility); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 text-left transition-colors border-b border-border/50 last:border-b-0"
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                              facility.type === 'referral-center' ? 'bg-emerald-500' :
                              facility.type === 'hip' ? 'bg-sky-500' : 'bg-amber-500'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{facility.name}</p>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  facility.type === 'referral-center' ? 'bg-emerald-50 text-emerald-700' :
                                  facility.type === 'hip' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {facility.typeLabel}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {facility.collectors.length} collector{facility.collectors.length > 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            {form.destinationStationName === facility.name && (
                              <Check className="w-4 h-4 text-primary shrink-0" />
                            )}
                          </button>
                        ))}
                        {/* Custom facility option */}
                        {isCustomFacility && destQuery.trim().length > 2 && (
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); setShowDestSuggestions(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 text-left transition-colors border-t border-dashed border-border"
                          >
                            <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">Use "{destQuery.trim()}"</p>
                              <p className="text-[10px] text-muted-foreground">Custom facility (no stationed collectors)</p>
                            </div>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-1">
                  {facilities.length > 0
                    ? `${facilities.length} facilit${facilities.length > 1 ? 'ies' : 'y'} with stationed collectors`
                    : facilitiesLoading ? 'Loading facilities...' : 'No facilities found. Register collectors with station names or assigned facilities.'}
                </p>
              </div>

              {/* Station Type */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                  Station Type {form.destinationStationName ? `for "${form.destinationStationName}"` : ''} *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'household', label: 'Household', icon: Home },
                    { value: 'hip', label: 'HIP', icon: MapPin },
                    { value: 'referral-center', label: 'Referral Center', icon: Building2 },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, destinationStationType: value, destinationStationId: `${value}-${p.destinationStationName?.toLowerCase().replace(/\s+/g, '-') || 'unknown'}` }))}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                        form.destinationStationType === value
                          ? 'border-primary bg-primary/5 text-primary shadow-sm'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ─── STEP 2: Diagnosis ─── */}
      {step === 2 && (
        <div className="space-y-5">
          <SectionCard icon={Stethoscope} title="Diagnosis & Reason" accent="bg-amber-500">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                  Initial Diagnosis / Symptoms * <span className="normal-case font-normal text-amber-600">(type for AI analysis)</span>
                </label>
                <textarea required rows={3} value={form.initialDiagnosis}
                  onChange={e => handleDiagnosisChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="e.g., persistent high fever, neck stiffness, severe headache for 3 days" />
                {aiLoading && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-amber-600">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Analyzing symptoms...
                  </div>
                )}
              </div>

              {/* AI Result */}
              {form.aiSuggestedCategory && (
                <div className={`rounded-xl p-4 border-2 ${uMeta.border} ${uMeta.bg} relative overflow-hidden`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className={`w-4 h-4 ${form.urgency === 'emergency' ? 'text-red-500' : form.urgency === 'urgent' ? 'text-amber-500' : 'text-blue-500'}`} />
                    <span className="text-sm font-bold">AI Classification</span>
                    <span className="text-xs text-muted-foreground">({Math.round(form.aiConfidence * 100)}% confidence)</span>
                  </div>
                  <p className={`text-base font-bold ${uMeta.text}`}>{form.aiSuggestedCategory}</p>
                  <p className="text-xs mt-1 opacity-80">{uMeta.desc}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Reason for Referral *</label>
                <textarea required rows={2} value={form.reasonForReferral}
                  onChange={e => setForm(p => ({ ...p, reasonForReferral: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Why is this patient being referred?" />
              </div>

              {/* Urgency */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block uppercase tracking-wide">Urgency Level *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['routine', 'urgent', 'emergency'] as const).map(u => {
                    const m = URGENCY_META[u];
                    return (
                      <button key={u} type="button" onClick={() => setForm(p => ({ ...p, urgency: u }))}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                          form.urgency === u ? `${m.border} ${m.bg} ${m.text} shadow-sm` : 'border-border hover:bg-muted'
                        }`}>
                        {u === 'emergency' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                        {u === 'urgent' && <HeartPulse className="w-5 h-5 text-amber-500" />}
                        {u === 'routine' && <Shield className="w-5 h-5 text-blue-500" />}
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ─── STEP 3: Transport ─── */}
      {step === 3 && (
        <div className="space-y-5">
          <SectionCard icon={Ambulance} title="Mode of Transport" accent="bg-emerald-500">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TRANSPORT_MODES.map(({ value, label, icon: Icon, color }) => (
                <button key={value} type="button"
                  onClick={() => setForm(p => ({ ...p, modeOfTransport: value as ReferralV2['modeOfTransport'] }))}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-xs font-semibold transition-all ${
                    form.modeOfTransport === value
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
                  }`}>
                  <Icon className={`w-6 h-6 ${form.modeOfTransport === value ? color : 'text-muted-foreground'}`} />
                  {label}
                </button>
              ))}
            </div>
            <textarea rows={1} value={form.transportNotes}
              onChange={e => setForm(p => ({ ...p, transportNotes: e.target.value }))}
              className="w-full mt-4 px-3 py-2 rounded-lg border border-border text-sm bg-background"
              placeholder="Transport notes (optional)" />
          </SectionCard>

          <SectionCard icon={UserCheck} title="CHP Assignment (Optional)" accent="bg-purple-500">
            <p className="text-xs text-muted-foreground mb-3">
              Assign a CHP for follow-up. They will receive an email with a recovery tracking form.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InputField label="CHP Name" value={form.chpName} onChange={v => setForm(p => ({ ...p, chpName: v }))} placeholder="e.g., Janet Mwagandi" />
              <InputField label="CHP Phone" type="tel" value={form.chpPhone} onChange={v => setForm(p => ({ ...p, chpPhone: v }))} placeholder="2547XXXXXXXX" />
              <InputField label="CHP Email" type="email" value={form.chpEmail} onChange={v => setForm(p => ({ ...p, chpEmail: v }))} placeholder="For follow-up form" />
            </div>
          </SectionCard>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Additional Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background" placeholder="Any other relevant information..." />
          </div>
        </div>
      )}

      {/* ─── STEP 4: Review ─── */}
      {step === 4 && (
        <div className="space-y-5">
          <SectionCard icon={Check} title="Review & Submit" accent="bg-primary">
            <div className="space-y-4">
              <ReviewRow label="Patient" value={`${form.patientName}, ${form.patientAge}y, ${form.patientGender}`} />
              <ReviewRow label="Phone" value={form.patientPhone} />
              <ReviewRow label="Reg No" value={form.patientId} mono />
              <div className="h-px bg-border" />
              <ReviewRow label="From" value={`${sourceStationName} (${sourceStationType})`} />
              <ReviewRow label="To" value={form.destinationStationName} highlight />
              <div className="h-px bg-border" />
              <ReviewRow label="Diagnosis" value={form.initialDiagnosis} />
              <ReviewRow label="Reason" value={form.reasonForReferral} />
              {form.aiSuggestedCategory && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700">AI: {form.aiSuggestedCategory}</p>
                    <p className="text-xs text-amber-600">{Math.round(form.aiConfidence * 100)}% confidence</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${uMeta.bg} ${uMeta.text} ${uMeta.border} border`}>
                  {uMeta.label.toUpperCase()}
                </span>
                <span className="text-xs text-muted-foreground">{uMeta.desc}</span>
              </div>
              <div className="h-px bg-border" />
              <ReviewRow label="Transport" value={transportLabel} />
              {form.chpName && <ReviewRow label="CHP" value={`${form.chpName} ${form.chpEmail ? `(${form.chpEmail})` : ''}`} />}
            </div>
          </SectionCard>

          <button type="submit" disabled={submitting}
            className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
            {submitting ? <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</>
              : <><Send className="w-5 h-5" /> Create Referral</>}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        {step > 1 ? (
          <button type="button" onClick={() => setStep(s => s - 1)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        ) : <div />}
        {step < 4 && (
          <button type="button" onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-40 ml-auto">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );
}

/* ─── Sub-components ─── */

function SectionCard({ icon: Icon, title, accent, children }: {
  icon: typeof User; title: string; accent: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-visible">
      <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg ${accent} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', readOnly, className = '', placeholder, required, min, max }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string;
  readOnly?: boolean; className?: string; placeholder?: string; required?: boolean; min?: number; max?: number;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input type={type} value={value} readOnly={readOnly} required={required} min={min} max={max}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${className}`} />
    </div>
  );
}

function ReviewRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-semibold text-muted-foreground w-20 shrink-0 uppercase tracking-wide mt-0.5">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-xs' : ''} ${highlight ? 'font-semibold text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
