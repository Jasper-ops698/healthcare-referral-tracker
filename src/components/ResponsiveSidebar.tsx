import { LogOut, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import type { User } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import NotificationBell from './NotificationBell';
import { useState } from 'react';

/* ───────────────────────────────────────────────
   ResponsiveSidebar
   • Collapsed  → icon + compact label
   • Expanded   → icon + full label
   • Fixed position — parent MUST add matching
     margin-left to its <main> (lg:ml-20 or lg:ml-64)
   ─────────────────────────────────────────────── */

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface SidebarProps {
  items: SidebarItem[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: User | null;
  onLogout: () => void;
  title: string;
  subtitle: string;
  logoImage?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenProfile?: () => void;
}

export default function ResponsiveSidebar({
  items,
  activeTab,
  onTabChange,
  user,
  onLogout,
  title,
  subtitle,
  logoImage,
  isCollapsed,
  onToggleCollapse,
  onOpenProfile,
}: SidebarProps) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useI18n();

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId);
    setIsMobileMenuOpen(false);
  };

  // ── Nav item renderer ──
  const NavItem = ({ item }: { item: SidebarItem }) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleTabClick(item.id)}
        title={isCollapsed ? item.label : undefined}
        className={`
          group flex items-center rounded-lg font-medium transition-all duration-200
          ${isCollapsed
            ? 'justify-center w-12 h-12 mx-auto'
            : 'w-full px-4 py-3 gap-3'
          }
          ${isActive
            ? 'bg-sky-500 text-white shadow-sm'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
          }
        `}
      >
        {/* Icon — ALWAYS rendered */}
        <Icon
          className={`
            flex-shrink-0 transition-colors duration-200
            ${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'}
            ${isActive ? 'text-white' : 'text-current group-hover:text-white'}
          `}
        />
        {/* Label — hidden when collapsed */}
        {!isCollapsed && (
          <span className="truncate text-sm">{item.label}</span>
        )}
      </button>
    );
  };

  // ── Shared inner content ──
  const SidebarContent = () => (
    <>
      {/* Nav Items */}
      <nav className={`flex-1 py-4 space-y-1 overflow-y-auto ${isCollapsed ? 'px-1' : 'px-3'}`}>
        {items.map((item) => (
          <NavItem key={item.id} item={item} />
        ))}
      </nav>

      {/* Bottom Section */}
      <div className={`border-t border-white/10 ${isCollapsed ? 'p-2' : 'p-3'}`}>
        {/* User Info — clickable to open profile */}
        <button
          onClick={onOpenProfile}
          className={`flex items-center py-2 w-full rounded-lg hover:bg-white/10 transition-colors ${
            isCollapsed ? 'justify-center' : 'px-3 gap-3'
          } ${!onOpenProfile ? 'cursor-default hover:bg-transparent' : ''}`}
          title={onOpenProfile ? 'View My Profile' : undefined}
        >
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-slate-800 text-sm font-semibold shrink-0 overflow-hidden shadow-sm">
            <img
              src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.firstName || 'U'}${user?.lastName || ''}`}
              alt={`${user?.firstName || ''} ${user?.lastName || ''}`}
              className="w-full h-full object-cover"
            />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden min-w-0 text-left">
              <p className="text-sm font-semibold text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-white/60 truncate capitalize">{user?.role}</p>
            </div>
          )}
        </button>

        {/* Sign Out */}
        {isCollapsed ? (
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex justify-center p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={t('sidebar.signOut')}
          >
            <LogOut className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            {t('sidebar.signOut')}
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* ═══════════ MOBILE HEADER ═══════════ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-800 z-40 flex items-center justify-between px-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-white shadow-sm">
            {logoImage && (
              <img src={logoImage} alt="HealthTrack" className="w-full h-full object-contain p-0.5" />
            )}
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-base text-white leading-tight tracking-tight truncate">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-in */}
      <div className={`lg:hidden fixed top-16 left-0 bottom-0 bg-slate-800 text-white z-40 flex flex-col transition-transform duration-300 ease-out w-72 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* ═══════════ DESKTOP SIDEBAR (fixed) ═══════════ */}
      <aside
        className={`
          hidden lg:flex flex-col h-screen bg-slate-800 text-white
          fixed left-0 top-0 z-30 transition-all duration-300
          ${isCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Logo Header */}
        <div className="px-4 py-4 border-b border-white/10 flex items-center gap-3 min-h-[72px]">
          {/* Logo — clean white bg, no cropping */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-white shadow-sm">
            {logoImage && (
              <img
                src={logoImage}
                alt="HealthTrack"
                className="w-full h-full object-contain p-0.5"
              />
            )}
          </div>

          {/* Brand text */}
          {!isCollapsed && (
            <div className="overflow-hidden transition-all duration-300 min-w-0 flex-1">
              <h1 className="font-bold text-base text-white leading-tight tracking-tight truncate">
                {title}
              </h1>
              <p className="text-[11px] text-white/50 truncate font-medium tracking-wide uppercase">
                {subtitle}
              </p>
            </div>
          )}

          {/* Right side controls */}
          <div className="flex items-center gap-1 shrink-0">
            {!isCollapsed && <NotificationBell />}
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <SidebarContent />
      </aside>

      {/* ═══════════ LOGOUT CONFIRMATION MODAL ═══════════ */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">{t('logout.title')}</h3>
            <p className="text-sm text-gray-500">
              {t('logout.message')}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowLogoutConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                {t('logout.cancel')}
              </button>
              <button onClick={() => { setShowLogoutConfirm(false); onLogout(); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-500 text-white hover:bg-sky-600 transition-colors">
                {t('logout.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
