import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../api/client';
import { LogisticsSubNav } from '../../components/LogisticsSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

export function LogisticsReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'reports.logistics:read');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const bySp = useQuery({
    queryKey: ['reports', 'sales-by-salesperson', dateFrom, dateTo],
    enabled: canRead,
    queryFn: () =>
      apiFetch<{
        data: Array<{
          salespersonId: string | null;
          salespersonName: string;
          invoiceCount: number;
          totalValue: string;
          totalQuantity: string;
        }>;
        meta: { grandTotal: string; grandQuantity: string };
      }>(
        `/reports/sales-by-salesperson?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      ).then((r) => r),
  });

  const byRoute = useQuery({
    queryKey: ['reports', 'sales-by-route', dateFrom, dateTo],
    enabled: canRead,
    queryFn: () =>
      apiFetch<{
        data: Array<{
          routeId: string | null;
          routeName: string;
          routeCode: string;
          invoiceCount: number;
          totalValue: string;
          totalQuantity: string;
        }>;
        meta: { grandTotal: string; grandQuantity: string };
      }>(`/reports/sales-by-route?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`).then(
        (r) => r
      ),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Logistics reports</h1>
      <p className="mt-1 text-slate-600">Posted sales by salesperson and by customer default route</p>
      <LogisticsSubNav />
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="text-slate-600">From</span>
          <input
            type="date"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">To</span>
          <input
            type="date"
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Sales by salesperson</h2>
        <p className="mt-1 text-xs text-slate-500">
          Totals: {bySp.data?.meta.grandTotal ?? '—'} · Qty {bySp.data?.meta.grandQuantity ?? '—'}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Salesperson</th>
                <th className="px-3 py-2 text-right">Invoices</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(bySp.data?.data ?? []).map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.salespersonName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.invoiceCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalValue}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Sales by route</h2>
        <p className="mt-1 text-xs text-slate-500">
          Based on customer default route. Totals: {byRoute.data?.meta.grandTotal ?? '—'} · Qty{' '}
          {byRoute.data?.meta.grandQuantity ?? '—'}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Route</th>
                <th className="px-3 py-2 text-right">Invoices</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(byRoute.data?.data ?? []).map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {r.routeName}
                    {r.routeCode ? ` (${r.routeCode})` : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.invoiceCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalValue}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
