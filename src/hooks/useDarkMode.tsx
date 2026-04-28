/**
 * useDarkMode — Theme management with localStorage persistence
 *
 * Supports three modes:
 *   - 'light'  — Always light
 *   - 'dark'   — Always dark
 *   - 'system' — Follows OS preference
 *
 * Persists choice in localStorage and applies 'dark' class to <html>.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface DarkModeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

const STORAGE_KEY = 'healthtrack_theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(STORAGE_KEY) as Theme) || 'system';
  });

  const [isDark, setIsDark] = useState(() => resolveTheme(theme) === 'dark');

  // Apply theme class to <html> element
  useEffect(() => {
    const resolved = resolveTheme(theme);
    const dark = resolved === 'dark';
    setIsDark(dark);

    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = resolveTheme('system');
      setIsDark(resolved === 'dark');
      const root = document.documentElement;
      if (resolved === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    };

    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev: Theme) => {
      const next: Theme = prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <DarkModeContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  const ctx = useContext(DarkModeContext);
  if (!ctx) throw new Error('useDarkMode must be within DarkModeProvider');
  return ctx;
}
