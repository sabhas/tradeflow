import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { ReportsSubNav } from '../../components/ReportsSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

function defaultRange() {
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - 3);
  return { dateFrom: dateFrom.toISOString().slice(0, 10), dateTo };
}

export function InventoryHealthReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canInv = hasPermission(permissions, 'inventory:read');
  const canSales = hasPermission(permissions, 'sales:read');

  const initial = defaultRange();
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [daysWithoutSale, setDaysWithoutSale] = useState(90);
  const [slowLimit, setSlowLimit] = useState(50);

  const lowStock = useQuery({
    queryKey: ['inventory', 'low-stock'],
    enabled: canInv,
    queryFn: () => apiFetch<{ data: unknown[]; meta: { rowCount: number } }>('/inventory/balances/low-stock').then((r) => r),
  });

  const deadQs = useMemo(() => {
    const q = new URLSearchParams();
    q.set('asOf', asOf);
    q.set('daysWithoutSale', String(daysWithoutSale));
    return q.toString();
  }, [asOf, daysWithoutSale]);

  const dead = useQuery({
    queryKey: ['reports', 'dead-stock', deadQs],
    enabled: canInv,
    queryFn: () =>
      apiFetch<{ data: Record<string, string>[]; meta: Record<string, unknown> }>(
        `/reports/dead-stock?${deadQs}`
      ).then((r) => r),
  });

  const slowQs = useMemo(() => {
    const q = new URLSearchParams({ dateFrom, dateTo });
    q.set('limit', String(slowLimit));
    return q.toString();
  }, [dateFrom, dateTo, slowLimit]);

  const slow = useQuery({
    queryKey: ['reports', 'slow-moving', slowQs],
    enabled: canSales,
    queryFn: () =>
      apiFetch<{ data: Record<string, string>[] }>(`/reports/slow-moving?${slowQs}`).then((r) => r),
  });

  if (!canInv && !canSales) {
    return <p className="text-slate-600">No permission.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Inventory health</h1>
      <p className="mt-1 text-slate-600">Low stock, dead stock, and slow-moving SKUs.</p>
      <ReportsSubNav />

      {canInv && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-slate-800">Low stock</h2>
          <p className="mt-1 text-sm text-slate-600">Where on-hand quantity is below min or reorder level.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Warehouse</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2 text-right">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {((lowStock.data?.data ?? []) as Record<string, string>[]).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.productSku}</td>
                    <td className="px-3 py-2">{r.productName}</td>
                    <td className="px-3 py-2">{r.warehouseName}</td>
                    <td className="px-3 py-2 text-right">{r.quantityOnHand}</td>
                    <td className="px-3 py-2 text-right">{r.minStock ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{r.reorderLevel ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {((lowStock.data?.data ?? []) as unknown[]).length === 0 && (
              <p className="px-3 py-6 text-center text-slate-500">No rows.</p>
            )}
          </div>
        </section>
      )}

      {canInv && (
        <section className="mt-10">
          <h2 className="text-lg font-medium text-slate-800">Dead stock</h2>
          <p className="mt-1 text-sm text-slate-600">On-hand quantity with no sales in the lookback window.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">As of</span>
              <input
                type="date"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Days without sale</span>
              <input
                type="number"
                min={1}
                className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={daysWithoutSale}
                onChange={(e) => setDaysWithoutSale(parseInt(e.target.value, 10) || 90)}
              />
            </label>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Warehouse</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                </tr>
              </thead>
              <tbody>
                {(dead.data?.data ?? []).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.productSku}</td>
                    <td className="px-3 py-2">{r.productName}</td>
                    <td className="px-3 py-2">{r.warehouseName}</td>
                    <td className="px-3 py-2 text-right">{r.quantityOnHand}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(dead.data?.data ?? []).length === 0 && (
              <p className="px-3 py-6 text-center text-slate-500">No rows.</p>
            )}
          </div>
        </section>
      )}

      {canSales && (
        <section className="mt-10">
          <h2 className="text-lg font-medium text-slate-800">Slow-moving</h2>
          <p className="mt-1 text-sm text-slate-600">Lowest quantity sold in the selected period.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">From</span>
              <input
                type="date"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">To</span>
              <input
                type="date"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Limit</span>
              <input
                type="number"
                min={1}
                max={500}
                className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={slowLimit}
                onChange={(e) => setSlowLimit(parseInt(e.target.value, 10) || 50)}
              />
            </label>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Qty sold</th>
                </tr>
              </thead>
              <tbody>
                {(slow.data?.data ?? []).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.productSku}</td>
                    <td className="px-3 py-2">{r.productName}</td>
                    <td className="px-3 py-2 text-right">{r.quantitySold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(slow.data?.data ?? []).length === 0 && (
              <p className="px-3 py-6 text-center text-slate-500">No rows.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
