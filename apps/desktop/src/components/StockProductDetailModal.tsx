import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch } from '../api/client';
import {
  expiryAgeLabel,
  expiryDotClass,
  expiryStatus,
  expiryTextClass,
  formatExpiry,
} from '../lib/expiryDisplay';
import { formatAmount } from '../lib/numberFormat';
import { useMoneyFormat } from '../hooks/useMoneyFormat';

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
  valueAtLayers: string;
  unitCost?: string;
  tradePrice?: string;
  retailPrice?: string;
}

export interface StockDetailContext {
  productId: string;
  warehouseId: string;
  sku: string;
  productName: string;
  warehouseLabel: string;
  supplierName?: string;
  summaryQuantity: string;
  summaryValueAtLayers?: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  context: StockDetailContext | null;
};

export function StockProductDetailModal({ open, onClose, context }: Props) {
  const { formatMoney } = useMoneyFormat();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const queryString =
    context != null
      ? new URLSearchParams({
          productId: context.productId,
          warehouseId: context.warehouseId,
          orderBy: 'expiry',
          limit: '500',
        }).toString()
      : '';

  const batches = useQuery({
    queryKey: ['inventory', 'balances', 'batches', 'detail', queryString],
    enabled: open && !!context,
    queryFn: async () => {
      const res = await apiFetch<{ data: BatchBalanceRow[]; meta?: { batchCount?: number; totalQuantity?: string } }>(
        `/inventory/balances/batches?${queryString}`
      );
      return res;
    },
  });

  if (!open || !context) return null;

  const rows = batches.data?.data ?? [];
  const totalQty = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  const batchCount = batches.data?.meta?.batchCount ?? rows.length;
  const earliest = rows.find((b) => b.expiryDate);
  const earliestSt = earliest ? expiryStatus(earliest.expiryDate) : { status: 'none' as const, days: null };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{context.productName}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-mono text-xs">{context.sku}</span>
              <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
              {context.supplierName ?? '—'}
              <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
              {context.warehouseLabel}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950/50">
          <div>
            <span className="text-slate-500 dark:text-slate-400">On hand </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatAmount(totalQty || context.summaryQuantity, 0)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Batches </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatAmount(batchCount, 0)}</span>
          </div>
          {context.summaryValueAtLayers != null && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Value </span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatMoney(context.summaryValueAtLayers)}
              </span>
            </div>
          )}
          {earliest && (
            <div className={`inline-flex items-center gap-1.5 ${expiryTextClass[earliestSt.status]}`}>
              <span className={`h-2 w-2 rounded-full ${expiryDotClass[earliestSt.status]}`} aria-hidden />
              <span>
                Earliest expiry {formatExpiry(earliest.expiryDate)}
                {earliestSt.days != null && earliestSt.status !== 'ok' && (
                  <span className="ml-1 opacity-80">({expiryAgeLabel(earliestSt.days)})</span>
                )}
              </span>
            </div>
          )}
        </div>

        {batches.isLoading && <p className="mt-6 text-slate-500">Loading batch detail…</p>}
        {batches.isError && (
          <p className="mt-6 text-sm text-red-700 dark:text-red-400">Could not load batch detail. Try again.</p>
        )}

        {!batches.isLoading && !batches.isError && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Batch</th>
                  <th className="px-3 py-2 text-left font-medium">Expiry</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                  <th className="px-3 py-2 text-right font-medium">Trade</th>
                  <th className="px-3 py-2 text-right font-medium">Retail</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No batch detail for this product at this warehouse.
                    </td>
                  </tr>
                ) : (
                  rows.map((b) => {
                    const st = expiryStatus(b.expiryDate);
                    return (
                      <tr
                        key={`${b.batchCode}|${b.expiryDate ?? 'none'}`}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                          {b.batchCode || 'Unspecified'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1.5 ${expiryTextClass[st.status]}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${expiryDotClass[st.status]}`} aria-hidden />
                            {formatExpiry(b.expiryDate)}
                            {st.days != null && st.status !== 'ok' && st.status !== 'none' && (
                              <span className="opacity-80">({expiryAgeLabel(st.days)})</span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatAmount(b.quantity, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {b.unitCost != null ? formatMoney(b.unitCost) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {b.tradePrice != null ? formatMoney(b.tradePrice) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {b.retailPrice != null ? formatMoney(b.retailPrice) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(b.valueAtLayers)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Batches ordered by expiry (FEFO — first expiry, first out).
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
