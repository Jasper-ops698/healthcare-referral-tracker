import { useCallback } from 'react';
import { useI18n } from './useI18n';

const SWAHILI_MONTHS = [
  'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni',
  'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
];

const SWAHILI_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des',
];

/**
 * useFormatDate — Language-aware date formatting
 *
 * Returns a formatDate() function that formats dates in the current language.
 * For Swahili: replaces English month names with Swahili equivalents.
 * For English: delegates to native toLocaleDateString().
 */
export function useFormatDate() {
  const { lang } = useI18n();

  const formatDate = useCallback((
    date: Date | string | number | undefined,
    type: 'short' | 'long' | 'withTime' = 'short'
  ): string => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();

    if (lang === 'sw') {
      const monthName = type === 'short' ? SWAHILI_MONTHS_SHORT[month] : SWAHILI_MONTHS[month];
      if (type === 'withTime') {
        const hours = d.getHours().toString().padStart(2, '0');
        const mins = d.getMinutes().toString().padStart(2, '0');
        return `${day} ${monthName} ${year}, ${hours}:${mins}`;
      }
      if (type === 'long') {
        return `${day} ${monthName} ${year}`;
      }
      return `${day} ${monthName} ${year}`;
    }

    // English formatting
    if (type === 'long') {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    if (type === 'withTime') {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [lang]);

  return formatDate;
}

/**
 * Standalone function for non-hook contexts (e.g., utility files).
 * Pass the current language code explicitly.
 */
export function formatDateLocalized(
  date: Date | string | number | undefined,
  lang: 'en' | 'sw',
  type: 'short' | 'long' | 'withTime' = 'short'
): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();

  if (lang === 'sw') {
    const monthName = type === 'short' ? SWAHILI_MONTHS_SHORT[month] : SWAHILI_MONTHS[month];
    if (type === 'withTime') {
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${day} ${monthName} ${year}, ${hours}:${mins}`;
    }
    return `${day} ${monthName} ${year}`;
  }

  if (type === 'long') {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (type === 'withTime') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
