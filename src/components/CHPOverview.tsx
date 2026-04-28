import type { CollectorStats } from '@/types';
import { 
  Users, 
  FileText, 
  ArrowRightLeft, 
  ClipboardList,
  Calendar,
  UserPlus,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { format } from 'date-fns';

interface CollectorOverviewProps {
  stats: CollectorStats;
}

export default function CollectorOverview({ stats }: CollectorOverviewProps) {
  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Collector Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here's your activity overview.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/80 text-sm">Quick Action</p>
              <h3 className="text-xl font-bold mt-1">Register New Patient</h3>
              <p className="text-primary-foreground/80 text-sm mt-1">
                Add a new patient to the system
              </p>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <UserPlus className="w-7 h-7" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">Quick Action</p>
              <h3 className="text-xl font-bold mt-1">Add Medical Record</h3>
              <p className="text-white/80 text-sm mt-1">
                Record patient visit details
              </p>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <FileText className="w-7 h-7" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
              +5 this week
            </span>
          </div>
          <p className="kpi-value">{stats.patientsRegistered}</p>
          <p className="kpi-label">Patients Registered</p>
        </div>

        <div className="kpi-card card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
              +12 this week
            </span>
          </div>
          <p className="kpi-value">{stats.recordsEntered}</p>
          <p className="kpi-label">Records Entered</p>
        </div>

        <div className="kpi-card card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <ArrowRightLeft className="w-6 h-6 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
              Active
            </span>
          </div>
          <p className="kpi-value">{stats.referralsMade}</p>
          <p className="kpi-label">Referrals Made</p>
        </div>

        <div className="kpi-card card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-rose-600" />
            </div>
            <span className="text-xs font-medium text-rose-600 bg-rose-100 px-2 py-1 rounded-full">
              Attention
            </span>
          </div>
          <p className="kpi-value">{stats.pendingTasks}</p>
          <p className="kpi-label">Pending Tasks</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Activity */}
        <div className="chart-container">
          <h3 className="text-lg font-semibold text-foreground mb-4">Your Monthly Activity</h3>
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
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }} 
                />
                <Legend />
                <Bar dataKey="patients" name="New Patients" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="records" name="Medical Records" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Patients */}
        <div className="chart-container">
          <h3 className="text-lg font-semibold text-foreground mb-4">Recently Registered Patients</h3>
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
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="chart-container">
        <h3 className="text-lg font-semibold text-foreground mb-4">Today's Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Patient Follow-ups</p>
                <p className="text-xs text-muted-foreground">3 scheduled</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">10:00 AM</span>
                <span className="font-medium">John Smith</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">2:00 PM</span>
                <span className="font-medium">Mary Johnson</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">4:30 PM</span>
                <span className="font-medium">Robert Brown</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Activity className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-foreground">Health Screenings</p>
                <p className="text-xs text-muted-foreground">2 scheduled</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">11:30 AM</span>
                <span className="font-medium">Community Center</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">3:00 PM</span>
                <span className="font-medium">Mobile Clinic</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-foreground">Pending Tasks</p>
                <p className="text-xs text-muted-foreground">5 items</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Data Entry</span>
                <span className="font-medium text-amber-600">3 pending</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Referrals</span>
                <span className="font-medium text-amber-600">1 pending</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Reports</span>
                <span className="font-medium text-amber-600">1 pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
