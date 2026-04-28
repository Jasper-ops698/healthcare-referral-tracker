/**
 * Settings Events — Cross-component settings change notification
 *
 * Used by:
 *   • Settings.tsx  → fires when user changes a setting
 *   • App.tsx       → listens to update idle timer timeout
 *
 * This avoids circular dependencies (Settings → App → Settings).
 */

export const SETTINGS_CHANGE_EVENT = 'healthtrack:settings:change';

/** Call this whenever settings are saved to localStorage */
export function notifySettingsChanged() {
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
}

/** Subscribe to settings changes */
export function onSettingsChange(callback: () => void): () => void {
  window.addEventListener(SETTINGS_CHANGE_EVENT, callback);
  return () => window.removeEventListener(SETTINGS_CHANGE_EVENT, callback);
}
