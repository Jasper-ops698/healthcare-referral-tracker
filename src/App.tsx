import { useState, useEffect } from 'react';
import './App.css';
import { Toaster, toast } from 'sonner';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { SyncProvider } from '@/hooks/useSync';
import { useI18n } from '@/i18n/useI18n';
import { verify2FALogin } from '@/lib/apiClient';
import AdminDashboard from '@/sections/AdminDashboard';
import CollectorDashboard from '@/sections/CHPDashboard';
import ChpFeedbackForm from '@/components/ChpFeedbackForm';
import { Eye, EyeOff, Shield } from 'lucide-react';
import SetPasswordScreen from '@/components/SetPasswordScreen';

// ─── Idle Auto-Logout Wrapper ───
function IdleAutoLogout({ children }: { children: React.ReactNode }) {
  const { logout, isAuthenticated } = useAuth();
  const { t } = useI18n();

  // Read both settings: sessionTimeout (on/off) + autoLogout (minutes)
  const getTimeoutMinutes = () => {
    if (!isAuthenticated) return 0;
    try {
      const raw = localStorage.getItem('healthtrack_settings');
      if (!raw) return 30;
      const s = JSON.parse(raw);
      // Session Timeout toggle (Security tab) must be ON
      if (s.sessionTimeout === false) return 0;
      // Auto Logout dropdown (General tab) sets the minutes
      return s.autoLogout ?? 30;
    } catch { return 30; }
  };

  const handleIdle = () => {
    toast.info(t('toast.sessionExpired'));
    logout();
  };

  useIdleTimer(handleIdle, getTimeoutMinutes());

  return <>{children}</>;
}

/**
 * Detect if the current URL is a CHP public feedback form link.
 * Pattern: /chp-feedback/<token>
 */
function getChpFeedbackToken(): string | null {
  const match = window.location.pathname.match(/^\/chp-feedback\/([a-f0-9]+)$/i);
  return match ? match[1] : null;
}

function AppContent() {
  const { isAuthenticated, isAdmin, isCollector } = useAuth();
  const [chpToken, setChpToken] = useState<string | null>(getChpFeedbackToken);
  useI18n();

  // Listen for URL changes (e.g., back/forward navigation)
  useEffect(() => {
    const handlePopState = () => setChpToken(getChpFeedbackToken());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // If this is a CHP feedback link, render the public form (no auth required)
  if (chpToken) {
    return <ChpFeedbackForm token={chpToken} />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <IdleAutoLogout>
      {isAdmin ? <AdminDashboard /> : isCollector ? <CollectorDashboard /> : <LoginPage />}
    </IdleAutoLogout>
  );
}

// ─── Login Page ───
function LoginPage() {
  const { login, completeLogin, isLoading } = useAuth();
  const { t } = useI18n();

  const [step, setStep] = useState<'password' | '2fa' | 'setPassword'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState('');
  const [pendingFirstName, setPendingFirstName] = useState('');

  // Step 1: Email + Password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = await login(email, password);

    if (result.success) {
      toast.success(t('toast.welcome'));
      // AuthProvider already updated the user state
    } else if (result.forcePasswordChange) {
      setStep('setPassword');
      setPendingFirstName(result.firstName || '');
      toast.info(t('login.passwordChangeRequired') || 'Please set a new password');
    } else if (result.twoFactorRequired) {
      setStep('2fa');
      setPassword('');
      toast.info(t('toast.2faRequired'));
    } else {
      setError(result.error || t('toast.invalidCredentials'));
      toast.error(result.error || t('toast.invalidCredentials'));
    }
  };

  // Step 2: 2FA Code
  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = useBackupCode ? backupCode.trim() : twoFactorCode.trim();
    if (!code) {
      setError(t('toast.2faCodeRequired'));
      return;
    }

    try {
      const result = await verify2FALogin(
        email,
        useBackupCode ? '' : twoFactorCode,
        useBackupCode ? backupCode : undefined
      );

      if (result.success && result.token) {
        completeLogin(result.token, result.user);
        toast.success(t('toast.welcome'));
      } else {
        setError(result.error?.message || t('toast.2faInvalid'));
        toast.error(result.error?.message || t('toast.2faInvalid'));
      }
    } catch {
      setError(t('toast.connectionFailed'));
      toast.error(t('toast.connectionFailed'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-xl flex items-center justify-center mx-auto mb-4 overflow-hidden shadow-lg bg-white">
              <img src="/brand-logo.png" alt="logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('login.title')}</h1>
            <p className="text-gray-500 mt-1">
              {step === '2fa' ? t('login.2faSubtitle') : t('login.subtitle')}
            </p>
          </div>

          {step === 'setPassword' ? (
            <SetPasswordScreen
              email={email}
              firstName={pendingFirstName}
              onComplete={() => {
                toast.success(t('toast.welcome'));
                setStep('password');
              }}
            />
          ) : step === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                  placeholder={t('login.emailPlaceholder')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('login.password')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                    placeholder={t('login.passwordPlaceholder')}
                    required
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-3 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('login.signingIn')}
                  </>
                ) : (
                  t('login.signIn')
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FASubmit} className="space-y-4">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center">
                  <Shield className="w-6 h-6 text-sky-500" />
                </div>
              </div>

              <div className="text-center mb-4">
                <p className="text-sm text-gray-600">
                  {useBackupCode ? t('login.backupCodeHint') : t('login.2faHint')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{email}</p>
              </div>

              {useBackupCode ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('login.backupCode')}
                  </label>
                  <input
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all text-center tracking-widest uppercase"
                    placeholder="XXXX-XXXX"
                    maxLength={9}
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('login.2faCode')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={twoFactorCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setTwoFactorCode(val);
                    }}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all text-center tracking-[0.5em] text-lg"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    required
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full px-4 py-3 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-colors"
              >
                {t('login.verify2fa')}
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setUseBackupCode(!useBackupCode)}
                  className="text-sm text-sky-600 hover:underline"
                >
                  {useBackupCode ? t('login.use2faCode') : t('login.useBackupCode')}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('password'); setTwoFactorCode(''); setBackupCode(''); setError(''); }}
                  className="text-sm text-gray-500 hover:underline"
                >
                  {t('login.back')}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              {t('login.contactAdmin')}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          {t('login.version')} &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{ style: { fontSize: '14px' } }}
        />
        <AppContent />
      </SyncProvider>
    </AuthProvider>
  );
}

export default App;
