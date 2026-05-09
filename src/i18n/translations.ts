/**
 * Patient Referral Tracker — Translation Dictionaries
 *
 * Supported languages:
 *   en  — English (default)
 *   sw  — Kiswahili
 *
 * Usage: const { t } = useI18n();
 *        t('sidebar.dashboard') → "Dashboard" or "Dashibodi"
 */

export type LangCode = 'en' | 'sw';

export const translations = {
  en: {
    // ... keep your existing English keys ...
  },
  sw: {
    // ... you can use bare fallback, or customize each translation. For now copy English to avoid key errors ...
  }
};

export type TranslationKey = keyof typeof translations['en'];
