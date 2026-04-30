import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import type { Patient } from '@/types';
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

export default function MyPatients({ patients, onAddRecord }: MyPatientsProps) {
  const { t } = useI18n();
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
