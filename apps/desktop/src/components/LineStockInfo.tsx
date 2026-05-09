import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client';
import { formatAmount, parseAmount } from '../lib/numberFormat';

interface BatchBalanceRow {
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  batchCode: string;
  expiryDate?: string | null;
  quantity: string;
  oldestReceivedAt?: string | null;
  latestReceivedAt?: string | null;
}

interface BatchBalanceResponse {
  data: BatchBalanceRow[];
  meta?: {
    rowCount?: number;
    totalQuantity?: string;
    batchCount?: number;
    warehouseCount?: number;
  };
}

interface Props {
  productId: string;
  warehouseId: string;
  /** Optional requested quantity to compare against available stock for an inline warning. */
  requestedQuantity?: string;
  /** Render the summary row inline (no top spacing) so callers can place it where they want. */
  compact?: boolean;
}

type ExpiryStatus = 'none' | 'ok' | 'warning' | 'critical' | 'expired';

const DAY_MS = 86_400_000;
const PREVIEW_LIMIT = 8;
const EXPANDED_LIMIT = 50;

const dotClass: Record<ExpiryStatus, string> = {
  none: 'bg-slate-300 dark:bg-slate-600',
  ok: 'bg-emerald-500',
  warning: 'bg-yellow-400',
  critical: 'bg-amber-500',
  expired: 'bg-rose-500',
};

const expiryTextClass: Record<ExpiryStatus, string> = {
  none: 'text-slate-500 dark:text-slate-400',
  ok: 'text-slate-600 dark:text-slate-300',
  warning: 'text-yellow-700 dark:text-yellow-300',
  critical: 'text-amber-700 dark:text-amber-300',
  expired: 'text-rose-700 dark:text-rose-300',
};

function expiryStatus(date?: string | null): { status: ExpiryStatus; days: number | null } {
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

function formatExpiry(date?: string | null) {
  if (!date) return 'no expiry';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return dateFormatter.format(d);
}

function ageLabel(days: number | null) {
  if (days == null) return '';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  if (days < 60) return `in ${days}d`;
  return `in ${Math.round(days / 30)}mo`;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PassiveLine({
  tone = 'muted',
  dot = 'muted',
  children,
  className = '',
}: {
  tone?: 'muted' | 'rose';
  dot?: 'muted' | 'rose' | 'pulse';
  children: React.ReactNode;
  className?: string;
}) {
  const text = tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400';
  const dotCls =
    dot === 'rose' ? 'bg-rose-500' : dot === 'pulse' ? 'animate-pulse bg-slate-400' : 'bg-slate-300 dark:bg-slate-600';
  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} aria-hidden />
      {children}
    </div>
  );
}

export function LineStockInfo({ productId, warehouseId, requestedQuantity, compact = false }: Props) {
  const enabled = !!productId && !!warehouseId;
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');

  // Reset transient UI when context changes.
  useEffect(() => {
    setShowAll(false);
    setFilter('');
    setDebouncedFilter('');
  }, [productId, warehouseId]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedFilter(filter.trim()), 200);
    return () => clearTimeout(id);
  }, [filter]);

  const limit = showAll ? EXPANDED_LIMIT : PREVIEW_LIMIT;

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    q.set('productId', productId);
    q.set('warehouseId', warehouseId);
    q.set('orderBy', 'expiry');
    q.set('limit', String(limit));
    if (debouncedFilter) q.set('batch', debouncedFilter);
    return q.toString();
  }, [productId, warehouseId, limit, debouncedFilter]);

  const batches = useQuery({
    queryKey: ['inventory', 'balances', 'batches', 'line', queryString],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<BatchBalanceResponse>(`/inventory/balances/batches?${queryString}`);
      return res;
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const wrapper = compact ? '' : 'mt-1.5';

  if (!productId) return null;
  if (!warehouseId) {
    return <PassiveLine className={wrapper}>Pick a warehouse to check stock</PassiveLine>;
  }
  if (batches.isLoading && !batches.data) {
    return (
      <PassiveLine dot="pulse" className={wrapper}>
        Checking stock…
      </PassiveLine>
    );
  }
  if (batches.isError) {
    return (
      <PassiveLine tone="rose" dot="rose" className={wrapper}>
        Couldn’t load stock
      </PassiveLine>
    );
  }

  const rows = batches.data?.data ?? [];
  const meta = batches.data?.meta;
  // Server-reported totals always reflect the unfiltered (no `?batch`) universe;
  // when a filter is active we fall back to what we got back so the summary stays honest.
  const totalQty = debouncedFilter
    ? rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0)
    : Number(meta?.totalQuantity ?? rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0));
  const batchCount = debouncedFilter ? rows.length : Number(meta?.batchCount ?? rows.length);
  const requested = requestedQuantity != null ? parseAmount(requestedQuantity) : 0;
  const insufficient = !debouncedFilter && requested > 0 && requested - totalQty > 1e-6;
  const truncated = batchCount > rows.length;

  if (!debouncedFilter && (rows.length === 0 || totalQty <= 0)) {
    return (
      <PassiveLine tone="rose" dot="rose" className={wrapper}>
        <span className="font-medium">Out of stock</span>
        <span className="opacity-80">at this warehouse</span>
      </PassiveLine>
    );
  }

  // Rows are already FEFO-ordered server-side; no client sort needed.
  const sorted = rows;

  const earliest = sorted.find((b) => b.expiryDate);
  const earliestStatus = earliest ? expiryStatus(earliest.expiryDate) : { status: 'none' as const, days: null };
  const summaryDot = insufficient ? 'expired' : earliestStatus.status;

  return (
    <div className={wrapper}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
        aria-expanded={expanded}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass[summaryDot]}`} aria-hidden />
        <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
          {formatAmount(totalQty, 0)}
        </span>
        <span className="text-slate-500 dark:text-slate-400">in stock</span>
        <span className="text-slate-300 dark:text-slate-600" aria-hidden>·</span>
        <span className="text-slate-500 dark:text-slate-400">
          {formatAmount(batchCount, 0)} batch{batchCount === 1 ? '' : 'es'}
        </span>
        {earliest && (
          <>
            <span className="text-slate-300 dark:text-slate-600" aria-hidden>·</span>
            <span className={`truncate ${expiryTextClass[earliestStatus.status]}`}>
              earliest exp {formatExpiry(earliest.expiryDate)}
              {earliestStatus.status !== 'ok' && earliestStatus.days != null && (
                <span className="ml-1 opacity-80">({ageLabel(earliestStatus.days)})</span>
              )}
            </span>
          </>
        )}
        {insufficient && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
            need {formatAmount(requested - totalQty, 0)} more
          </span>
        )}
        <span className="ml-auto text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-200">
          <ChevronIcon open={expanded} />
        </span>
      </button>

      {expanded && (
        <div className="mt-1 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700/70">
          {batchCount > PREVIEW_LIMIT && (
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900/40">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter batches…"
                className="h-6 flex-1 rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-50/95 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur dark:bg-slate-900/80 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Batch</th>
                  <th className="px-2 py-1.5 text-left font-medium">Expiry</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-slate-500 dark:text-slate-400">
                      No batches match “{debouncedFilter}”
                    </td>
                  </tr>
                ) : (
                  sorted.map((b) => {
                    const st = expiryStatus(b.expiryDate);
                    return (
                      <tr
                        key={`${b.batchCode}|${b.expiryDate ?? 'none'}`}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-2 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                          {b.batchCode || 'Unspecified'}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center gap-1.5 ${expiryTextClass[st.status]}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dotClass[st.status]}`} aria-hidden />
                            {formatExpiry(b.expiryDate)}
                            {st.days != null && st.status !== 'ok' && st.status !== 'none' && (
                              <span className="opacity-80">({ageLabel(st.days)})</span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                          {formatAmount(b.quantity, 0)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {(truncated || (showAll && batchCount > EXPANDED_LIMIT) || (showAll && !debouncedFilter)) && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-2 py-1 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              <span>
                Showing {formatAmount(rows.length, 0)} of {formatAmount(batchCount, 0)} (FEFO)
                {showAll && batchCount > EXPANDED_LIMIT && (
                  <span className="ml-1 opacity-80">— use the filter to narrow further</span>
                )}
              </span>
              {truncated && !showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Show more
                </button>
              ) : showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className="font-medium text-slate-600 hover:underline dark:text-slate-300"
                >
                  Collapse
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
