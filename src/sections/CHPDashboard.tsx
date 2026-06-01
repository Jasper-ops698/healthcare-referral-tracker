import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { useUsers } from '@/hooks/useData';
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
  const { user, logout } = useAuth();
  console.log(`[CollectorDashboard] MOUNTED — user=${user?.email}, role=${user?.role}`);
  const [activeTab, setActiveTab] = useState<CollectorTab>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const { status, pendingCount, isOnline, triggerSync, needsReLogin } = useSync();

  // Phase C: Follow-up referral state (pre-populated from CHP alert)
  const [followUpData, setFollowUpData] = useState<Record<string, unknown> | null>(null);

  const { updateUser } = useUsers();
  const { t } = useI18n();

  const handleOpenMyProfile = () => {
    if (user) setProfileUser(user);
  };

  // Get station info from user
  const stationId = user?.stationId || user?.assignedFacility || 'personal';
  const stationName = user?.stationName || user?.assignedFacility || 'My Station';
  const stationType = user?.stationType || 'household';
  const collectorId = user?.id || '';
  const collectorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

  const menuItems = useMemo(() => [
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'visits', label: t('sidebar.dailyVisits'), icon: Users },
    { id: 'counter', label: t('sidebar.counterReferral'), icon: ClipboardList },
    { id: 'referrals', label: t('sidebar.sendReferral'), icon: Send },
    { id: 'profile', label: t('sidebar.profile'), icon: UserCircle },
    { id: 'settings', label: t('sidebar.settings'), icon: SettingsIcon },
  ], [t, stationType]);



  const handleCreateReferral = async (referral: Partial<import('@/types').ReferralV2>) => {
    // Phase C: Include follow-up fields if present
    const payload = followUpData
      ? { ...referral, ...followUpData }
      : referral;
    const result = await createReferralV2(payload as Record<string, unknown>);
    if (result.success) {
      toast.success(`Referral created for ${referral.patientName}`);
      setFollowUpData(null); // Clear follow-up data after creation
      setActiveTab('dashboard');
    } else {
      toast.error(result.error?.toString() || 'Failed to create referral');
    }
  };

  // Phase C: Open referral form with pre-populated follow-up data from CHP alert
  const handleCreateFollowUpReferral = (data: {
    patientName: string;
    patientAge?: number;
    patientGender?: string;
    patientPhone?: string;
    initialDiagnosis: string;
    reasonForReferral: string;
    urgency?: string;
    previousReferralId?: string;
    chpAlertId?: string;
    notes?: string;
  }) => {
    setFollowUpData({
      referralType: 'follow-up',
      previousReferralId: data.previousReferralId,
      chpAlertId: data.chpAlertId,
      patientName: data.patientName,
      patientAge: data.patientAge || 0,
      patientGender: data.patientGender || 'other',
      patientPhone: data.patientPhone || '',
      initialDiagnosis: data.initialDiagnosis,
      reasonForReferral: data.reasonForReferral,
      urgency: data.urgency || 'urgent',
      notes: data.notes || '',
    });
    setActiveTab('referrals');
  };



  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <CollectorOverview
            stationId={stationId}
            stationName={stationName}
            collectorId={collectorId}
            onLogVisits={() => setActiveTab('visits')}
            onSendReferral={() => setActiveTab('referrals')}
            onCounterReferral={() => setActiveTab('counter')}
            onCreateFollowUpReferral={handleCreateFollowUpReferral}
          />
        );
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
          <div className="w-full">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">
                {followUpData ? 'Create Follow-up Referral' : 'Create Patient Referral'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {followUpData
                  ? 'Patient referred back for follow-up care based on CHP observation'
                  : `From ${stationName} to a referral center`}
              </p>
              {followUpData && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
                  <AlertTriangle className="w-3 h-3" /> Follow-up from CHP alert
                </span>
              )}
            </div>
            <ReferralForm
              onSubmit={handleCreateReferral}
              collectorId={collectorId}
              collectorName={collectorName}
              sourceStationId={stationId}
              sourceStationName={stationName}
              sourceStationType={stationType as 'household' | 'hip' | 'referral-center'}
              followUpData={followUpData || undefined}
            />
          </div>
        );
      case 'profile':
        return <CHPProfile />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <CollectorOverview
            stationId={stationId}
            stationName={stationName}
            collectorId={collectorId}
            onLogVisits={() => setActiveTab('visits')}
            onSendReferral={() => setActiveTab('referrals')}
            onCounterReferral={() => setActiveTab('counter')}
          />
        );
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
