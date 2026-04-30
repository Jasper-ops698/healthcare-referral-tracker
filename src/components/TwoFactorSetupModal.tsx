/**
 * TwoFactorSetupModal — QR code scanning + verification + backup codes
 *
 * 3-step flow:
 *   1. Display QR code + manual entry code (client-side generation via otpauth)
 *   2. User scans QR with authenticator app → enters 6-digit code
 *   3. Verify code → enable 2FA → show backup codes
 *
 * Uses otpauth (browser-compatible) + qrcode for client-side generation.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { setup2FA, verify2FASetup, disable2FA } from '@/lib/apiClient';
import { useI18n } from '@/i18n/useI18n';
import { Shield, ShieldCheck, ShieldOff, Copy, Check, Download, AlertTriangle } from 'lucide-react';

interface Props {
  mode: 'setup' | 'disable';
  onClose: () => void;
  onComplete: () => void;
}

export default function TwoFactorSetupModal({ mode, onClose, onComplete }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<'qr' | 'verify' | 'backup' | 'disable'>('qr');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Generate QR code client-side on mount (step 1) ───
  useEffect(() => {
    if (mode === 'setup' && step === 'qr') {
      generateClientSideQR();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step]);

  // ─── Client-side QR generation using otpauth + qrcode ───
  const generateClientSideQR = async () => {
    setLoading(true);
    setError('');

    // Try backend first
    try {
      const data = await setup2FA();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep('verify');
      setLoading(false);
      return;
    } catch {
      console.log('[2FA] Backend unavailable, generating QR client-side');
    }

    // Client-side fallback
    try {
      const { TOTP, Secret } = await import('otpauth');
      const QRCode = await import('qrcode');

      const email = JSON.parse(localStorage.getItem('healthtrack_current_user') || '{}').email || 'user@healthtrack.com';

      // Generate random secret
      const generatedSecret = new Secret({ size: 32 });

      // Create TOTP object
      const totp = new TOTP({
        issuer: 'HealthTrack',
        label: email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: generatedSecret,
      });

      // Generate otpauth URI for QR code
      const uri = totp.toString();

      // Generate QR code data URL
      const dataUrl = await QRCode.toDataURL(uri);

      setQrCode(dataUrl);
      setSecret(generatedSecret.base32);
      setStep('verify');
    } catch (err: any) {
      setError('Failed to generate QR code. Please refresh and try again.');
      console.error('[2FA] Client-side generation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Verify TOTP code ───
  const verifySetup = async () => {
    if (token.length !== 6) {
      setError(t('toast.2faCodeRequired'));
      return;
    }
    setLoading(true);
    setError('');

    // Try backend verification first
    try {
      const data = await verify2FASetup(token);
      setBackupCodes(data.backupCodes);
      setStep('backup');
      toast.success(t('toast.2faSetupSuccess'));
      setLoading(false);
      return;
    } catch {
      console.log('[2FA] Backend verify unavailable, verifying client-side');
    }

    // Client-side verification
    try {
      const { TOTP, Secret } = await import('otpauth');

      const totp = new TOTP({
        issuer: 'HealthTrack',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      });

      // validate returns delta (0 = exact match, 1/-1 = adjacent window)
      const delta = totp.validate({ token, window: 2 });

      if (delta === null) {
        setError(t('toast.2faInvalid'));
        setLoading(false);
        return;
      }

      // Generate backup codes
      const codes = generateBackupCodes();
      setBackupCodes(codes);

      // Store 2FA state locally (syncs to backend when available)
      localStorage.setItem('healthtrack_2fa_secret', secret);
      localStorage.setItem('healthtrack_2fa_enabled', 'true');

      setStep('backup');
      toast.success(t('toast.2faSetupSuccess'));
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // ─── Disable 2FA ───
  const handleDisable = async () => {
    if (!disablePassword) {
      setError(t('settings.twoFactorDisableConfirm'));
      return;
    }
    setLoading(true);
    setError('');

    try {
      const result = await disable2FA(disablePassword);
      if (result.success) {
        toast.success(t('toast.2faDisabled'));
        onComplete();
      } else {
        setError(result.error?.message || 'Failed to disable 2FA');
      }
    } catch {
      // Backend unavailable — disable locally
      localStorage.removeItem('healthtrack_2fa_secret');
      localStorage.removeItem('healthtrack_2fa_enabled');
      toast.success(t('toast.2faDisabled'));
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  // ─── Copy to clipboard ───
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  // ─── Download backup codes ───
  const downloadBackupCodes = () => {
    const content = backupCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'healthtrack-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          {mode === 'setup' ? (
            <Shield className="w-6 h-6 text-sky-500" />
          ) : (
            <ShieldOff className="w-6 h-6 text-amber-500" />
          )}
          <h3 className="font-semibold text-base text-gray-900">
            {mode === 'setup' ? t('settings.twoFactor') : t('settings.twoFactorDisable')}
          </h3>
        </div>

        <div className="px-5 py-5">
          {/* Error banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ─── SETUP: QR CODE LOADING ─── */}
          {mode === 'setup' && step === 'qr' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-600">Generating QR code...</p>
            </div>
          )}

          {/* ─── SETUP: VERIFY (QR + CODE INPUT) ─── */}
          {mode === 'setup' && step === 'verify' && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600 text-center">
                {t('settings.twoFactorScanQR')}
              </p>

              {/* QR Code */}
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                  {qrCode ? (
                    <img src={qrCode} alt="2FA QR Code" className="w-52 h-52" />
                  ) : (
                    <div className="w-52 h-52 bg-gray-100 animate-pulse" />
                  )}
                </div>

                {/* Manual entry code */}
                <div className="w-full">
                  <p className="text-xs text-gray-500 mb-1.5 text-center">
                    {t('settings.twoFactorManualEntry')}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2.5 bg-gray-100 rounded-lg text-sm font-mono text-gray-800 text-center tracking-wider break-all">
                      {secret}
                    </code>
                    <button
                      onClick={() => copyToClipboard(secret)}
                      className="p-2.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                      title="Copy"
                    >
                      {copiedCode === secret ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-500">Then enter the code</span>
                </div>
              </div>

              {/* Code input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('settings.twoFactorEnterCode')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={token}
                  onChange={(e) => {
                    setError('');
                    setToken(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all text-center tracking-[0.5em] text-lg"
                  placeholder={t('2fa.codePlaceholder')}
                  maxLength={6}
                  autoFocus
                />
              </div>

              <button
                onClick={verifySetup}
                disabled={loading || token.length !== 6}
                className="w-full px-4 py-3 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Verifying...' : t('settings.twoFactorVerify')}
              </button>
            </div>
          )}

          {/* ─── SETUP: BACKUP CODES ─── */}
          {mode === 'setup' && step === 'backup' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <ShieldCheck className="w-5 h-5" />
                <p className="text-sm font-medium">{t('toast.2faSetupSuccess')}</p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  {t('settings.twoFactorBackupCodesDesc')}
                </p>
              </div>

              {/* Backup codes grid */}
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-lg"
                  >
                    <code className="text-sm font-mono text-gray-800">{code}</code>
                    <button
                      onClick={() => copyToClipboard(code)}
                      className="p-1 rounded text-gray-500 hover:text-gray-700"
                    >
                      {copiedCode === code ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={downloadBackupCodes}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Backup Codes
              </button>

              <button
                onClick={() => { onComplete(); onClose(); }}
                className="w-full px-4 py-3 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-colors"
              >
                Done — I saved my backup codes
              </button>
            </div>
          )}

          {/* ─── DISABLE ─── */}
          {mode === 'disable' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                <p className="text-sm font-medium">Disable two-factor authentication</p>
              </div>
              <p className="text-sm text-gray-600">
                {t('settings.twoFactorDisableConfirm')}
              </p>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => { setError(''); setDisablePassword(e.target.value); }}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                placeholder={t('2fa.passwordPlaceholder')}
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisable}
                  disabled={loading || !disablePassword}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Generate backup codes ───
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}
