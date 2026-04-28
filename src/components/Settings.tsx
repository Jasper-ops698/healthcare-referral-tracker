import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  changePassword, saveSettings, get2FAStatus, type UserSettings,
  getSystemConfig, updateSystemConfig, exportPatients, exportAuditLogs,
  type SystemConfig,
} from '@/lib/apiClient';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/i18n/useI18n';
import { notifySettingsChanged } from '@/lib/settingsEvents';
import PasswordField from './PasswordField';
import TwoFactorSetupModal from './TwoFactorSetupModal';
import {
  Globe,
  Clock,
  Bell,
  Shield,
  Lock,
  Database,
  Download,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Smartphone,
  Mail,
  MessageSquare,
  HardDrive,
  FileText,
  Activity,
  KeyRound,
  Save,
  AlertTriangle,
} from 'lucide-react';

const STORAGE_KEY_SETTINGS = 'healthtrack_settings';

const defaultSettings = {
  language: 'en',
  timezone: 'Africa/Nairobi',
  autoLogout: 30,
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
  dataRetention: 365,
  twoFactorAuth: true,
  sessionTimeout: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

function saveLocal(s: typeof defaultSettings) {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(s));
}

/* ═══════════════════════════ Settings ═══════════════════════════ */

export default function Settings() {
  const { logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState(loadSettings);
  const [saved, setSaved] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorModal, setTwoFactorModal] = useState<'setup' | 'disable' | null>(null);
  const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);

  const tabs = [
    { id: 'general', label: t('settings.general'), icon: Globe, color: 'text-sky-600', bg: 'bg-sky-50', activeBg: 'bg-sky-500', activeText: 'text-white' },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell, color: 'text-amber-600', bg: 'bg-amber-50', activeBg: 'bg-amber-500', activeText: 'text-white' },
    { id: 'security', label: t('settings.security'), icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-50', activeBg: 'bg-emerald-500', activeText: 'text-white' },
    { id: 'data', label: t('settings.dataPrivacy'), icon: Database, color: 'text-purple-600', bg: 'bg-purple-50', activeBg: 'bg-purple-500', activeText: 'text-white' },
  ];


  const persistSettings = useCallback(async (key: keyof typeof settings, value: unknown) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveLocal(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    notifySettingsChanged();
    const payload: UserSettings = {};
    if (key === 'language') payload.language = value as string;
    if (key === 'timezone') payload.timezone = value as string;
    if (key === 'autoLogout') payload.autoLogout = value as number;
    if (Object.keys(payload).length > 0) {
      try { await saveSettings(payload); } catch { /* offline */ }
    }
  }, [settings]);

  const handleLanguageChange = useCallback(async (newLang: string) => {
    if (newLang === lang) return;
    setLang(newLang as 'en' | 'sw');
    await persistSettings('language', newLang);
    toast.success(t('toast.langChanged'));
  }, [lang, setLang, persistSettings, t]);

  const handleTimezoneChange = useCallback(async (tz: string) => {
    await persistSettings('timezone', tz);
    toast.success(t('toast.timezoneChanged'));
  }, [persistSettings, t]);

  const handleAutoLogoutChange = useCallback(async (mins: number) => {
    await persistSettings('autoLogout', mins);
    toast.success(t('toast.autoLogoutSet', { minutes: String(mins) }));
  }, [persistSettings, t]);

  const update = (key: keyof typeof settings, value: unknown) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveLocal(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('toast.pwdFillAll')); return;
    }
    if (newPassword.length < 6) { toast.error(t('toast.pwdTooShort')); return; }
    if (newPassword !== confirmPassword) { toast.error(t('toast.pwdMismatch')); return; }
    if (newPassword === currentPassword) { toast.error(t('toast.pwdSameAsOld')); return; }
    setIsChanging(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result.success) {
        toast.success(t('toast.pwdUpdated'));
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        setTimeout(() => logout(), 2000);
      } else {
        toast.error(result.error?.message || t('toast.pwdFailed'));
      }
    } catch {
      toast.error(t('toast.pwdServerError'));
    } finally {
      setIsChanging(false);
    }
  };

  const handleRetentionChange = async (days: number) => {
    const next = { ...settings, dataRetention: days };
    setSettings(next);
    saveLocal(next);
    await persistSettings('dataRetention', days);
    try {
      const updated = await updateSystemConfig({ dataRetentionDays: days });
      setSysConfig(updated);
      toast.success('Data retention updated');
    } catch { /* offline */ }
  };

  const handleToggleBackups = async () => {
    if (!sysConfig) return;
    const next = !sysConfig.autoBackupsEnabled;
    try {
      const updated = await updateSystemConfig({ autoBackupsEnabled: next });
      setSysConfig(updated);
      toast.success(`Automatic backups ${next ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update. Server may be offline.');
    }
  };

  const handleToggleAudit = async () => {
    if (!sysConfig) return;
    const next = !sysConfig.auditLoggingEnabled;
    try {
      const updated = await updateSystemConfig({ auditLoggingEnabled: next });
      setSysConfig(updated);
      toast.success(`Audit logging ${next ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update. Server may be offline.');
    }
  };

  const handleExportPatients = async (format: 'csv' | 'json') => {
    setExporting(`patients-${format}`);
    try {
      const blob = await exportPatients(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patients-${new Date().toISOString().split('T')[0]}.${format}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      toast.success(`Patient data exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed. Server may be offline.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportAuditLogs = async () => {
    setExporting('audit');
    try {
      const blob = await exportAuditLogs();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      toast.success('Audit logs exported as JSON');
    } catch {
      toast.error('Export failed. Server may be offline.');
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    if (settings.language !== lang) setLang(settings.language as 'en' | 'sw');
    get2FAStatus().then((s) => setTwoFactorEnabled(s.enabled)).catch(() => {
      setTwoFactorEnabled(localStorage.getItem('healthtrack_2fa_enabled') === 'true');
    });
    getSystemConfig().then((config) => {
      setSysConfig(config);
      if (config.dataRetentionDays) {
        const next = { ...settings, dataRetention: config.dataRetentionDays };
        setSettings(next);
        saveLocal(next);
      }
    }).catch(() => { /* offline */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 animate-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-gray-500 mt-1">{t('settings.subtitle')}</p>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 self-start sm:self-auto">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('settings.saved')}
          </span>
        )}
      </div>

      {/* ── System Status Overview ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusPill
          icon={<Globe className="w-4 h-4" />}
          label="Language"
          value={settings.language === 'en' ? 'English' : 'Kiswahili'}
          color="sky"
        />
        <StatusPill
          icon={<Clock className="w-4 h-4" />}
          label="Auto Logout"
          value={settings.autoLogout === 0 ? 'Never' : `${settings.autoLogout} min`}
          color="amber"
        />
        <StatusPill
          icon={<Shield className="w-4 h-4" />}
          label="2FA"
          value={twoFactorEnabled ? 'Enabled' : 'Disabled'}
          color={twoFactorEnabled ? 'emerald' : 'rose'}
        />
        <StatusPill
          icon={<Database className="w-4 h-4" />}
          label="Retention"
          value={settings.dataRetention === 0 ? 'Forever' : `${settings.dataRetention}d`}
          color="purple"
        />
      </div>

      {/* ── Main Layout ── */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <div className="lg:w-64 space-y-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? `${tab.activeBg} ${tab.activeText} shadow-md shadow-${tab.color.split('-')[1]}-500/20`
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-white/20' : tab.bg}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : tab.color}`} />
                </div>
                <span>{tab.label}</span>
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">

          {/* ═══════════ GENERAL ═══════════ */}
          {activeTab === 'general' && (
            <>
              <SettingCard
                icon={<Globe className="w-5 h-5 text-sky-600" />}
                iconBg="bg-sky-50"
                title={t('settings.generalTitle')}
                subtitle={t('settings.generalSubtitle')}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FormField label={t('settings.language')} hint={t('settings.languageHint')}>
                    <select
                      value={settings.language}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all bg-white text-sm"
                    >
                      <option value="en">{t('settings.lang.english')}</option>
                      <option value="sw">{t('settings.lang.swahili')}</option>
                    </select>
                  </FormField>
                  <FormField label={t('settings.timezone')} hint={t('settings.timezoneHint')}>
                    <select
                      value={settings.timezone}
                      onChange={(e) => handleTimezoneChange(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all bg-white text-sm"
                    >
                      <option value="Africa/Nairobi">East Africa Time (EAT) — Nairobi</option>
                      <option value="UTC">Coordinated Universal Time (UTC)</option>
                      <option value="America/New_York">Eastern Time (ET) — New York</option>
                      <option value="America/Chicago">Central Time (CT) — Chicago</option>
                      <option value="America/Denver">Mountain Time (MT) — Denver</option>
                      <option value="America/Los_Angeles">Pacific Time (PT) — Los Angeles</option>
                      <option value="Europe/London">Greenwich Mean Time (GMT) — London</option>
                      <option value="Europe/Berlin">Central European Time (CET) — Berlin</option>
                      <option value="Asia/Shanghai">China Standard Time (CST) — Shanghai</option>
                      <option value="Asia/Dubai">Gulf Standard Time (GST) — Dubai</option>
                    </select>
                  </FormField>
                </div>
                <FormField label={t('settings.autoLogout')} hint={t('settings.autoLogoutHint')}>
                  <select
                    value={settings.autoLogout}
                    onChange={(e) => handleAutoLogoutChange(parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all bg-white text-sm"
                  >
                    <option value={0}>{t('settings.autoLogout.never')}</option>
                    <option value={5}>5 {t('settings.autoLogout.minutes')}</option>
                    <option value={15}>15 {t('settings.autoLogout.minutes')}</option>
                    <option value={30}>30 {t('settings.autoLogout.minutes')}</option>
                    <option value={60}>1 {t('settings.autoLogout.hour')}</option>
                    <option value={120}>2 {t('settings.autoLogout.hours')}</option>
                  </select>
                </FormField>
              </SettingCard>
            </>
          )}

          {/* ═══════════ NOTIFICATIONS ═══════════ */}
          {activeTab === 'notifications' && (
            <SettingCard
              icon={<Bell className="w-5 h-5 text-amber-600" />}
              iconBg="bg-amber-50"
              title={t('settings.notifTitle')}
              subtitle={t('settings.notifSubtitle')}
            >
              <ToggleRow
                icon={<Mail className="w-4 h-4 text-sky-500" />}
                title={t('settings.emailNotif')}
                desc={t('settings.emailNotifDesc')}
                enabled={settings.emailNotifications}
                onChange={(v) => update('emailNotifications', v)}
              />
              <ToggleRow
                icon={<MessageSquare className="w-4 h-4 text-emerald-500" />}
                title={t('settings.smsNotif')}
                desc={t('settings.smsNotifDesc')}
                enabled={settings.smsNotifications}
                onChange={(v) => update('smsNotifications', v)}
              />
              <ToggleRow
                icon={<Smartphone className="w-4 h-4 text-purple-500" />}
                title={t('settings.pushNotif')}
                desc={t('settings.pushNotifDesc')}
                enabled={settings.pushNotifications}
                onChange={(v) => update('pushNotifications', v)}
              />
            </SettingCard>
          )}

          {/* ═══════════ SECURITY ═══════════ */}
          {activeTab === 'security' && (
            <>
              <SettingCard
                icon={<Shield className="w-5 h-5 text-emerald-600" />}
                iconBg="bg-emerald-50"
                title={t('settings.securityTitle')}
                subtitle={t('settings.securitySubtitle')}
              >
                {/* 2FA */}
                <div className="flex items-start sm:items-center justify-between gap-4 py-1">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      <KeyRound className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{t('settings.twoFactor')}</p>
                      <p className="text-sm text-gray-500">
                        {twoFactorEnabled ? t('settings.twoFactorEnabled') : t('settings.twoFactorDisabled')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTwoFactorModal(twoFactorEnabled ? 'disable' : 'setup')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                      twoFactorEnabled
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                    }`}
                  >
                    {twoFactorEnabled ? t('settings.twoFactorDisable') : t('settings.twoFactorSetup')}
                  </button>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <ToggleRow
                    icon={<Clock className="w-4 h-4 text-amber-500" />}
                    title={t('settings.sessionTimeout')}
                    desc={t('settings.sessionTimeoutDesc')}
                    enabled={settings.sessionTimeout}
                    onChange={(v) => update('sessionTimeout', v)}
                  />
                </div>
              </SettingCard>

              <SettingCard
                icon={<Lock className="w-5 h-5 text-slate-600" />}
                iconBg="bg-slate-50"
                title={t('settings.changePassword')}
                subtitle={t('settings.changePasswordSubtitle')}
              >
                <div className="space-y-4">
                  <PasswordField
                    label={t('settings.currentPassword')}
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    placeholder={t('settings.currentPasswordPlaceholder')}
                  />
                  <PasswordField
                    label={t('settings.newPassword')}
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder={t('settings.newPasswordPlaceholder')}
                  />
                  <PasswordField
                    label={t('settings.confirmPassword')}
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder={t('settings.confirmPasswordPlaceholder')}
                  />

                  {newPassword && (
                    <p className={`text-sm ${newPassword.length >= 6 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {newPassword.length >= 6 ? t('settings.pwdLengthGood') : t('settings.pwdLengthBad')}
                    </p>
                  )}
                  {confirmPassword && (
                    <p className={`text-sm ${newPassword === confirmPassword ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {newPassword === confirmPassword ? t('settings.pwdMatch') : t('settings.pwdMismatch')}
                    </p>
                  )}

                  <button
                    onClick={handleChangePassword}
                    disabled={isChanging}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isChanging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isChanging ? t('settings.updating') : t('settings.updatePassword')}
                  </button>
                </div>
              </SettingCard>
            </>
          )}

          {/* ═══════════ DATA & PRIVACY ═══════════ */}
          {activeTab === 'data' && (
            <>
              <SettingCard
                icon={<Database className="w-5 h-5 text-purple-600" />}
                iconBg="bg-purple-50"
                title={t('settings.dataTitle')}
                subtitle={t('settings.dataSubtitle')}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FormField label={t('settings.dataRetention')} hint={t('settings.dataRetentionHint')}>
                    <select
                      value={settings.dataRetention}
                      onChange={(e) => handleRetentionChange(parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all bg-white text-sm"
                    >
                      <option value={90}>90 {t('common.days')}</option>
                      <option value={180}>180 {t('common.days')}</option>
                      <option value={365}>1 {t('common.year')}</option>
                      <option value={730}>2 {t('common.years')}</option>
                      <option value={1095}>3 {t('common.years')}</option>
                      <option value={0}>{t('settings.autoLogout.never')}</option>
                    </select>
                  </FormField>
                  <FormField label="System Status" hint="Current data protection status">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm">
                      <HardDrive className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">
                        {sysConfig?.autoBackupsEnabled ? 'Auto-backups enabled' : 'Backups paused'}
                      </span>
                      <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                  </FormField>
                </div>

                <ToggleRow
                  icon={<HardDrive className="w-4 h-4 text-purple-500" />}
                  title={t('settings.autoBackups')}
                  desc={sysConfig?.lastBackupAt ? `Last backup: ${new Date(sysConfig.lastBackupAt).toLocaleDateString()}` : 'Toggle automatic data backups'}
                  enabled={sysConfig?.autoBackupsEnabled ?? true}
                  onChange={handleToggleBackups}
                />
                <ToggleRow
                  icon={<Activity className="w-4 h-4 text-amber-500" />}
                  title={t('settings.auditLogging')}
                  desc="Toggle system audit logging for security compliance"
                  enabled={sysConfig?.auditLoggingEnabled ?? true}
                  onChange={handleToggleAudit}
                />
              </SettingCard>

              <SettingCard
                icon={<Download className="w-5 h-5 text-teal-600" />}
                iconBg="bg-teal-50"
                title={t('settings.dataExport')}
                subtitle={t('settings.dataExportSubtitle')}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ExportButton
                    icon={<FileText className="w-4 h-4" />}
                    label={t('settings.exportPatients')}
                    format="CSV"
                    color="sky"
                    loading={exporting === 'patients-csv'}
                    onClick={() => handleExportPatients('csv')}
                  />
                  <ExportButton
                    icon={<FileText className="w-4 h-4" />}
                    label={t('settings.exportPatients')}
                    format="JSON"
                    color="amber"
                    loading={exporting === 'patients-json'}
                    onClick={() => handleExportPatients('json')}
                  />
                  <ExportButton
                    icon={<Activity className="w-4 h-4" />}
                    label={t('settings.exportLogs')}
                    format="JSON"
                    color="emerald"
                    loading={exporting === 'audit'}
                    onClick={handleExportAuditLogs}
                  />
                </div>
              </SettingCard>

              {/* Danger Zone */}
              <div className="bg-white rounded-xl border border-rose-200 p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Danger Zone</h3>
                    <p className="text-sm text-gray-500">Irreversible actions. Proceed with caution.</p>
                  </div>
                </div>
                <div className="flex items-center justify-between py-3 border-t border-rose-100">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Delete All Local Data</p>
                    <p className="text-sm text-gray-500">Removes all IndexedDB data. Cannot be undone.</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure? This will delete all local patient data.')) {
                        localStorage.clear();
                        toast.success('All local data cleared. Refreshing...');
                        setTimeout(() => window.location.reload(), 1500);
                      }
                    }}
                    className="px-4 py-2 rounded-lg border border-rose-200 text-rose-700 text-sm font-medium hover:bg-rose-50 transition-colors"
                  >
                    Clear Data
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2FA Modal */}
      {twoFactorModal && (
        <TwoFactorSetupModal
          mode={twoFactorModal === 'setup' ? 'setup' : 'disable'}
          onClose={() => setTwoFactorModal(null)}
          onComplete={() => {
            setTwoFactorModal(null);
            get2FAStatus().then((s) => setTwoFactorEnabled(s.enabled)).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════ Sub-components ═══════════════════════════ */

function SettingCard({ icon, iconBg, title, subtitle, children }: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-5">
        {children}
      </div>
    </div>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function ToggleRow({ icon, title, desc, enabled, onChange }: {
  icon: React.ReactNode;
  title: string; desc: string; enabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start sm:items-center justify-between gap-4 py-1">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
          {icon}
        </div>
        <div>
          <p className="font-medium text-gray-900 text-sm">{title}</p>
          <p className="text-sm text-gray-500">{desc}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
          enabled ? 'bg-teal-500' : 'bg-gray-200'
        }`}
      >
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-5' : ''
        }`} />
      </button>
    </div>
  );
}

function StatusPill({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string;
  color: 'sky' | 'amber' | 'emerald' | 'rose' | 'purple' | 'slate';
}) {
  const colorMap: Record<string, { bg: string; text: string; dot: string }> = {
    sky:     { bg: 'bg-sky-50',  text: 'text-sky-700',  dot: 'bg-sky-500' },
    amber:   { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    rose:    { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
    purple:  { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
    slate:   { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-500' },
  };
  const c = colorMap[color] || colorMap.slate;
  return (
    <div className={`${c.bg} rounded-xl p-4 border border-gray-100`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={c.text}>{icon}</span>
        <span className={`text-xs font-medium ${c.text}`}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className="text-sm font-semibold text-gray-900">{value}</span>
      </div>
    </div>
  );
}

function ExportButton({ icon, label, format, color, loading, onClick }: {
  icon: React.ReactNode; label: string; format: string; color: 'sky' | 'amber' | 'emerald';
  loading: boolean; onClick: () => void;
}) {
  const colorMap = {
    sky:     'hover:border-sky-300 hover:bg-sky-50 hover:shadow-sky-500/10',
    amber:   'hover:border-amber-300 hover:bg-amber-50 hover:shadow-amber-500/10',
    emerald: 'hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-emerald-500/10',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white transition-all hover:shadow-md ${colorMap[color]} disabled:opacity-50 text-left group`}
    >
      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center group-hover:scale-110 transition-transform">
        {loading ? <Loader2 className="w-5 h-5 text-gray-400 animate-spin" /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">{label}</p>
        <p className="text-xs text-gray-400">{format}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
    </button>
  );
}
