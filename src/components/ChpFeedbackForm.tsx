/**
 * ChpFeedbackForm — Public form for CHPs to submit patient recovery updates
 *
 * Accessed via email link containing a unique token. No login required.
 * The token is validated against the counter-referral record.
 */

import { useState, useEffect } from 'react';
import { HeartPulse, Activity, AlertTriangle, Send, Loader2, CheckCircle, ClipboardCheck } from 'lucide-react';
import type { RecoveryStatus } from '@/types';

interface ChpFeedbackFormProps {
  token: string;
}

const RECOVERY_OPTIONS: { value: RecoveryStatus; label: string; color: string }[] = [
  { value: 'fully-recovered', label: 'Fully Recovered', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'partially-recovered', label: 'Partially Recovered', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'still-unwell', label: 'Still Unwell', color: 'bg-red-100 text-red-700 border-red-300' },
];

export default function ChpFeedbackForm({ token }: ChpFeedbackFormProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [patientName, setPatientName] = useState('');
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [chpName, setChpName] = useState('');
  const [alreadyResponded, setAlreadyResponded] = useState(false);

  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('partially-recovered');
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadFormData();
  }, [token]);

  const loadFormData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/counter-referrals/chp-form/${token}`);
      const result = await res.json();
      if (result.success) {
        const d = result.data;
        setPatientName(d.patientName);
        setFinalDiagnosis(d.finalDiagnosis);
        setFollowUpInstructions(d.followUpInstructions);
        setChpName(d.chpName);
        setAlreadyResponded(d.alreadyResponded);
        if (d.alreadyResponded) {
          setSubmitted(true);
        }
      } else {
        setError(result.error || 'Invalid or expired link');
      }
    } catch {
      setError('Failed to load form. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/counter-referrals/chp-form/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryStatus, recoveryNotes }),
      });
      const result = await res.json();
      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error || 'Submission failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-700 mb-2">Link Error</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-emerald-700 mb-2">
            {alreadyResponded ? 'Response Already Recorded' : 'Update Submitted'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {alreadyResponded
              ? `A recovery update for ${patientName} has already been submitted.`
              : `Thank you. The recovery update for ${patientName} has been recorded successfully.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ClipboardCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Patient Recovery Update</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submit follow-up information for a patient in your community
          </p>
        </div>

        {/* Patient Card */}
        <div className="bg-white rounded-xl border border-border p-4 mb-4 shadow-sm">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Patient Information</h3>
          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">{patientName}</span></p>
            <p><span className="text-muted-foreground">Final Diagnosis:</span> <span className="font-medium text-amber-700">{finalDiagnosis}</span></p>
            <p><span className="text-muted-foreground">CHP:</span> <span className="font-medium">{chpName}</span></p>
          </div>
          {followUpInstructions && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs font-medium text-blue-800 mb-1">Follow-up Instructions from Hospital</p>
              <p className="text-xs text-blue-700">{followUpInstructions}</p>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Current Recovery Status *
          </h3>

          <div className="grid grid-cols-3 gap-2">
            {RECOVERY_OPTIONS.map(({ value, label, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRecoveryStatus(value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                  recoveryStatus === value ? color : 'border-border hover:bg-muted/50'
                }`}
              >
                <HeartPulse className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Recovery Notes</label>
            <textarea
              rows={4}
              value={recoveryNotes}
              onChange={e => setRecoveryNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="Describe the patient's current condition, any improvements or concerns, medication adherence, etc."
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Recovery Update
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          This is a secure form. Only authorized community health promoters can submit updates.
        </p>
      </div>
    </div>
  );
}
