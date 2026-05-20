export type ExpiryStatus = 'none' | 'ok' | 'warning' | 'critical' | 'expired';

const DAY_MS = 86_400_000;

export const expiryDotClass: Record<ExpiryStatus, string> = {
  none: 'bg-slate-300 dark:bg-slate-600',
  ok: 'bg-emerald-500',
  warning: 'bg-yellow-400',
  critical: 'bg-amber-500',
  expired: 'bg-rose-500',
};

export const expiryTextClass: Record<ExpiryStatus, string> = {
  none: 'text-slate-500 dark:text-slate-400',
  ok: 'text-slate-600 dark:text-slate-300',
  warning: 'text-yellow-700 dark:text-yellow-300',
  critical: 'text-amber-700 dark:text-amber-300',
  expired: 'text-rose-700 dark:text-rose-300',
};

export function expiryStatus(date?: string | null): { status: ExpiryStatus; days: number | null } {
  if (!date) return { status: 'none', days: null };
  const exp = new Date(date);
  if (Number.isNaN(exp.getTime())) return { status: 'none', days: null };
  const days = Math.round((exp.getTime() - Date.now()) / DAY_MS);
  if (days < 0) return { status: 'expired', days };
  if (days <= 30) return { status: 'critical', days };
  if (days <= 90) return { status: 'warning', days };
  return { status: 'ok', days };
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatExpiry(date?: string | null) {
  if (!date) return 'no expiry';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return dateFormatter.format(d);
}

export function expiryAgeLabel(days: number | null) {
  if (days == null) return '';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  if (days < 60) return `in ${days}d`;
  return `in ${Math.round(days / 30)}mo`;
}
