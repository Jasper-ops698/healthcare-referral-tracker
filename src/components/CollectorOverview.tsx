import type { CollectorStats } from '@/types';
import {
  Users,
  FileText,
  ArrowRightLeft,
  ClipboardList,
  UserPlus,
  Activity,
  Stethoscope,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';

interface CollectorOverviewProps {
  stats: CollectorStats;
  onRegisterPatient?: () => void;
  onAddRecord?: () => void;
}

export default function CollectorOverview({ stats, onRegisterPatient, onAddRecord }: CollectorOverviewProps) {
  const hasActivity = stats.monthlyActivity && stats.monthlyActivity.length > 0;
  const hasRecentPatients = stats.recentPatients && stats.recentPatients.length > 0;

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Collector Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Your activity summary and patient overview.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={onRegisterPatient}
          className="group text-left bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 text-white cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/80 text-sm">Quick Action</p>
              <h3 className="text-xl font-bold mt-1 group-hover:underline underline-offset-2">Register New Patient</h3>
              <p className="text-primary-foreground/80 text-sm mt-1">
                Add a new patient to the system
              </p>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <UserPlus className="w-7 h-7" />
            </div>
          </div>
        </button>

        <button
          onClick={onAddRecord}
          className="group text-left bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl p-6 text-white cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">Quick Action</p>
              <h3 className="text-xl font-bold mt-1 group-hover:underline underline-offset-2">Add Medical Record</h3>
              <p className="text-white/80 text-sm mt-1">
                Record patient visit details
              </p>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <FileText className="w-7 h-7" />
            </div>
          </div>
        </button>
      </div>

      {/* Stats Cards — Real data with clear labels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-sky-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.patientsRegistered}</p>
          <p className="text-sm text-muted-foreground mt-1">Patients Registered</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.recordsEntered}</p>
          <p className="text-sm text-muted-foreground mt-1">Records Entered</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.referralsMade}</p>
          <p className="text-sm text-muted-foreground mt-1">Patients Referred</p>
          <p className="text-xs text-muted-foreground/60">Total with referral stages</p>
        </div>

        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-rose-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.pendingTasks}</p>
          <p className="text-sm text-muted-foreground mt-1">Need Your Action</p>
          <p className="text-xs text-muted-foreground/60">Screening or referral needed</p>
        </div>
      </div>

      {/* Charts + Recent Patients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Activity */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-4">Your Monthly Activity</h3>
          {hasActivity ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="patients" name="New Patients" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="records" name="Medical Records" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex flex-col items-center justify-center text-muted-foreground">
              <Activity className="w-10 h-10 mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs mt-1">Register patients to see your monthly activity.</p>
            </div>
          )}
        </div>

        {/* Recent Patients */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-4">Recently Registered Patients</h3>
          {hasRecentPatients ? (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {stats.recentPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {patient.firstName} {patient.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {patient.patientId} • {format(patient.registrationDate, 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    patient.referralStatus === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : patient.referralStatus === 'referred'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {patient.referralStatus.replace('-', ' ')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-72 flex flex-col items-center justify-center text-muted-foreground">
              <Users className="w-10 h-10 mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium">No patients yet</p>
              <p className="text-xs mt-1">Your recently registered patients will appear here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Task Summary — Breakdown of what needs collector attention */}
      <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-4">Task Summary — Your Action Items</h3>

        {stats.pendingTasks > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.taskBreakdown.needsScreening > 0 && (
              <button
                onClick={onAddRecord}
                className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-blue-800">{stats.taskBreakdown.needsScreening} need screening</p>
                  <p className="text-xs text-blue-600 mt-0.5">Add medical record</p>
                </div>
              </button>
            )}

            {stats.taskBreakdown.needsReferral > 0 && (
              <button
                onClick={onAddRecord}
                className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-800">{stats.taskBreakdown.needsReferral} need referral</p>
                  <p className="text-xs text-amber-600 mt-0.5">Decide if refer to higher facility</p>
                </div>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-emerald-800">All caught up</p>
              <p className="text-xs text-emerald-600">No patients need your attention right now.</p>
            </div>
          </div>
        )}

        {/* Additional status rows — informational, not actionable */}
        {(stats.taskBreakdown.waitingOnAdmin > 0 || stats.taskBreakdown.inTreatment > 0 || stats.taskBreakdown.completed > 0) && (
          <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-3 gap-3">
            {stats.taskBreakdown.waitingOnAdmin > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-xs text-muted-foreground">{stats.taskBreakdown.waitingOnAdmin} with admin</span>
              </div>
            )}
            {stats.taskBreakdown.inTreatment > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-pink-400" />
                <span className="text-xs text-muted-foreground">{stats.taskBreakdown.inTreatment} in treatment</span>
              </div>
            )}
            {stats.taskBreakdown.completed > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-muted-foreground">{stats.taskBreakdown.completed} completed</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
