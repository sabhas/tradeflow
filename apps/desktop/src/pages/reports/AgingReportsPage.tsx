import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { downloadXlsx } from '../../lib/downloadXlsx';
import { hasPermission } from '../../lib/permissions';
import { printTableAsPdf } from '../../lib/printTable';
import { useAppSelector } from '../../hooks/useAppSelector';

type Bucket = { current: string; d1_30: string; d31_60: string; d61_90: string; d90p: string };

type ReceivableRow = { customerId: string; customerName: string; totalOpen: string; buckets: Bucket };
type PayableRow = { supplierId: string; supplierName: string; totalOpen: string; buckets: Bucket };

export function AgingReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRecv = hasPermission(permissions, 'sales:read');
  const canPay = hasPermission(permissions, 'purchases.reports:read');

  const [tab, setTab] = useState<'recv' | 'pay'>(() => (canRecv ? 'recv' : 'pay'));
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  const qs = useMemo(() => new URLSearchParams({ asOf }).toString(), [asOf]);

  const recv = useQuery({
    queryKey: ['reports', 'aging', qs],
    enabled: canRecv && tab === 'recv',
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<{ data: ReceivableRow[]; meta: { asOf: string } }>(`/reports/receivables-aging?${qs}`).then(
        (r) => r
      ),
  });

  const pay = useQuery({
    queryKey: ['reports', 'payables-aging', qs],
    enabled: canPay && tab === 'pay',
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<{ data: PayableRow[]; meta: { asOf: string } }>(`/reports/payables-aging?${qs}`).then((r) => r),
  });

  if (!canRecv && !canPay) {
    return <p className="text-slate-600">You need sales or purchase report access to view aging.</p>;
  }

  const subtitle = `As of ${asOf}`;

  const bucketCols = ['Current', '1–30', '31–60', '61–90', '90+', 'Total open'];

  const exportRecvExcel = async () => {
    const d = recv.data?.data;
    if (!d?.length) return;
    const cols = ['Customer', ...bucketCols];
    const rows = d.map((r) => [
      r.customerName,
      r.buckets.current,
      r.buckets.d1_30,
      r.buckets.d31_60,
      r.buckets.d61_90,
      r.buckets.d90p,
      r.totalOpen,
    ]);
    await downloadXlsx(`receivables-aging-${asOf}.xlsx`, 'Receivables', cols, rows);
  };

  const exportRecvPdf = () => {
    const d = recv.data?.data;
    if (!d?.length) return;
    printTableAsPdf(
      'Receivables aging',
      subtitle,
      ['Customer', 'Current', '1–30', '31–60', '61–90', '90+', 'Total'],
      d.map((r) => [
        r.customerName,
        r.buckets.current,
        r.buckets.d1_30,
        r.buckets.d31_60,
        r.buckets.d61_90,
        r.buckets.d90p,
        r.totalOpen,
      ])
    );
  };

  const exportPayExcel = async () => {
    const d = pay.data?.data;
    if (!d?.length) return;
    const cols = ['Supplier', ...bucketCols];
    const rows = d.map((r) => [
      r.supplierName,
      r.buckets.current,
      r.buckets.d1_30,
      r.buckets.d31_60,
      r.buckets.d61_90,
      r.buckets.d90p,
      r.totalOpen,
    ]);
    await downloadXlsx(`payables-aging-${asOf}.xlsx`, 'Payables', cols, rows);
  };

  const exportPayPdf = () => {
    const d = pay.data?.data;
    if (!d?.length) return;
    printTableAsPdf(
      'Payables aging',
      subtitle,
      ['Supplier', 'Current', '1–30', '31–60', '61–90', '90+', 'Total'],
      d.map((r) => [
        r.supplierName,
        r.buckets.current,
        r.buckets.d1_30,
        r.buckets.d31_60,
        r.buckets.d61_90,
        r.buckets.d90p,
        r.totalOpen,
      ])
    );
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800">Aging</h2>
      <p className="mt-1 text-sm text-slate-600">
        Open posted credit sales invoices (receivables) and supplier invoices (payables) by due-date bucket.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {canRecv && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'recv' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('recv')}
          >
            Receivables
          </button>
        )}
        {canPay && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'pay' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('pay')}
          >
            Payables
          </button>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="text-slate-600">As of</span>
          <input
            type="date"
            className="rounded-md border border-slate-300 px-2 py-1.5"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>

        {tab === 'recv' && recv.isPending && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {tab === 'recv' && recv.isError && (
          <p className="mt-6 text-sm text-red-600">{(recv.error as Error).message}</p>
        )}
        {tab === 'recv' && recv.data && (
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportRecvExcel().catch(() => {})}
                disabled={!recv.data.data.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportRecvPdf}
                disabled={!recv.data.data.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-right">Current</th>
                    <th className="px-3 py-2 text-right">1–30</th>
                    <th className="px-3 py-2 text-right">31–60</th>
                    <th className="px-3 py-2 text-right">61–90</th>
                    <th className="px-3 py-2 text-right">90+</th>
                    <th className="px-3 py-2 text-right">Total open</th>
                  </tr>
                </thead>
                <tbody>
                  {recv.data.data.map((r) => (
                    <tr key={r.customerId} className="border-t border-slate-100">
                      <td className="px-3 py-2">{r.customerName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.current}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d1_30}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d31_60}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d61_90}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d90p}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{r.totalOpen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recv.data.data.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No open receivables for this as-of date.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'pay' && pay.isPending && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {tab === 'pay' && pay.isError && (
          <p className="mt-6 text-sm text-red-600">{(pay.error as Error).message}</p>
        )}
        {tab === 'pay' && pay.data && (
          <div className="mt-6">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportPayExcel().catch(() => {})}
                disabled={!pay.data.data.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportPayPdf}
                disabled={!pay.data.data.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Supplier</th>
                    <th className="px-3 py-2 text-right">Current</th>
                    <th className="px-3 py-2 text-right">1–30</th>
                    <th className="px-3 py-2 text-right">31–60</th>
                    <th className="px-3 py-2 text-right">61–90</th>
                    <th className="px-3 py-2 text-right">90+</th>
                    <th className="px-3 py-2 text-right">Total open</th>
                  </tr>
                </thead>
                <tbody>
                  {pay.data.data.map((r) => (
                    <tr key={r.supplierId} className="border-t border-slate-100">
                      <td className="px-3 py-2">{r.supplierName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.current}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d1_30}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d31_60}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d61_90}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d90p}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{r.totalOpen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pay.data.data.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No open payables for this as-of date.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
