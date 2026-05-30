/**
 * EmailDiagnostics — Admin SMTP Health Monitor
 *
 * Displays real-time SMTP configuration status, connection health,
 * queued email stats, and actionable fix suggestions.
 */

import { useState, useEffect, useCallback } from 'react';
import { checkEmailHealth, retryQueuedEmails, type EmailHealthResponse } from '@/lib/apiClient';
import { Mail, AlertTriangle, CheckCircle, XCircle, RefreshCw, Clock, Send } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';

type HealthState = 'loading' | 'ok' | 'error' | 'unconfigured';

export default function EmailDiagnostics() {
  const { t } = useI18n();
  const [health, setHealth] = useState<EmailHealthResponse | null>(null);
  const [state, setState] = useState<HealthState>('loading');
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      setState('loading');
      const res = await checkEmailHealth();
      if (res.success && res.data) {
        setHealth(res.data);
        if (!res.data.configured) {
          setState('unconfigured');
        } else if (res.data.connection.success) {
          setState('ok');
        } else {
          setState('error');
        }
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await retryQueuedEmails();
      if (res.success && res.data) {
        const { sent, failed, processed } = res.data as Record<string, number>;
        setRetryResult(`Processed ${processed}: ${sent} sent, ${failed} failed`);
      } else {
        setRetryResult(res.error?.message || 'Retry failed');
      }
      fetchHealth();
    } catch {
      setRetryResult('Network error');
    }
    setRetrying(false);
  };

  const statusConfig: Record<HealthState, { icon: typeof Mail; color: string; bg: string; label: string }> = {
    loading: { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50', label: 'Checking...' },
    ok: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'SMTP Connected' },
    error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'SMTP Error' },
    unconfigured: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Not Configured' },
  };

  const cfg = statusConfig[state];
  const StatusIcon = cfg.icon;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${cfg.bg}`}>
            <StatusIcon className={`w-5 h-5 ${cfg.color}`} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-slate-800 text-sm">{t('email.diagnostics') || 'Email Diagnostics'}</h3>
            <p className={`text-xs ${cfg.color} font-medium`}>{cfg.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {health?.queue && health.queue.pending > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              {health.queue.pending} queued
            </span>
          )}
          {state === 'ok' && health?.queue && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
              {health.queue.sent} sent
            </span>
          )}
          <RefreshCw
            className={`w-4 h-4 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          />
        </div>
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div className="px-5 pb-4 border-t border-slate-100">
          {/* SMTP Config Card */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">SMTP Host</p>
              <p className="font-mono font-medium text-slate-700">{health?.smtp?.host || '—'}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">Port / Secure</p>
              <p className="font-mono font-medium text-slate-700">
                {health?.smtp?.port || '—'} / {health?.smtp?.secure ? 'SSL' : 'STARTTLS'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 col-span-2">
              <p className="text-xs text-slate-500 mb-1">SMTP User</p>
              <p className="font-mono font-medium text-slate-700 break-all">{health?.smtp?.user || '—'}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">Password</p>
              <p className="font-medium text-slate-700">
                {health?.smtp?.passConfigured ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Set ({health.smtp.passLength} chars)
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Not set
                  </span>
                )}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-500 mb-1">Connection</p>
              <p className="font-medium">
                {health?.connection?.success ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Verified
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Error message */}
          {health?.connection?.error && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-100">
              <p className="text-xs text-red-600 font-mono break-all">{health.connection.error}</p>
            </div>
          )}

          {/* Suggestions */}
          {health?.suggestions && health.suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Fix Suggestions</p>
              {health.suggestions.map((s, i) => (
                <div key={i} className="flex gap-2 text-sm text-slate-700 p-2 rounded-lg bg-amber-50 border border-amber-100">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

          {/* Queue stats */}
          {health?.queue && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: 'Pending', value: health.queue.pending, color: 'text-amber-600 bg-amber-50' },
                { label: 'Sent', value: health.queue.sent, color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Failed', value: health.queue.failed, color: 'text-red-600 bg-red-50' },
                { label: 'Cancelled', value: health.queue.cancelled, color: 'text-slate-600 bg-slate-50' },
              ].map((item) => (
                <div key={item.label} className={`p-2 rounded-lg ${item.color} text-center`}>
                  <p className="text-lg font-bold">{item.value}</p>
                  <p className="text-xs">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={fetchHealth}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {health?.queue && health.queue.pending > 0 && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {retrying ? 'Retrying...' : `Retry ${health.queue.pending}`}
              </button>
            )}
          </div>

          {retryResult && (
            <p className="mt-2 text-xs text-center text-slate-500">{retryResult}</p>
          )}

          {/* How to fix section */}
          {state !== 'ok' && (
            <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-sm font-semibold text-blue-800 mb-2">How to Fix Email on Render</p>
              <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
                <li>Go to <a href="https://dashboard.render.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Render Dashboard</a></li>
                <li>Select your web service → <strong>Environment</strong> tab</li>
                <li>Add or update these environment variables:</li>
              </ol>
              <div className="mt-2 p-2 rounded bg-white font-mono text-xs text-slate-700 space-y-1">
                <p><strong>SMTP_USER</strong>=your-email@gmail.com</p>
                <p><strong>SMTP_PASS</strong>=xxxx xxxx xxxx xxxx</p>
                <p><strong>SMTP_HOST</strong>=smtp.gmail.com</p>
                <p><strong>SMTP_PORT</strong>=465</p>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                Use an <strong>App Password</strong> (not your regular Gmail password). Generate one at{' '}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google App Passwords</a>.
                Requires 2-Step Verification on your Google account.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
