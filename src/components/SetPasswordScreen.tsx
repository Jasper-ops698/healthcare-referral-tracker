import { useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, Lock, ArrowRight, AlertCircle } from 'lucide-react';

interface SetPasswordScreenProps {
  email?: string;
  phone?: string;
  firstName: string;
  onComplete: () => void;
}

export default function SetPasswordScreen({ email, phone, firstName, onComplete }: SetPasswordScreenProps) {
  const { t } = useI18n();
  const { setPassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const identifierLabel = email ? email : phone;
  const viaSms = !email && !!phone;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword.trim()) {
      setError(viaSms
        ? 'Please enter your temporary password from the SMS'
        : 'Please enter your temporary password'
      );
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setIsLoading(true);
    const result = await setPassword(email || '', currentPassword, newPassword, phone);
    setIsLoading(false);

    if (result.success) {
      onComplete();
    } else {
      setError(result.error || 'Failed to set password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center p-2">
            <img src="/brand-logo.png" alt="HealthTrack" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-slate-800 px-8 py-6">
            <h2 className="text-xl font-bold text-white">{t('login.setPasswordTitle') || 'Set Your Password'}</h2>
            <p className="text-slate-300 text-sm mt-1">
              {t('login.welcomeFirstTime', { name: firstName }) || `Welcome, ${firstName}! Please set a new password for your account.`}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {/* Temporary Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('login.tempPassword') || 'Temporary Password'}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={viaSms
                    ? (t('login.tempPasswordPlaceholderSMS') || 'Enter temp password from SMS')
                    : (t('login.tempPasswordPlaceholder') || 'Enter temporary password')
                  }
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {viaSms
                  ? (t('login.checkSMS') || `Check the SMS we sent to ${identifierLabel} for your temporary password.`)
                  : (t('login.checkEmail') || "Check your email for the temporary password we sent you.")
                }
              </p>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('login.newPassword') || 'New Password'}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('login.newPasswordPlaceholder') || 'Create a strong password (min 6 chars)'}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('login.confirmPassword') || 'Confirm Password'}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('login.confirmPasswordPlaceholder') || 'Re-enter new password'}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {t('login.setPassword') || 'Set Password & Continue'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Footer */}
            <p className="text-xs text-gray-400 text-center mt-4">
              {viaSms
                ? (t('login.passwordHelpSMS') || "Didn't receive the SMS? Contact your administrator.")
                : (t('login.passwordHelp') || "Can't find the email? Contact your administrator for assistance.")
              }
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
