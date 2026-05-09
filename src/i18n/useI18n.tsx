/**
 * useI18n — Internationalization Context
 *
 * Provides:
 *   • t(key)     — translate a key to current language
 *   • lang       — current language code
 *   • setLang()  — switch language (persists to localStorage + backend)
 *
 * Usage:
 *   const { t, lang, setLang } = useI18n();
 *   <h1>{t('sidebar.dashboard')}</h1>
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { Translations, type LangCode, keyof typeof Translations } from './translations';

interface I18nContextType {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: typeof Translations, vars?: Record<string, string>) => string;
  isReady: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'healthtrack_language';

function loadLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'sw' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(loadLang);
  const [isReady, setIsReady] = useState(false);

  // Apply language to <html> element for potential CSS selectors
  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    setIsReady(true);
  }, [lang]);

  const setLang = useCallback((newLang: LangCode) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: Translations, vars?: Record<string, string>): string => {
    const dict = translations[lang] as Record<string, string>;
    let text = dict[key] ?? translations.en[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }
    return text;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isReady }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
