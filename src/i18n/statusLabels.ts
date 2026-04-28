import { useI18n } from './useI18n';
import type { ReferralStatus } from '@/types';

export function useStatusConfig() {
  const { t } = useI18n();

  return {
    registered:   { label: t('status.registered'),   bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',   dot: 'bg-slate-400' },
    screened:     { label: t('status.screened'),     bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500' },
    referred:     { label: t('status.referred'),     bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
    accepted:     { label: t('status.accepted'),     bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-500' },
    'in-treatment': { label: t('status.in-treatment'), bg: 'bg-pink-50', text: 'text-pink-700',    border: 'border-pink-200',    dot: 'bg-pink-500' },
    completed:    { label: t('status.completed'),    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    rejected:     { label: t('status.rejected'),     bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
  } as Record<ReferralStatus, { label: string; bg: string; text: string; border: string; dot: string }>;
}
