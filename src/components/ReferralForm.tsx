/**
 * ReferralForm — Create a new patient referral
 *
 * Features:
 *   - AI-assisted diagnosis classification (offline via useEdgeAI)
 *   - Station selection (source → destination)
 *   - CHP assignment (name + contact only)
 *   - Transport mode selection
 *   - Auto-categorizes urgency based on symptoms
 */

import { useState } from 'react';
import { Ambulance, Bus, Car, Footprints, Armchair, StretchHorizontal, AlertTriangle, Sparkles, Send, User, Phone, Mail, MapPin } from 'lucide-react';
import { useEdgeAI } from '@/hooks/useEdgeAI';
import StationSelector from './StationSelector';
import type { ReferralV2 } from '@/types';

interface ReferralFormProps {
  onSubmit: (referral: Partial<ReferralV2>) => Promise<void>;
  collectorId: string;
  collectorName: string;
  sourceStationId: string;
  sourceStationName: string;
  sourceStationType: 'household' | 'hip' | 'referral-center';
}

const TRANSPORT_MODES = [
  { value: 'ambulance', label: 'Ambulance', icon: Ambulance },
  { value: 'matatu', label: 'Matatu (Public)', icon: Bus },
  { value: 'private-vehicle', label: 'Private Vehicle', icon: Car },
  { value: 'walking', label: 'Walking', icon: Footprints },
  { value: 'wheelchair', label: 'Wheelchair', icon: Armchair },
  { value: 'stretcher', label: 'Stretcher', icon: StretchHorizontal },
  { value: 'other', label: 'Other', icon: MapPin },
] as const;

const URGENCY_COLORS = {
  routine: 'bg-blue-100 text-blue-700 border-blue-200',
  urgent: 'bg-amber-100 text-amber-700 border-amber-200',
  emergency: 'bg-red-100 text-red-700 border-red-200',
};

export default function ReferralForm({
  onSubmit,
  collectorId,
  collectorName,
  sourceStationId,
  sourceStationName,
  sourceStationType,
}: ReferralFormProps) {
  const { classifySymptoms, isLoading: aiLoading } = useEdgeAI();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    patientName: '',
    patientAge: '',
    patientGender: 'male' as 'male' | 'female' | 'other',
    patientPhone: '',
    patientId: `REF-${Date.now().toString(36).toUpperCase()}`,

    destinationStationId: '',
    destinationStationName: '',
    destinationStationType: 'referral-center' as 'household' | 'hip' | 'referral-center',

    chpName: '',
    chpPhone: '',
    chpEmail: '',

    initialDiagnosis: '',
    aiSuggestedCategory: '',
    aiConfidence: 0,
    reasonForReferral: '',

    modeOfTransport: 'ambulance' as ReferralV2['modeOfTransport'],
    transportNotes: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'emergency',
    notes: '',
  });

  // When diagnosis text changes, trigger AI classification
  const handleDiagnosisChange = async (text: string) => {
    setForm(prev => ({ ...prev, initialDiagnosis: text }));
    if (text.length > 10) {
      const result = await classifySymptoms(text);
      if (result) {
        setForm(prev => ({
          ...prev,
          aiSuggestedCategory: result.category,
          aiConfidence: result.confidence,
          urgency: result.urgency,
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        patientId: form.patientId,
        patientName: form.patientName,
        patientAge: parseInt(form.patientAge) || 0,
        patientGender: form.patientGender,
        patientPhone: form.patientPhone,

        sourceStationId,
        sourceStationName,
        sourceStationType,
        sourceCollectorId: collectorId,
        sourceCollectorName: collectorName,

        destinationStationId: form.destinationStationId,
        destinationStationName: form.destinationStationName,
        destinationStationType: form.destinationStationType,

        chpName: form.chpName || undefined,
        chpPhone: form.chpPhone || undefined,
        chpEmail: form.chpEmail || undefined,

        initialDiagnosis: form.initialDiagnosis,
        aiSuggestedCategory: form.aiSuggestedCategory || undefined,
        aiConfidence: form.aiConfidence || undefined,
        reasonForReferral: form.reasonForReferral,

        modeOfTransport: form.modeOfTransport,
        transportNotes: form.transportNotes || undefined,
        urgency: form.urgency,
        notes: form.notes || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Patient Info */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <User className="w-4 h-4" />
          Patient Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Registration No.</label>
            <input type="text" value={form.patientId} readOnly className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
            <input type="text" required value={form.patientName} onChange={e => setForm(p => ({ ...p, patientName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-border text-sm" placeholder="e.g., Mary Akinyi" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Age *</label>
            <input type="number" required min={0} max={150} value={form.patientAge} onChange={e => setForm(p => ({ ...p, patientAge: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-border text-sm" placeholder="Years" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Gender *</label>
            <select value={form.patientGender} onChange={e => setForm(p => ({ ...p, patientGender: e.target.value as 'male' | 'female' | 'other' }))} className="w-full px-3 py-2 rounded-lg border border-border text-sm">
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone *</label>
            <input type="tel" required value={form.patientPhone} onChange={e => setForm(p => ({ ...p, patientPhone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-border text-sm" placeholder="2547XXXXXXXX" />
          </div>
        </div>
      </div>

      {/* Destination Station */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Destination Station
        </h3>
        <StationSelector
          value={form.destinationStationId}
          onChange={(id, name, type) => setForm(p => ({ ...p, destinationStationId: id, destinationStationName: name, destinationStationType: type }))}
          label="Refer to *"
        />
      </div>

      {/* AI-Assisted Diagnosis */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Diagnosis & Referral Reason
          {aiLoading && <span className="text-xs font-normal text-amber-600 animate-pulse">Analyzing...</span>}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Initial Diagnosis / Symptoms * (type symptoms for AI classification)
            </label>
            <textarea
              required
              rows={3}
              value={form.initialDiagnosis}
              onChange={e => handleDiagnosisChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="e.g., patient shows persistent high fever, neck stiffness, and severe headache for 3 days"
            />
          </div>

          {/* AI Result */}
          {form.aiSuggestedCategory && (
            <div className={`rounded-lg p-4 border ${URGENCY_COLORS[form.urgency]}`}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-semibold">AI Classification</span>
                <span className="text-xs opacity-70">({Math.round(form.aiConfidence * 100)}% confidence)</span>
              </div>
              <p className="text-sm font-medium">{form.aiSuggestedCategory}</p>
              <p className="text-xs mt-1 opacity-80">
                {form.urgency === 'emergency'
                  ? 'Emergency — immediate transport required'
                  : form.urgency === 'urgent'
                  ? 'Urgent — transport within 2-4 hours'
                  : 'Routine — standard referral process'}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason for Referral *</label>
            <textarea
              required
              rows={2}
              value={form.reasonForReferral}
              onChange={e => setForm(p => ({ ...p, reasonForReferral: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="Why is this patient being referred?"
            />
          </div>

          {/* Urgency Override */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Urgency *</label>
            <div className="flex gap-2">
              {(['routine', 'urgent', 'emergency'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, urgency: u }))}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    form.urgency === u
                      ? URGENCY_COLORS[u] + ' ring-1'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {u === 'emergency' && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                  {u.charAt(0).toUpperCase() + u.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transport */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <Ambulance className="w-4 h-4" />
          Mode of Transport *
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TRANSPORT_MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm(p => ({ ...p, modeOfTransport: value as ReferralV2['modeOfTransport'] }))}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-all ${
                form.modeOfTransport === value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>
        <textarea
          rows={1}
          value={form.transportNotes}
          onChange={e => setForm(p => ({ ...p, transportNotes: e.target.value }))}
          className="w-full mt-3 px-3 py-2 rounded-lg border border-border text-sm"
          placeholder="Transport notes (optional)"
        />
      </div>

      {/* CHP Assignment */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
          <Phone className="w-4 h-4" />
          Community Health Promoter (CHP) — Optional
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Assign a CHP to accompany the patient. CHPs do not have system accounts — they receive follow-up emails only.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">CHP Name</label>
            <input type="text" value={form.chpName} onChange={e => setForm(p => ({ ...p, chpName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-border text-sm" placeholder="e.g., Janet Mwagandi" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">CHP Phone</label>
            <input type="tel" value={form.chpPhone} onChange={e => setForm(p => ({ ...p, chpPhone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-border text-sm" placeholder="2547XXXXXXXX" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              <Mail className="w-3 h-3 inline mr-1" />
              CHP Email <span className="text-amber-600 font-medium">*required for follow-up</span>
            </label>
            <input type="email" value={form.chpEmail} onChange={e => setForm(p => ({ ...p, chpEmail: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-border text-sm" placeholder="chp@example.com — follow-up form will be sent here" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Additional Notes</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm"
          placeholder="Any other relevant information..."
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !form.patientName || !form.initialDiagnosis || !form.destinationStationId}
        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending Referral...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Create Referral
          </>
        )}
      </button>
    </form>
  );
}
