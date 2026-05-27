/**
 * CounterReferralForm — Create a counter-referral when patient arrives at destination
 *
 * Features:
 *   - Pulls existing referral data (patient info, initial diagnosis)
 *   - Records final diagnosis, treatment, medications, procedures
 *   - Recovery status selection with visual indicators
 *   - Follow-up instructions and warning signs for CHP
 *   - CHP assignment for community follow-up
 *   - Auto-sends email to CHP on submission
 */

import { useState } from 'react';
import {
  ClipboardCheck, Pill, Stethoscope, Calendar, AlertTriangle,
  UserCheck, Phone, Mail, Send, Loader2, ChevronDown, ChevronUp,
  HeartPulse, Syringe, Activity
} from 'lucide-react';
import type { ReferralV2, CounterReferral, RecoveryStatus } from '@/types';

interface CounterReferralFormProps {
  referral: ReferralV2;
  onSubmit: (data: Partial<CounterReferral>) => Promise<void>;
  collectorId: string;
  collectorName: string;
  stationId: string;
  stationName: string;
}

const RECOVERY_OPTIONS: { value: RecoveryStatus; label: string; color: string; icon: typeof HeartPulse }[] = [
  { value: 'fully-recovered', label: 'Fully Recovered', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: HeartPulse },
  { value: 'partially-recovered', label: 'Partially Recovered', color: 'bg-amber-100 text-amber-700 border-amber-300', icon: Activity },
  { value: 'still-unwell', label: 'Still Unwell', color: 'bg-red-100 text-red-700 border-red-300', icon: AlertTriangle },
  { value: 'deceased', label: 'Deceased', color: 'bg-slate-200 text-slate-700 border-slate-400', icon: Stethoscope },
  { value: 'lost-to-follow-up', label: 'Lost to Follow-up', color: 'bg-gray-100 text-gray-600 border-gray-300', icon: UserCheck },
];

export default function CounterReferralForm({
  referral,
  onSubmit,
  collectorId,
  collectorName,
  stationId,
  stationName,
}: CounterReferralFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const [form, setForm] = useState({
    finalDiagnosis: '',
    treatmentProvided: '',
    medicationsGiven: '',
    proceduresDone: '',
    recoveryStatus: 'still-unwell' as RecoveryStatus,
    recoveryNotes: '',
    nextVisitDate: '',
    followUpInstructions: '',
    warningSigns: '',
    chpName: referral.chpName || '',
    chpPhone: referral.chpPhone || '',
    chpEmail: referral.chpEmail || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        referralId: referral.id,
        patientId: referral.patientId,
        patientName: referral.patientName,
        stationId,
        stationName,
        collectorId,
        collectorName,
        finalDiagnosis: form.finalDiagnosis,
        treatmentProvided: form.treatmentProvided,
        medicationsGiven: form.medicationsGiven || undefined,
        proceduresDone: form.proceduresDone || undefined,
        recoveryStatus: form.recoveryStatus,
        recoveryNotes: form.recoveryNotes || undefined,
        nextVisitDate: form.nextVisitDate ? new Date(form.nextVisitDate) : undefined,
        followUpInstructions: form.followUpInstructions,
        warningSigns: form.warningSigns || undefined,
        chpName: form.chpName,
        chpPhone: form.chpPhone || undefined,
        chpEmail: form.chpEmail || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Patient Summary — read-only from referral */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Original Referral Summary</span>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expanded && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Patient</p>
              <p className="font-medium">{referral.patientName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reg No</p>
              <p className="font-mono text-xs">{referral.patientId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Age / Gender</p>
              <p className="font-medium">{referral.patientAge} yrs / {referral.patientGender}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-medium">{referral.patientPhone}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Initial Diagnosis</p>
              <p className="font-medium text-amber-700">{referral.initialDiagnosis}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AI Classification</p>
              <p className="font-medium">{referral.aiSuggestedCategory || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Urgency</p>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                referral.urgency === 'emergency' ? 'bg-red-100 text-red-700' :
                referral.urgency === 'urgent' ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {referral.urgency}
              </span>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Reason for Referral</p>
              <p className="text-sm">{referral.reasonForReferral}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transport</p>
              <p className="text-sm capitalize">{referral.modeOfTransport.replace('-', ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">From</p>
              <p className="text-sm">{referral.sourceStationName}</p>
            </div>
          </div>
        )}
      </div>

      {/* Final Diagnosis & Treatment */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
          <Stethoscope className="w-4 h-4" />
          Final Diagnosis & Treatment
        </h3>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Final Diagnosis *</label>
          <textarea
            required
            rows={2}
            value={form.finalDiagnosis}
            onChange={e => setForm(p => ({ ...p, finalDiagnosis: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm"
            placeholder="e.g., Confirmed malaria with mild anemia"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Treatment Provided *</label>
          <textarea
            required
            rows={2}
            value={form.treatmentProvided}
            onChange={e => setForm(p => ({ ...p, treatmentProvided: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm"
            placeholder="e.g., Artemether-Lumefantrine course, IV fluids, hematinic supplements"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Pill className="w-3 h-3" /> Medications Given
            </label>
            <textarea
              rows={2}
              value={form.medicationsGiven}
              onChange={e => setForm(p => ({ ...p, medicationsGiven: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="List medications with dosages"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Syringe className="w-3 h-3" /> Procedures Done
            </label>
            <textarea
              rows={2}
              value={form.proceduresDone}
              onChange={e => setForm(p => ({ ...p, proceduresDone: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="e.g., RDT, hemoglobin test, IV cannulation"
            />
          </div>
        </div>
      </div>

      {/* Recovery Status */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Recovery Status *
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {RECOVERY_OPTIONS.map(({ value, label, color, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm(p => ({ ...p, recoveryStatus: value }))}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                form.recoveryStatus === value
                  ? color
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Recovery Notes</label>
          <textarea
            rows={2}
            value={form.recoveryNotes}
            onChange={e => setForm(p => ({ ...p, recoveryNotes: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm"
            placeholder="Additional notes about patient's recovery status"
          />
        </div>
      </div>

      {/* Follow-up */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Follow-up Plan
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Next Visit Date</label>
            <input
              type="date"
              value={form.nextVisitDate}
              onChange={e => setForm(p => ({ ...p, nextVisitDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Follow-up Instructions *</label>
          <textarea
            required
            rows={3}
            value={form.followUpInstructions}
            onChange={e => setForm(p => ({ ...p, followUpInstructions: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm"
            placeholder="Instructions for CHP and patient. e.g., Complete full ACT course, return if fever persists beyond 48 hours"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-500" /> Warning Signs (for CHP)
          </label>
          <textarea
            rows={2}
            value={form.warningSigns}
            onChange={e => setForm(p => ({ ...p, warningSigns: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-red-200 bg-red-50/30 text-sm"
            placeholder="Signs that require immediate re-referral. e.g., Persistent high fever, confusion, difficulty breathing"
          />
        </div>
      </div>

      {/* CHP Assignment */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2 text-blue-800">
          <UserCheck className="w-4 h-4" />
          CHP Assignment for Follow-up
        </h3>
        <p className="text-xs text-blue-600">
          The assigned CHP will receive an email with a form link to submit recovery updates.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">CHP Name *</label>
            <input
              type="text"
              required
              value={form.chpName}
              onChange={e => setForm(p => ({ ...p, chpName: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="Full name of CHP who will monitor this patient"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Phone className="w-3 h-3" /> CHP Phone
            </label>
            <input
              type="tel"
              value={form.chpPhone}
              onChange={e => setForm(p => ({ ...p, chpPhone: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="2547XXXXXXXX"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              CHP Email <span className="text-amber-600">*required to send follow-up form</span>
            </label>
            <input
              type="email"
              value={form.chpEmail}
              onChange={e => setForm(p => ({ ...p, chpEmail: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="chp@example.com — recovery update form link will be emailed here"
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !form.finalDiagnosis || !form.treatmentProvided || !form.followUpInstructions || !form.chpName}
        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating Counter-Referral...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Create Counter-Referral & Notify CHP
          </>
        )}
      </button>
    </form>
  );
}
