/**
 * ChpFeedbackForm — Public form for CHPs to submit patient recovery updates
 *
 * Accessed via SMS link containing a unique token. No login required.
 * Includes: Recovery status, medication adherence, wound assessment with photo upload.
 */

import { useState, useEffect, useRef } from 'react';
import {
  HeartPulse, Activity, AlertTriangle, Send, Loader2, CheckCircle,
  ClipboardCheck, Camera, Pill, Bandage, X
} from 'lucide-react';
import type { RecoveryStatus } from '@/types';

interface ChpFeedbackFormProps {
  token: string;
}

const RECOVERY_OPTIONS: { value: RecoveryStatus; label: string; color: string }[] = [
  { value: 'fully-recovered', label: 'Fully Recovered', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'partially-recovered', label: 'Partially Recovered', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'still-unwell', label: 'Still Unwell', color: 'bg-red-100 text-red-700 border-red-300' },
];

const MEDICATION_ADHERENCE_OPTIONS = [
  { value: 'taking-regularly', label: 'Taking All Medications Regularly', desc: 'Patient follows prescription exactly as directed' },
  { value: 'taking-irregularly', label: 'Taking Medications Irregularly', desc: 'Patient sometimes misses or skips doses' },
  { value: 'not-taking', label: 'Not Taking Medications', desc: 'Patient has stopped or refuses medication' },
  { value: 'unknown', label: 'Unknown / Not Prescribed', desc: 'No medications were prescribed or CHP cannot confirm' },
];

const WOUND_HEALING_OPTIONS = [
  { value: 'healing-well', label: 'Healing Well', desc: 'Clean, dry wound with good granulation tissue', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { value: 'slow-healing', label: 'Slow Healing', desc: 'Wound improving but slower than expected', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'infected', label: 'Signs of Infection', desc: 'Redness, pus, swelling, foul odor, or warmth around wound', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'not-applicable', label: 'No Surgical Wound', desc: 'Patient did not undergo surgery — no wound to assess', color: 'text-gray-700 bg-gray-50 border-gray-200' },
];

export default function ChpFeedbackForm({ token }: ChpFeedbackFormProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [patientName, setPatientName] = useState('');
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [chpName, setChpName] = useState('');
  const [alreadyResponded, setAlreadyResponded] = useState(false);

  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('partially-recovered');
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [recoveryNotesError, setRecoveryNotesError] = useState('');

  // Medication adherence (Pharmacological Management)
  const [medicationAdherence, setMedicationAdherence] = useState('unknown');
  const [medicationNotes, setMedicationNotes] = useState('');

  // Wound assessment (Surgical Management)
  const [woundHealingProgress, setWoundHealingProgress] = useState('not-applicable');
  const [woundPhoto, setWoundPhoto] = useState<string | null>(null);
  const [woundPhotoDescription, setWoundPhotoDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showEscalationFields, setShowEscalationFields] = useState(false);
  const [needsMedicalAttention, setNeedsMedicalAttention] = useState(false);
  const [recommendedAction, setRecommendedAction] = useState('monitor');
  const [symptomsObserved, setSymptomsObserved] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadFormData();
  }, [token]);

  const loadFormData = async () => {
    setLoading(true);
    setDebugInfo(`Token: ${token?.slice(0, 16)}... | URL: ${window.location.pathname}`);
    try {
      const res = await fetch(`/api/v1/chp-feedback/${token}`);
      const result = await res.json();
      if (result.success) {
        const d = result.data;
        setPatientName(d.patientName);
        setFinalDiagnosis(d.finalDiagnosis);
        setFollowUpInstructions(d.followUpInstructions);
        setChpName(d.chpName);
        setAlreadyResponded(d.alreadyResponded);
        setShowEscalationFields(d.showEscalationFields || false);
        if (d.alreadyResponded) {
          setSubmitted(true);
        }
      } else {
        setError(result.error || 'Invalid or expired link');
        setDebugInfo(prev => `${prev} | Server error: ${result.error}`);
      }
    } catch (err: any) {
      setError('Failed to load form. Please check your internet connection.');
      setDebugInfo(prev => `${prev} | Fetch error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Photo too large. Maximum size is 2MB. Please compress or take a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setWoundPhoto(base64);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setWoundPhoto(null);
    setWoundPhotoDescription('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validateForm = (): boolean => {
    setRecoveryNotesError('');

    if (!recoveryNotes || recoveryNotes.trim().length < 10) {
      setRecoveryNotesError('Recovery notes are required (minimum 10 characters). Describe the patient\'s condition, improvements, and any concerns.');
      return false;
    }

    // Require wound photo if wound healing is being assessed (not "not-applicable")
    if (woundHealingProgress !== 'not-applicable' && !woundPhoto) {
      setError('Please upload a photo of the surgical wound for healing assessment.');
      return false;
    }

    if (showEscalationFields && !symptomsObserved.trim()) {
      setError('Symptoms observed are required.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/chp-feedback/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoveryStatus,
          recoveryNotes,
          needsMedicalAttention,
          recommendedAction,
          symptomsObserved,
          medicationAdherence,
          woundHealingProgress,
          woundPhotoUrl: woundPhoto,
          woundPhotoDescription,
        }),
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Loading form...</p>
        <p className="text-xs text-slate-400 mt-2 font-mono break-all">{debugInfo}</p>
      </div>
    );
  }

  if (error && !submitted && !submitting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-700 mb-2">Link Error</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <p className="text-xs text-slate-400 font-mono break-all bg-slate-100 p-2 rounded">{debugInfo}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
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
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border p-5 shadow-sm space-y-6">

          {/* ─── SECTION 1: Recovery Status ─── */}
          <div className="space-y-3">
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
          </div>

          {/* ─── SECTION 2: Recovery Notes (REQUIRED) ─── */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              Recovery Notes *
              <span className="text-[10px] font-normal text-red-500">(Required — min 10 characters)</span>
            </label>
            <textarea
              rows={4}
              value={recoveryNotes}
              onChange={e => { setRecoveryNotes(e.target.value); setRecoveryNotesError(''); }}
              className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                recoveryNotesError ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500/20' : 'border-border focus:border-primary focus:ring-primary/20'
              }`}
              placeholder="Describe the patient's current condition, improvements or concerns, appetite, activity level, pain level, and any changes since discharge..."
              required
            />
            {recoveryNotesError && (
              <p className="text-xs text-red-600 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                {recoveryNotesError}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {recoveryNotes.trim().length}/500 characters (minimum 10)
            </p>
          </div>

          {/* ─── SECTION 3: Pharmacological Management ─── */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Pill className="w-4 h-4 text-primary" />
              Medication Adherence
              <span className="text-[10px] font-normal text-muted-foreground">(Pharmacological Management)</span>
            </h3>

            <div className="space-y-2">
              {MEDICATION_ADHERENCE_OPTIONS.map(({ value, label, desc }) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    medicationAdherence === value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="medicationAdherence"
                    value={value}
                    checked={medicationAdherence === value}
                    onChange={e => setMedicationAdherence(e.target.value)}
                    className="mt-0.5 w-4 h-4 text-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <textarea
              rows={2}
              value={medicationNotes}
              onChange={e => setMedicationNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="Optional: Notes about medications — names, dosages, side effects, etc."
            />
          </div>

          {/* ─── SECTION 4: Surgical Management — Wound Healing ─── */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Bandage className="w-4 h-4 text-primary" />
              Wound Healing Progress
              <span className="text-[10px] font-normal text-muted-foreground">(Surgical Management)</span>
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {WOUND_HEALING_OPTIONS.map(({ value, label, desc, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWoundHealingProgress(value)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 text-left text-xs font-medium transition-all ${
                    woundHealingProgress === value ? color : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="text-[10px] opacity-80 font-normal">{desc}</span>
                </button>
              ))}
            </div>

            {/* Wound Photo Upload */}
            {woundHealingProgress !== 'not-applicable' && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Wound Photo *
                  <span className="text-[10px] font-normal text-muted-foreground">(Required for wound assessment)</span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {!woundPhoto ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-6 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center gap-2 text-slate-500 hover:border-primary hover:text-primary transition-colors"
                  >
                    <Camera className="w-8 h-8" />
                    <span className="text-sm font-medium">Take Photo of Wound</span>
                    <span className="text-[10px] text-muted-foreground">Tap to open camera — max 2MB</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <img
                        src={woundPhoto}
                        alt="Wound healing progress"
                        className="w-full rounded-lg border border-slate-200 max-h-48 object-contain bg-slate-100"
                      />
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={woundPhotoDescription}
                      onChange={e => setWoundPhotoDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border text-sm"
                      placeholder="Describe the wound: size, color, discharge, edges, surrounding skin..."
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-primary hover:underline"
                    >
                      Retake photo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── SECTION 5: Escalation Fields ─── */}
          {showEscalationFields && (
            <div className="space-y-4 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                Medical Attention Assessment
              </h3>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsMedicalAttention}
                  onChange={e => setNeedsMedicalAttention(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-primary rounded"
                />
                <div>
                  <p className="text-sm font-medium text-amber-800">Patient needs medical attention</p>
                  <p className="text-xs text-amber-600">Check this if the patient should see a doctor or return to the facility</p>
                </div>
              </label>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Recommended Action</label>
                <select
                  value={recommendedAction}
                  onChange={e => setRecommendedAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background"
                >
                  <option value="monitor">Monitor at home</option>
                  <option value="see-doctor">See a doctor</option>
                  <option value="return-to-facility">Return to facility</option>
                  <option value="emergency">Emergency — go immediately</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Symptoms Observed *</label>
                <textarea
                  rows={3}
                  value={symptomsObserved}
                  onChange={e => setSymptomsObserved(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm"
                  placeholder="What symptoms did you observe? Fever, pain, wound condition, weakness, etc."
                  required
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
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
