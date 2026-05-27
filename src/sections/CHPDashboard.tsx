import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { useHealthcareData, useUsers } from '@/hooks/useData';
import { useI18n } from '@/i18n/useI18n';
import type { User } from '@/types';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';
import NotificationBell from '@/components/NotificationBell';
import ProfileModal from '@/components/ProfileModal';
import CollectorOverview from '@/components/CollectorOverview';
import DailyVisitLog from '@/components/DailyVisitLog';
import CounterReferralView from '@/components/CounterReferralView';
import CHPProfile from '@/components/CHPProfile';
import Settings from '@/components/Settings';
import ReferralForm from '@/components/ReferralForm';
import { createReferralV2 } from '@/lib/apiClient';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCircle,
  Settings as SettingsIcon,
  CloudOff,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
} from 'lucide-react';

type CollectorTab = 'dashboard' | 'visits' | 'counter' | 'referrals' | 'profile' | 'settings';

/* ═══════════ Sync Status Chip ═══════════ */
function SyncStatusChip({ status, pendingCount, isOnline, onSync }: {
  status: import('@/lib/syncTypes').SyncStatus;
  pendingCount: number;
  isOnline: boolean;
  onSync: () => void;
}) {
  const config: Record<string, { icon: React.ReactNode; label: string; dot: string }> = {
    idle: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'sync.synced', dot: 'bg-emerald-500' },
    pulling: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'sync.syncing', dot: 'bg-sky-500' },
    pushing: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'sync.syncing', dot: 'bg-amber-500' },
    offline: { icon: <CloudOff className="w-3.5 h-3.5" />, label: 'sync.offline', dot: 'bg-gray-400' },
    error: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'sync.error', dot: 'bg-rose-500' },
    conflict: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'sync.error', dot: 'bg-orange-500' },
  };
  const c = config[status] || config.idle;
  const isSyncing = status === 'pulling' || status === 'pushing';

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onSync}
        disabled={isSyncing || !isOnline}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
        title="Click to sync"
      >
        <span className={`w-2 h-2 rounded-full ${c.dot} ${isSyncing ? 'animate-pulse' : ''}`} />
        <span className="capitalize">{c.label}</span>
        {c.icon}
      </button>
      {pendingCount > 0 && (
        <span 
          className="text-xs text-amber-600 font-medium cursor-help" 
          title={`${pendingCount} items saved on this device. They will sync automatically when the server is online.`}
        >
          ({pendingCount} saved)
        </span>
      )}
    </div>
  );
}

export default function CollectorDashboard() {
  const [activeTab, setActiveTab] = useState<CollectorTab>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const { user, logout } = useAuth();
  const { status, pendingCount, isOnline, triggerSync, needsReLogin } = useSync();
  const { dashboard } = useHealthcareData();
  const { updateUser } = useUsers();
  const { t } = useI18n();

  const handleOpenMyProfile = () => {
    if (user) setProfileUser(user);
  };

  // Get station info from user
  const stationId = user?.stationId || '';
  const stationName = user?.stationName || 'Unknown Station';
  const stationType = user?.stationType || 'household';
  const collectorId = user?.id || '';
  const collectorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

  const menuItems = useMemo(() => [
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'visits', label: 'Daily Visits', icon: Users },
    { id: 'counter', label: 'Counter-Referral', icon: ClipboardList },
    { id: 'referrals', label: 'Send Referral', icon: Send },
    { id: 'profile', label: 'My Profile', icon: UserCircle },
    { id: 'settings', label: t('sidebar.settings'), icon: SettingsIcon },
  ], [t, stationType]);

  const collectorStats = user ? dashboard.getCollectorStats(user.id) : null;

  const handleCreateReferral = async (referral: Partial<import('@/types').ReferralV2>) => {
    const result = await createReferralV2(referral as Record<string, unknown>);
    if (result.success) {
      toast.success(`Referral created for ${referral.patientName}`);
      setActiveTab('dashboard');
    } else {
      toast.error(result.error?.toString() || 'Failed to create referral');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return collectorStats ? (
          <CollectorOverview
            stats={collectorStats}
            onRegisterPatient={() => setActiveTab('visits')}
            onAddRecord={() => setActiveTab('counter')}
          />
        ) : null;
      case 'visits':
        return <DailyVisitLog />;
      case 'counter':
        return (
          <CounterReferralView
            stationId={stationId}
            stationName={stationName}
            collectorId={collectorId}
            collectorName={collectorName}
          />
        );
      case 'referrals':
        return (
          <div className="max-w-3xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Create Patient Referral</h2>
              <p className="text-sm text-muted-foreground">
                From {stationName} to a referral center
              </p>
            </div>
            <ReferralForm
              onSubmit={handleCreateReferral}
              collectorId={collectorId}
              collectorName={collectorName}
              sourceStationId={stationId}
              sourceStationName={stationName}
              sourceStationType={stationType as 'household' | 'hip' | 'referral-center'}
            />
          </div>
        );
      case 'profile':
        return <CHPProfile />;
      case 'settings':
        return <Settings />;
      default:
        return collectorStats ? (
          <CollectorOverview
            stats={collectorStats}
            onRegisterPatient={() => setActiveTab('visits')}
            onAddRecord={() => setActiveTab('counter')}
          />
        ) : null;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <ResponsiveSidebar
        items={menuItems}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as CollectorTab)}
        user={user}
        onLogout={logout}
        title="HealthTrack"
        subtitle="Collector"
        logoImage="/brand-logo.png"
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((c) => !c)}
        onOpenProfile={handleOpenMyProfile}
      />

      {/* Main content */}
      <main className={`flex-1 min-h-screen overflow-auto transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Re-login warning banner */}
        {needsReLogin && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Your data is saved on this device but not synced to the server.</span>
              <span className="font-semibold">Please log out and log back in to sync.</span>
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
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-border px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">
            {menuItems.find((m) => m.id === activeTab)?.label || t('sidebar.dashboard')}
          </h1>
          <div className="flex items-center gap-3">
            <SyncStatusChip
              status={status}
              pendingCount={pendingCount}
              isOnline={isOnline}
              onSync={triggerSync}
            />
            {!isOnline && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-md">
                <CloudOff className="w-3 h-3" />
                Offline
              </span>
            )}
            <NotificationBell />
          </div>
        </header>

        {/* Content */}
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="page-transition">
            {renderContent()}
          </div>
        </div>
      </main>

      {/* Profile Modal */}
      {profileUser && (
        <ProfileModal
          user={profileUser}
          onClose={() => setProfileUser(null)}
          onSave={async (data) => {
            try {
              await updateUser(profileUser.id, data);
              toast.success(t('toast.profileUpdated'));
              setProfileUser(null);
            } catch (err: any) {
              toast.error(err.message || t('toast.profileUpdateFailed'));
            }
          }}
        />
      )}
    </div>
  );
}
