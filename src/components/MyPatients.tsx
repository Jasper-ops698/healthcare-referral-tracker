import { useState } from 'react';
import type { Patient } from '@/types';
import { 
  Search, 
  User, 
  Phone,
  FileText,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';

interface MyPatientsProps {
  patients: Patient[];
  onAddRecord?: (patientId: string) => void;
}

const referralStatusColors: Record<string, string> = {
  registered: 'bg-gray-100 text-gray-700',
  screened: 'bg-blue-100 text-blue-700',
  referred: 'bg-amber-100 text-amber-700',
  accepted: 'bg-purple-100 text-purple-700',
  'in-treatment': 'bg-pink-100 text-pink-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function MyPatients({ patients, onAddRecord }: MyPatientsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredPatients = patients.filter(patient => 
    `${patient.firstName} ${patient.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    patient.patientId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Patients</h1>
        <p className="text-muted-foreground mt-1">
          View and manage patients you have registered.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="kpi-card">
          <p className="text-3xl font-bold text-foreground">{patients.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Total Patients</p>
        </div>
        <div className="kpi-card">
          <p className="text-3xl font-bold text-emerald-600">
            {patients.filter(p => p.referralStatus === 'completed').length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Completed</p>
        </div>
        <div className="kpi-card">
          <p className="text-3xl font-bold text-amber-600">
            {patients.filter(p => ['referred', 'accepted', 'in-treatment'].includes(p.referralStatus)).length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">In Progress</p>
        </div>
        <div className="kpi-card">
          <p className="text-3xl font-bold text-blue-600">
            {patients.filter(p => ['registered', 'screened'].includes(p.referralStatus)).length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Awaiting Action</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search your patients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      {/* Patients Table */}
      <div className="bg-white rounded-xl shadow-sm border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-health">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Age/Gender</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPatients.map((patient) => (
                <tr key={patient.id} className="group">
                  <td className="font-mono text-sm">{patient.patientId}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">
                        {patient.firstName} {patient.lastName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm text-muted-foreground">
                      {differenceInYears(new Date(), patient.dateOfBirth)} yrs / {patient.gender.charAt(0).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" />
                      {patient.phone}
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${referralStatusColors[patient.referralStatus]}`}>
                      {patient.referralStatus.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </td>
                  <td className="text-sm text-muted-foreground">
                    {format(patient.registrationDate, 'MMM d, yyyy')}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedPatient(patient)}
                        className="p-2 rounded-lg hover:bg-muted transition-colors text-primary"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onAddRecord?.(patient.id)}
                        className="p-2 rounded-lg hover:bg-muted transition-colors text-emerald-600"
                        title="Add Record"
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredPatients.length)} of {filteredPatients.length} patients
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-muted-foreground px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {filteredPatients.length === 0 && (
          <EmptyState
            title={searchQuery ? "No patients found" : "No patients yet"}
            description={searchQuery 
              ? "Try adjusting your search terms." 
              : "You haven't registered any patients yet. Start by registering your first patient!"}
            icon="users"
            actionLabel={!searchQuery ? "Register Patient" : undefined}
            onAction={!searchQuery ? () => window.location.href = '#register' : undefined}
          />
        )}
      </div>

      {/* Patient Detail Modal */}
      <Dialog open={!!selectedPatient} onOpenChange={() => setSelectedPatient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPatient && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <span className="text-lg">{selectedPatient.firstName} {selectedPatient.lastName}</span>
                    <p className="text-sm font-normal text-muted-foreground">{selectedPatient.patientId}</p>
                  </div>
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 mt-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Age</p>
                    <p className="font-medium">{differenceInYears(new Date(), selectedPatient.dateOfBirth)} years</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Gender</p>
                    <p className="font-medium capitalize">{selectedPatient.gender}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedPatient.phone}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Blood Type</p>
                    <p className="font-medium">{selectedPatient.bloodType || 'N/A'}</p>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Referral Status</p>
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${referralStatusColors[selectedPatient.referralStatus]}`}>
                    {selectedPatient.referralStatus.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </div>

                {/* Address */}
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Address</p>
                  <p className="text-sm">
                    {selectedPatient.address.street}<br />
                    {selectedPatient.address.city}, {selectedPatient.address.state} {selectedPatient.address.postalCode}
                  </p>
                </div>

                {/* Medical Info */}
                {(selectedPatient.allergies?.length || selectedPatient.chronicConditions?.length) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Allergies</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.allergies.map((allergy, i) => (
                            <span key={i} className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs">
                              {allergy}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedPatient.chronicConditions && selectedPatient.chronicConditions.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Chronic Conditions</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.chronicConditions.map((condition, i) => (
                            <span key={i} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                              {condition}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-border">
                  <button
                    onClick={() => {
                      setSelectedPatient(null);
                      onAddRecord?.(selectedPatient.id);
                    }}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Add Medical Record
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
