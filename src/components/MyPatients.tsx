import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useMedicalRecords, useUsers } from '@/hooks/useData';
import type { Patient, MedicalRecord } from '@/types';
import {
  Search,
  User,
  Phone,
  FileText,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  Stethoscope,
  Thermometer,
  Heart,
  Wind,
  Droplets,
  Weight,
  Ruler,
  Activity,
  Pill,
  FlaskConical,
  ClipboardList,
  AlertTriangle,
  Clock,
  ArrowRightLeft,
  Ambulance,
  UserCheck,
  Gauge,
} from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';

interface MyPatientsProps {
  patients: Patient[];
  onAddRecord?: (patientId: string) => void;
}

const referralStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  registered: { label: 'Registered', bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  screened: { label: 'Screened', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  referred: { label: 'Referred', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  accepted: { label: 'Accepted', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  'in-treatment': { label: 'In Treatment', bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

function StatusBadge({ status }: { status: string }) {
  const config = referralStatusConfig[status] || referralStatusConfig.registered;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICAL RECORD CARD — Rich clinical context for each visit
// ═══════════════════════════════════════════════════════════════════════════

interface MedicalRecordCardProps {
  record: MedicalRecord;
  users: import('@/types').User[];
  patientAllergies?: string[];
  patientConditions?: string[];
}

function MedicalRecordCard({ record, users, patientAllergies, patientConditions }: MedicalRecordCardProps) {
  // Resolve recorder name
  const recorder = users.find((u) => u.id === record.recordedBy);
  const recorderName = recorder
    ? `${recorder.firstName} ${recorder.lastName}`
    : record.recordedBy?.startsWith('local_')
      ? 'Local Collector'
      : record.recordedBy || 'Unknown';

  // Visit type badge styling
  const visitTypeConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    emergency: { bg: 'bg-red-100', text: 'text-red-700', icon: <AlertTriangle className="w-3 h-3" /> },
    referral: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <ArrowRightLeft className="w-3 h-3" /> },
    'follow-up': { bg: 'bg-blue-100', text: 'text-blue-700', icon: <Clock className="w-3 h-3" /> },
    routine: { bg: 'bg-gray-100', text: 'text-gray-700', icon: <Stethoscope className="w-3 h-3" /> },
  };
  const vt = visitTypeConfig[record.visitType] || visitTypeConfig.routine;

  // Pain level color
  const painColor =
    !record.painLevel || record.painLevel === 0
      ? 'bg-gray-200'
      : record.painLevel <= 3
        ? 'bg-green-500'
        : record.painLevel <= 6
          ? 'bg-amber-500'
          : 'bg-red-500';

  // Referral urgency
  const urgencyConfig: Record<string, { bg: string; text: string }> = {
    emergency: { bg: 'bg-red-100', text: 'text-red-700' },
    urgent: { bg: 'bg-amber-100', text: 'text-amber-700' },
    routine: { bg: 'bg-blue-100', text: 'text-blue-700' },
  };

  const vs = record.vitalSigns;
  const exam = record.physicalExamination;

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      {/* ── Header: Visit type + Date + Recorder ── */}
      <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${vt.bg} ${vt.text}`}>
            {vt.icon}
            {record.visitType}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(record.recordedAt), 'MMM d, yyyy · h:mm a')}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          By {recorderName}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Chief Complaint ── */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <Stethoscope className="w-3 h-3" /> Chief Complaint
          </p>
          <p className="text-sm font-semibold text-foreground">{record.chiefComplaint}</p>
          {record.symptomDuration && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Duration: {record.symptomDuration}</p>
          )}
        </div>

        {/* ── Symptoms ── */}
        {record.symptoms && record.symptoms.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Symptoms
            </p>
            <div className="flex flex-wrap gap-1.5">
              {record.symptoms.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Pain Level ── */}
        {record.painLevel !== undefined && record.painLevel > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pain Level</span>
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[120px]">
              <div
                className={`h-full rounded-full ${painColor} transition-all`}
                style={{ width: `${(record.painLevel / 10) * 100}%` }}
              />
            </div>
            <span className={`text-xs font-bold ${record.painLevel >= 7 ? 'text-red-600' : record.painLevel >= 4 ? 'text-amber-600' : 'text-green-600'}`}>
              {record.painLevel}/10
            </span>
          </div>
        )}

        {/* ── Vital Signs ── */}
        {vs && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Vital Signs
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {vs.temperature !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-rose-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Temp</p>
                    <p className="text-xs font-semibold">{vs.temperature}°C</p>
                  </div>
                </div>
              )}
              {vs.bloodPressureSystolic !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">BP</p>
                    <p className="text-xs font-semibold">{vs.bloodPressureSystolic}/{vs.bloodPressureDiastolic}</p>
                  </div>
                </div>
              )}
              {vs.heartRate !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">HR</p>
                    <p className="text-xs font-semibold">{vs.heartRate} <span className="text-[10px] font-normal">bpm</span></p>
                  </div>
                </div>
              )}
              {vs.respiratoryRate !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-sky-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">RR</p>
                    <p className="text-xs font-semibold">{vs.respiratoryRate} <span className="text-[10px] font-normal">/min</span></p>
                  </div>
                </div>
              )}
              {vs.oxygenSaturation !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-sky-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">SpO₂</p>
                    <p className="text-xs font-semibold">{vs.oxygenSaturation}%</p>
                  </div>
                </div>
              )}
              {vs.weight !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Weight className="w-3.5 h-3.5 text-emerald-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Weight</p>
                    <p className="text-xs font-semibold">{vs.weight} {vs.weightUnit}</p>
                  </div>
                </div>
              )}
              {vs.height !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-emerald-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Height</p>
                    <p className="text-xs font-semibold">{vs.height} {vs.heightUnit}</p>
                  </div>
                </div>
              )}
              {vs.bmi !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-violet-500" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">BMI</p>
                    <p className="text-xs font-semibold">{vs.bmi.toFixed(1)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Physical Examination ── */}
        {exam && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <ClipboardList className="w-3 h-3" /> Physical Examination
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              {exam.generalAppearance && (
                <p><span className="text-muted-foreground">General:</span> <span className="text-foreground font-medium">{exam.generalAppearance}</span></p>
              )}
              {exam.skin && (
                <p><span className="text-muted-foreground">Skin:</span> <span className="text-foreground font-medium">{exam.skin}</span></p>
              )}
              {exam.headNeck && (
                <p><span className="text-muted-foreground">Head/Neck:</span> <span className="text-foreground font-medium">{exam.headNeck}</span></p>
              )}
              {exam.cardiovascular && (
                <p><span className="text-muted-foreground">Cardiovascular:</span> <span className="text-foreground font-medium">{exam.cardiovascular}</span></p>
              )}
              {exam.respiratory && (
                <p><span className="text-muted-foreground">Respiratory:</span> <span className="text-foreground font-medium">{exam.respiratory}</span></p>
              )}
              {exam.abdominal && (
                <p><span className="text-muted-foreground">Abdominal:</span> <span className="text-foreground font-medium">{exam.abdominal}</span></p>
              )}
              {exam.musculoskeletal && (
                <p><span className="text-muted-foreground">Musculoskeletal:</span> <span className="text-foreground font-medium">{exam.musculoskeletal}</span></p>
              )}
              {exam.neurological && (
                <p><span className="text-muted-foreground">Neurological:</span> <span className="text-foreground font-medium">{exam.neurological}</span></p>
              )}
              {exam.otherFindings && (
                <p className="sm:col-span-2"><span className="text-muted-foreground">Other:</span> <span className="text-foreground font-medium">{exam.otherFindings}</span></p>
              )}
            </div>
          </div>
        )}

        {/* ── Diagnosis ── */}
        {record.preliminaryDiagnosis && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide mb-0.5">Preliminary Diagnosis</p>
            <p className="text-sm font-semibold text-blue-900">{record.preliminaryDiagnosis}</p>
            {record.icd10Code && (
              <p className="text-[10px] text-blue-600 mt-0.5 font-mono">ICD-10: {record.icd10Code}</p>
            )}
          </div>
        )}

        {/* ── Medications ── */}
        {record.medications && record.medications.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Pill className="w-3 h-3" /> Medications Prescribed
            </p>
            <div className="space-y-1.5">
              {record.medications.map((med) => (
                <div key={med.id} className="flex items-start gap-2 bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                  <Pill className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-900">{med.name}</p>
                    <p className="text-[11px] text-emerald-700">
                      {med.dosage} · {med.frequency} · {med.duration}
                    </p>
                    {med.instructions && (
                      <p className="text-[10px] text-emerald-600 mt-0.5 italic">{med.instructions}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Procedures ── */}
        {record.procedures && record.procedures.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Procedures</p>
            <div className="flex flex-wrap gap-1.5">
              {record.procedures.map((p, i) => (
                <span key={i} className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-[11px] font-medium">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Tests Ordered ── */}
        {record.testsOrdered && record.testsOrdered.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <FlaskConical className="w-3 h-3" /> Tests Ordered
            </p>
            <div className="space-y-1">
              {record.testsOrdered.map((test) => (
                <div key={test.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <FlaskConical className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{test.testName}</p>
                      <p className="text-[10px] text-muted-foreground">{test.testCategory}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      test.urgency === 'stat' ? 'bg-red-100 text-red-700' :
                      test.urgency === 'urgent' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {test.urgency}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">{test.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Clinical Notes ── */}
        {record.clinicalNotes && (
          <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
            <p className="text-[10px] font-semibold text-yellow-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              <ClipboardList className="w-3 h-3" /> Clinical Notes
            </p>
            <p className="text-xs text-yellow-900 whitespace-pre-wrap">{record.clinicalNotes}</p>
          </div>
        )}

        {/* ── Follow-up Instructions ── */}
        {record.followUpInstructions && (
          <div className="bg-teal-50 rounded-lg p-3 border border-teal-100">
            <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Follow-up
            </p>
            <p className="text-xs text-teal-900">{record.followUpInstructions}</p>
          </div>
        )}

        {/* ── Referrals ── */}
        {record.referrals && record.referrals.length > 0 && (
          <div className="space-y-2">
            {record.referrals.map((ref) => {
              const uc = urgencyConfig[ref.urgency] || urgencyConfig.routine;
              return (
                <div key={ref.id} className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                      <Ambulance className="w-3 h-3" /> Referral
                    </p>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${uc.bg} ${uc.text}`}>
                      {ref.urgency}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-amber-900 mb-1">
                    <span className="font-medium">{ref.fromFacility}</span>
                    <ArrowRightLeft className="w-3 h-3 text-amber-600" />
                    <span className="font-medium">{ref.toFacility}</span>
                  </div>
                  {ref.toDepartment && (
                    <p className="text-[11px] text-amber-700">Dept: {ref.toDepartment}</p>
                  )}
                  <p className="text-[11px] text-amber-800 mt-1">Reason: {ref.reason}</p>
                  {ref.notes && (
                    <p className="text-[10px] text-amber-600 mt-1 italic">{ref.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Patient Safety Alerts ── */}
        {(patientAllergies?.length || patientConditions?.length) ? (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-border">
            {patientAllergies && patientAllergies.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-rose-600">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-semibold">Allergies:</span>
                <span>{patientAllergies.join(', ')}</span>
              </div>
            )}
            {patientConditions && patientConditions.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-amber-600">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-semibold">Chronic:</span>
                <span>{patientConditions.join(', ')}</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function MyPatients({ patients, onAddRecord }: MyPatientsProps) {
  const { t } = useI18n();
  const { getRecordsByPatient } = useMedicalRecords();
  const { users } = useUsers();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredPatients = patients.filter((patient) =>
    `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    patient.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    patient.phone.includes(searchQuery)
  );

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const statusCounts = {
    total: patients.length,
    completed: patients.filter((p) => p.referralStatus === 'completed').length,
    inProgress: patients.filter((p) => ['referred', 'accepted', 'in-treatment'].includes(p.referralStatus)).length,
    awaiting: patients.filter((p) => ['registered', 'screened'].includes(p.referralStatus)).length,
  };

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('myPatients.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('myPatients.subtitle')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-3xl font-bold text-foreground">{statusCounts.total}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('myPatients.totalPatients')}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-3xl font-bold text-emerald-600">{statusCounts.completed}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('myPatients.completed')}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-3xl font-bold text-amber-600">{statusCounts.inProgress}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('myPatients.inProgress')}</p>
        </div>
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <p className="text-3xl font-bold text-blue-600">{statusCounts.awaiting}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('myPatients.awaitingAction')}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t('myPatients.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
        />
      </div>

      {/* Patients Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('myPatients.patientId')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('myPatients.name')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">{t('myPatients.ageGender')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">{t('myPatients.contact')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('myPatients.status')}</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">{t('myPatients.registered')}</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('myPatients.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedPatients.map((patient) => (
                <tr key={patient.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm text-muted-foreground">{patient.patientId}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-foreground text-sm">
                        {patient.firstName} {patient.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {differenceInYears(new Date(), patient.dateOfBirth)} yrs / {patient.gender.charAt(0).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" />
                      {patient.phone}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={patient.referralStatus} />
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">{format(patient.registrationDate, 'MMM d, yyyy')}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedPatient(patient)}
                        className="p-2 rounded-lg hover:bg-primary/10 transition-colors text-primary"
                        title={t('myPatients.viewDetails')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onAddRecord?.(patient.id)}
                        className="p-2 rounded-lg hover:bg-emerald-50 transition-colors text-emerald-600"
                        title={t('myPatients.addRecord')}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredPatients.length)} of {filteredPatients.length} patients
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-muted-foreground px-3">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {filteredPatients.length === 0 && (
          <div className="py-16">
            <EmptyState
              title={searchQuery ? t('myPatients.noSearchResults') : t('myPatients.noPatients')}
              description={
                searchQuery
                  ? t('myPatients.adjustSearch')
                  : t('myPatients.registerFirst')
              }
              icon="users"
              actionLabel={!searchQuery ? t('myPatients.registerPatient') : undefined}
              onAction={!searchQuery ? () => { /* navigate handled by caller */ } : undefined}
            />
          </div>
        )}
      </div>

      {/* Patient Detail Modal */}
      <Dialog open={!!selectedPatient} onOpenChange={() => setSelectedPatient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPatient && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <span className="text-lg">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                    <p className="text-sm font-normal text-muted-foreground font-mono">{selectedPatient.patientId}</p>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Referral Status:</span>
                  <StatusBadge status={selectedPatient.referralStatus} />
                </div>

                {/* Basic Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-xs uppercase tracking-wide">Age</span>
                    </div>
                    <p className="font-semibold text-foreground">{differenceInYears(new Date(), selectedPatient.dateOfBirth)} years</p>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-xs uppercase tracking-wide">Gender</span>
                    </div>
                    <p className="font-semibold text-foreground capitalize">{selectedPatient.gender}</p>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Phone className="w-3.5 h-3.5" />
                      <span className="text-xs uppercase tracking-wide">Phone</span>
                    </div>
                    <p className="font-semibold text-foreground">{selectedPatient.phone}</p>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span className="text-xs uppercase tracking-wide">Blood Type</span>
                    </div>
                    <p className="font-semibold text-foreground">{selectedPatient.bloodType || 'N/A'}</p>
                  </div>
                </div>

                {/* Address */}
                <div className="bg-muted/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="text-xs uppercase tracking-wide">Address</span>
                  </div>
                  <p className="text-sm text-foreground">
                    {selectedPatient.address?.street || 'N/A'}<br />
                    {selectedPatient.address?.city || ''}{selectedPatient.address?.city && selectedPatient.address?.state ? ', ' : ''}{selectedPatient.address?.state || ''} {selectedPatient.address?.postalCode || ''}
                  </p>
                </div>

                {/* Medical Info */}
                {(selectedPatient.allergies?.length || selectedPatient.chronicConditions?.length) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
                      <div className="bg-rose-50 rounded-lg p-4 border border-rose-100">
                        <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-2">Allergies</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.allergies.map((allergy, i) => (
                            <span key={i} className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-md text-xs font-medium">
                              {allergy}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedPatient.chronicConditions && selectedPatient.chronicConditions.length > 0 && (
                      <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Chronic Conditions</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.chronicConditions.map((condition, i) => (
                            <span key={i} className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-medium">
                              {condition}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Assigned CHP */}
                {selectedPatient.assignedChpName && (
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Assigned CHP</p>
                    <p className="text-sm text-emerald-800 font-medium">{selectedPatient.assignedChpName}</p>
                  </div>
                )}

                {/* Medical Records History */}
                <div className="bg-white rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Medical Records History
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {getRecordsByPatient(selectedPatient.id).length} record(s)
                    </span>
                  </div>

                  {getRecordsByPatient(selectedPatient.id).length > 0 ? (
                    <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                      {getRecordsByPatient(selectedPatient.id)
                        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
                        .map((record) => (
                          <MedicalRecordCard
                            key={record.id}
                            record={record}
                            users={users}
                            patientAllergies={selectedPatient.allergies}
                            patientConditions={selectedPatient.chronicConditions}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-4 text-muted-foreground">
                      <FileText className="w-6 h-6 mb-2 text-muted-foreground/40" />
                      <p className="text-xs">No medical records yet</p>
                      <p className="text-[10px] mt-0.5">Click "Add Medical Record" below to create one</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-border">
                  <button
                    onClick={() => {
                      setSelectedPatient(null);
                      onAddRecord?.(selectedPatient.id);
                    }}
                    className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    {t('myPatients.addMedicalRecord')}
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
