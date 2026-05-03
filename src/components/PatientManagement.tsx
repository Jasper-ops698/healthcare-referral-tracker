import { useState } from 'react';
import { usePatients, useUsers, useMedicalRecords } from '@/hooks/useData';
import { MedicalRecordCard } from './MyPatients';
import { useI18n } from '@/i18n/useI18n';
import { useFormatDate } from '@/i18n/dateFormat';
import { useStatusConfig } from '@/i18n/statusLabels';
import type { Patient, ReferralStatus } from '@/types';
import {
  Search,
  Eye,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar,
  HeartPulse,
  AlertCircle,
} from 'lucide-react';
import { differenceInYears } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';


/* ═══════════════════════════ Patient Management ═══════════════════════════ */

const STATUS_ORDER: ReferralStatus[] = [
  'registered', 'screened', 'referred', 'accepted', 'in-treatment', 'completed', 'rejected',
];

export default function PatientManagement() {
  const { t } = useI18n();
  const formatDate = useFormatDate();
  const statusConfig = useStatusConfig();
  const { patients } = usePatients();
  const { users } = useUsers();
  const { getRecordsByPatient } = useMedicalRecords();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | 'all'>('all');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || patient.referralStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getCollectorName = (collectorId: string) => {
    const collector = users.find((u) => u.id === collectorId);
    return collector ? `${collector.firstName} ${collector.lastName}` : t('common.unknown');
  };

  const getGenderLabel = (gender: string) => {
    if (gender === 'male') return t('gender.male');
    if (gender === 'female') return t('gender.female');
    return t('gender.other');
  };

  // Quick stats
  const totalPatients = patients.length;
  const activePatients = patients.filter((p) => p.status === 'active').length;
  const todayRegistrations = patients.filter((p) => {
    const d = new Date(p.registrationDate);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  return (
    <div className="space-y-6 animate-in">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('patients.title')}</h1>
        <p className="text-gray-500 mt-1">
          {t('patients.adminSubtitle') || 'Patients registered by collectors across all facilities.'}
        </p>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <User className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalPatients}</p>
              <p className="text-sm text-gray-500">{t('patients.totalPatients')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activePatients}</p>
              <p className="text-sm text-gray-500">{t('patients.active')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{todayRegistrations}</p>
              <p className="text-sm text-gray-500">{t('patients.registeredToday')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('patients.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as ReferralStatus | 'all'); setCurrentPage(1); }}
          className="px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm text-gray-700"
        >
          <option value="all">{t('patients.allStatuses')}</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {statusConfig[status].label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Patients Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[14%]">
                  {t('patients.patientId')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[22%]">
                  {t('patients.name')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[10%]">
                  {t('patients.ageGender')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[14%]">
                  {t('patients.contact')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[12%]">
                  {t('patients.status')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[14%]">
                  {t('patients.registeredBy')}
                </th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-700 uppercase text-xs tracking-wider w-[10%]">
                  {t('patients.date')}
                </th>
                <th className="w-[4%] px-4 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedPatients.map((patient) => {
                const cfg = statusConfig[patient.referralStatus];
                return (
                  <tr key={patient.id} className="group hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-500">
                      {patient.patientId}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-teal-600" />
                        </div>
                        <span className="font-medium text-gray-900">
                          {patient.firstName} {patient.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {differenceInYears(new Date(), new Date(patient.dateOfBirth))} {t('patients.years')} / <span className="capitalize">{getGenderLabel(patient.gender)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{patient.phone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 text-xs">
                      {getCollectorName(patient.registeredBy)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs">
                      {formatDate(patient.registrationDate, 'short')}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => setSelectedPatient(patient)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-teal-600"
                        title={t('patients.viewDetails')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              {t('pagination.showing')} {(currentPage - 1) * itemsPerPage + 1} {t('pagination.to')} {Math.min(currentPage * itemsPerPage, filteredPatients.length)} {t('pagination.of')} {filteredPatients.length} {t('pagination.patients')}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-sm text-gray-500 px-2">
                {t('pagination.page')} {currentPage} {t('pagination.pages')} {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredPatients.length === 0 && (
          <div className="p-12 text-center">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">
              {searchQuery ? t('patients.noMatch') : t('patients.noPatients')}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {searchQuery ? t('patients.tryAdjusting') : t('patients.collectorsWillRegister')}
            </p>
          </div>
        )}
      </div>

      {/* ── Patient Detail Modal ── */}
      <Dialog open={!!selectedPatient} onOpenChange={() => setSelectedPatient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPatient && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-lg">
                  <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center">
                    <User className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <span className="font-bold">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                    <p className="text-sm font-normal text-gray-500">{selectedPatient.patientId}</p>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <PatientDetailView
                patient={selectedPatient}
                collectorName={getCollectorName(selectedPatient.registeredBy)}
                records={getRecordsByPatient(selectedPatient.id)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════ Detail View ═══════════════════════════ */

interface PatientDetailViewProps {
  patient: Patient;
  collectorName: string;
  records: any[];
}

function PatientDetailView({ patient, collectorName, records }: PatientDetailViewProps) {
  const { t } = useI18n();
  const formatDate = useFormatDate();
  const statusConfig = useStatusConfig();
  const { users } = useUsers();
  const cfg = statusConfig[patient.referralStatus];

  const getGenderLabel = (gender: string) => {
    if (gender === 'male') return t('gender.male');
    if (gender === 'female') return t('gender.female');
    return t('gender.other');
  };

  return (
    <div className="space-y-6 mt-2">
      {/* Status badges */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
          patient.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
        }`}>
          {patient.status === 'active' ? t('common.active') : t('common.inactive')}
        </span>
      </div>

      {/* Personal Info */}
      <Section title={t('patients.personalInfo')} icon={<User className="w-4 h-4" />}>
        <Field label={t('patients.fullName')} value={`${patient.firstName} ${patient.lastName}`} />
        <Field label={t('patients.dateOfBirth')} value={formatDate(patient.dateOfBirth, 'long')} />
        <Field label={t('patients.age')} value={`${differenceInYears(new Date(), new Date(patient.dateOfBirth))} ${t('patients.years')}`} />
        <Field label={t('patients.gender')} value={getGenderLabel(patient.gender)} />
        <Field label={t('patients.bloodType')} value={patient.bloodType || '—'} />
      </Section>

      {/* Contact */}
      <Section title={t('patients.contactInfo')} icon={<Phone className="w-4 h-4" />}>
        <Field label={t('patients.phone')} value={patient.phone} />
        <Field label={t('patients.email')} value={patient.email || '—'} />
        <Field
          label={t('patients.address')}
          value={
            <span>
              {patient.address?.street || '—'}<br />
              {patient.address?.city || ''}{patient.address?.state ? `, ${patient.address.state}` : ''}
            </span>
          }
        />
      </Section>

      {/* Emergency */}
      {patient.emergencyContact && (
        <Section title={t('patients.emergencyContact')} icon={<AlertCircle className="w-4 h-4" />}>
          <Field label={t('patients.fullName')} value={patient.emergencyContact.name} />
          <Field label={t('patients.relationship')} value={patient.emergencyContact.relationship} />
          <Field label={t('patients.phone')} value={patient.emergencyContact.phone} />
        </Section>
      )}

      {/* Medical */}
      <Section title={t('patients.medicalInfo')} icon={<FileText className="w-4 h-4" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('patients.allergies')}</span>
            {patient.allergies && patient.allergies.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {patient.allergies.map((allergy, i) => (
                  <span key={i} className="px-2 py-1 bg-rose-100 text-rose-700 rounded-md text-xs font-medium">
                    {allergy}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 mt-1">{t('patients.noAllergies')}</p>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('patients.chronicConditions')}</span>
            {patient.chronicConditions && patient.chronicConditions.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {patient.chronicConditions.map((condition, i) => (
                  <span key={i} className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-medium">
                    {condition}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 mt-1">{t('patients.noConditions')}</p>
            )}
          </div>
        </div>
      </Section>

      {/* Insurance */}
      {patient.insuranceInfo && (
        <Section title={t('patients.insurance')} icon={<FileText className="w-4 h-4" />}>
          <Field label={t('patients.provider')} value={patient.insuranceInfo.provider} />
          <Field label={t('patients.policyNumber')} value={patient.insuranceInfo.policyNumber} />
          {patient.insuranceInfo.groupNumber && (
            <Field label={t('patients.groupNumber')} value={patient.insuranceInfo.groupNumber} />
          )}
        </Section>
      )}

      {/* Registration */}
      <Section title={t('patients.registrationDetails')} icon={<Calendar className="w-4 h-4" />}>
        <Field label={t('patients.registeredBy')} value={collectorName} />
        <Field label={t('patients.registrationDate')} value={formatDate(patient.registrationDate, 'long')} />
        <Field label={t('patients.lastUpdated')} value={formatDate(patient.lastUpdated, 'long')} />
        <Field label={t('patients.medicalRecords')} value={`${records.length} ${records.length === 1 ? t('patients.record_one') : t('patients.record_other')}`} />
      </Section>

      {/* Medical Records History */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Medical Records History
          </p>
          <span className="text-xs text-muted-foreground">
            {records.length} record(s)
          </span>
        </div>

        {records.length > 0 ? (
          <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
            {records
              .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
              .map((record) => (
                <MedicalRecordCard
                  key={record.id}
                  record={record}
                  users={users}
                  patientAllergies={patient.allergies}
                  patientConditions={patient.chronicConditions}
                />
              ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 text-muted-foreground">
            <FileText className="w-6 h-6 mb-2 text-muted-foreground/40" />
            <p className="text-xs">No medical records yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-gray-700">
        <span className="text-gray-400">{icon}</span>
        <h4 className="text-sm font-bold uppercase tracking-wide">{title}</h4>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}
