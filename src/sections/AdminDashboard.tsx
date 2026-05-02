import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { useHealthcareData, useUsers } from '@/hooks/useData';
import { useI18n } from '@/i18n/useI18n';
import type { User } from '@/types';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';
import NotificationBell from '@/components/NotificationBell';
import ProfileModal from '@/components/ProfileModal';
import DashboardOverview from '@/components/DashboardOverview';
import PatientManagement from '@/components/PatientManagement';
import UserManagement from '@/components/UserManagement';
import ReferralTracking from '@/components/ReferralTracking';
import ReportsAnalytics from '@/components/ReportsAnalytics';
import Settings from '@/components/Settings';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  UserCog,
  ArrowLeftRight,
  BarChart3,
  Settings as SettingsIcon,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

type AdminTab = 'dashboard' | 'patients' | 'users' | 'referrals' | 'reports' | 'settings';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const { user, logout } = useAuth();
  const { status, pendingCount, lastSyncTime, isOnline, triggerSync, needsReLogin } = useSync();
  const { dashboard, patients, medicalRecords, users } = useHealthcareData();
  const { updateUser } = useUsers();
  const { t } = useI18n();

  const handleOpenMyProfile = () => {
    if (user) setProfileUser(user);
  };

  // Listen for quick action navigation from DashboardOverview
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => {
      setActiveTab(e.detail as AdminTab);
    };
    window.addEventListener('navigateToTab', handler as any);
    return () => window.removeEventListener('navigateToTab', handler as any);
  }, []);

  const menuItems = useMemo(() => [
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'patients', label: t('sidebar.patients'), icon: Users },
    { id: 'referrals', label: t('sidebar.referrals'), icon: ArrowLeftRight },
    { id: 'reports', label: t('sidebar.reports'), icon: BarChart3 },
    { id: 'users', label: t('sidebar.users'), icon: UserCog },
    { id: 'settings', label: t('sidebar.settings'), icon: SettingsIcon },
  ], [t]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardOverview
            kpis={dashboard.kpis}
            patients={patients.patients}
            users={users.users}
          />
        );
      case 'patients':
        return <PatientManagement />;
      case 'users':
        return <UserManagement />;
      case 'referrals':
        return (
          <ReferralTracking
            kpis={dashboard.kpis}
            patients={patients.patients}
            users={users.users}
            getRecordsByPatient={medicalRecords.getRecordsByPatient}
            onUpdatePatient={patients.updatePatient}
          />
        );
      case 'reports':
        return <ReportsAnalytics />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <DashboardOverview
            kpis={dashboard.kpis}
            patients={patients.patients}
            users={users.users}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed sidebar */}
      <ResponsiveSidebar
        items={menuItems}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as AdminTab)}
        user={user}
        onLogout={logout}
        title="HealthTrack"
        subtitle="Admin Portal"
        logoImage="/brand-logo.png"
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((c) => !c)}
        onOpenProfile={handleOpenMyProfile}
      />

      {/* Profile Modal (triggered from sidebar avatar) */}
      {profileUser && (
        <ProfileModal
          user={profileUser}
          canEdit={true}
          onClose={() => setProfileUser(null)}
          onSave={(data) => {
            updateUser(profileUser.id, data);
            // Also update localStorage auth user
            const updated = { ...profileUser, ...data };
            localStorage.setItem('healthtrack_current_user', JSON.stringify(updated));
            setProfileUser(null);
            toast.success('Profile updated successfully');
            window.location.reload();
          }}
        />
      )}

      {/* Main content */}
      <main className={`flex-1 overflow-auto pt-16 lg:pt-0 transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Re-login warning banner */}
        {needsReLogin && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Data saved locally but not synced to server.</span>
              <span className="font-semibold">Log out and log back in to sync.</span>
            </div>
            <button
              onClick={() => logout()}
              className="text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded-md hover:bg-amber-200 transition-colors font-medium"
            >
              Re-Login Now
            </button>
          </div>
        )}

        {/* Top app bar */}
        <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {menuItems.find(m => m.id === activeTab)?.label || t('sidebar.dashboard')}
            </h2>
            <div className="flex items-center gap-3">
              <SyncIndicator
                status={status}
                pendingCount={pendingCount}
                lastSyncTime={lastSyncTime}
                isOnline={isOnline}
                onSync={triggerSync}
              />
              <NotificationBell />
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="page-transition">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════ Sync Status Indicator ═══════════════════════════ */

function SyncIndicator({
  status,
  pendingCount,
  lastSyncTime,
  isOnline,
  onSync,
}: {
  status: string;
  pendingCount: number;
  lastSyncTime: string | null;
  isOnline: boolean;
  onSync: () => Promise<boolean>;
}) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    await onSync();
    setIsSyncing(false);
  };

  // Status config
  const config: Record<string, {
    icon: React.ReactNode;
    label: string;
    dotColor: string;
    bgColor: string;
    textColor: string;
  }> = {
    idle: {
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      label: pendingCount > 0 ? `${pendingCount} pending` : 'Synced',
      dotColor: 'bg-emerald-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
    },
    pulling: {
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      label: 'Pulling...',
      dotColor: 'bg-sky-500',
      bgColor: 'bg-sky-50',
      textColor: 'text-sky-700',
    },
    pushing: {
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      label: 'Pushing...',
      dotColor: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
    },
    offline: {
      icon: <CloudOff className="w-3.5 h-3.5" />,
      label: 'Offline',
      dotColor: 'bg-gray-400',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-600',
    },
    error: {
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      label: 'Sync error',
      dotColor: 'bg-rose-500',
      bgColor: 'bg-rose-50',
      textColor: 'text-rose-700',
    },
    conflict: {
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      label: 'Conflict',
      dotColor: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-700',
    },
  };

  const c = config[status] || config.idle;
  const timeAgo = lastSyncTime
    ? new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never';

  return (
    <div className="flex items-center gap-2">
      {/* Status chip */}
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium ${c.bgColor} ${c.textColor} border border-transparent`}
        title={`Last sync: ${timeAgo}${!isOnline ? ' • Working offline' : ''}`}
      >
        <span className={`w-2 h-2 rounded-full ${c.dotColor} ${status === 'pulling' || status === 'pushing' ? 'animate-pulse' : ''}`} />
        <span className="hidden sm:inline">{c.label}</span>
        {c.icon}
      </div>

      {/* Manual sync button */}
      <button
        onClick={handleSync}
        disabled={isSyncing || !isOnline}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Sync now"
      >
        <RefreshCw className={`w-4 h-4 text-gray-500 ${isSyncing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
