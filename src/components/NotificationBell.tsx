/**
 * NotificationBell — In-app notification center
 *
 * Opens as a centered modal overlay instead of a dropdown,
 * preventing any overlap with sidebar or content areas.
 */

import { useState, useEffect } from 'react';
import { Bell, BellRing, CheckCheck, Trash2, Settings } from 'lucide-react';
import { useNotifications, isPushSupported } from '@/hooks/useNotifications';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const {
    history,
    unreadCount,
    isSubscribed,
    permission,
    loading,
    subscribe,
    unsubscribe,
    markAllRead,
    markRead,
    clearHistory,
  } = useNotifications();

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(true)}
        className={`relative p-2 rounded-lg transition-colors ${
          open
            ? 'bg-white/20 text-white'
            : 'text-white/70 hover:text-white hover:bg-white/10'
        }`}
        title="Notifications"
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Centered Modal Overlay */}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-sky-500" />
                <h3 className="font-semibold text-base text-gray-900 dark:text-white">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-medium rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Mark all read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Push Subscribe CTA */}
            {isPushSupported() && permission !== 'denied' && !isSubscribed && (
              <div className="px-5 py-4 bg-sky-50 dark:bg-sky-900/20 border-b border-sky-100 dark:border-sky-800">
                <p className="text-sm text-sky-700 dark:text-sky-300 mb-3">
                  Enable push notifications for real-time alerts
                </p>
                <button
                  onClick={async () => { await subscribe(); }}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Enabling...' : 'Enable Push Notifications'}
                </button>
              </div>
            )}

            {/* Notification List */}
            <div className="max-h-[50vh] overflow-y-auto">
              {history.length === 0 ? (
                <div className="px-5 py-12 text-center text-gray-400 dark:text-gray-500">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                  <p className="text-xs mt-1 opacity-70">
                    Notifications will appear here when events occur
                  </p>
                </div>
              ) : (
                history.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`w-full text-left px-5 py-3.5 border-b border-gray-50 dark:border-gray-700/50 transition-colors ${
                      n.read
                        ? 'opacity-60 hover:opacity-80'
                        : 'bg-sky-50/40 dark:bg-sky-900/10 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                          n.read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-sky-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                          {formatTime(n.timestamp)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {isSubscribed ? (
                <button
                  onClick={unsubscribe}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Disable push
                </button>
              ) : (
                <span />
              )}
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear all
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
