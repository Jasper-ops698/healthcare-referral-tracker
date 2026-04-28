import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useHealthcareData } from '@/hooks/useData';
import { useI18n } from '@/i18n/useI18n';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';
import NotificationBell from '@/components/NotificationBell';
import CollectorOverview from '@/components/CHPOverview';
import PatientRegistration from '@/components/PatientRegistration';
import MedicalRecordsEntry from '@/components/MedicalRecordsEntry';
import MyPatients from '@/components/MyPatients';
import CollectorProfile from '@/components/CHPProfile';
import {
  LayoutDashboard,
  UserPlus,
  FileText,
  Users,
  UserCircle,
} from 'lucide-react';

type CollectorTab = 'dashboard' | 'register' | 'records' | 'patients' | 'profile';

export default function CollectorDashboard() {
  const [activeTab, setActiveTab] = useState<CollectorTab>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const { dashboard, patients } = useHealthcareData();
  const { t } = useI18n();

  const menuItems = useMemo(() => [
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'register', label: t('sidebar.register'), icon: UserPlus },
    { id: 'records', label: t('sidebar.records'), icon: FileText },
    { id: 'patients', label: t('sidebar.myPatients'), icon: Users },
    { id: 'profile', label: t('sidebar.profile'), icon: UserCircle },
  ], [t]);

  const collectorStats = user ? dashboard.getCollectorStats(user.id) : null;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return collectorStats ? <CollectorOverview stats={collectorStats} /> : null;
      case 'register':
        return <PatientRegistration onSuccess={() => setActiveTab('patients')} />;
      case 'records':
        return <MedicalRecordsEntry patients={patients.patients} />;
      case 'patients':
        return <MyPatients
          patients={patients.getPatientsByCollector(user?.id || '')}
          onAddRecord={() => setActiveTab('records')}
        />;
      case 'profile':
        return <CollectorProfile />;
      default:
        return collectorStats ? <CollectorOverview stats={collectorStats} /> : null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed sidebar */}
      <ResponsiveSidebar
        items={menuItems}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as CollectorTab)}
        user={user}
        onLogout={logout}
        title="HealthTrack"
        subtitle="Collector Portal"
        logoImage="/brand-logo.png"
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((c) => !c)}
        onOpenProfile={() => setActiveTab('profile')}
      />

      {/* Main content */}
      <main className={`flex-1 overflow-auto pt-16 lg:pt-0 transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Top app bar */}
        <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {menuItems.find(m => m.id === activeTab)?.label || t('sidebar.dashboard')}
            </h2>
            <NotificationBell />
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
