import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../api/client';
import { SalesSubNav } from '../../components/SalesSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface CustomerOpt {
  id: string;
  name: string;
}

export function SalesReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'sales:read');
  const [tab, setTab] = useState<'statement' | 'aging'>('statement');
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  const customers = useQuery({
    queryKey: ['customers', 'sales-dd'],
    enabled: canRead && tab === 'statement',
    queryFn: () => apiFetch<{ data: CustomerOpt[] }>('/customers?limit=500').then((r) => r.data),
  });

  const statement = useQuery({
    queryKey: ['statement', customerId, dateFrom, dateTo],
    enabled: canRead && tab === 'statement' && !!customerId,
    queryFn: () =>
      apiFetch<{
        data: {
          openingBalance: string;
          closingBalance: string;
          lines: Array<{
            kind: string;
            date: string;
            debit: string;
            credit: string;
            ref: string;
            balance: string;
          }>;
        };
      }>(
        `/customers/${customerId}/statement?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      ).then((r) => r.data),
  });

  const aging = useQuery({
    queryKey: ['aging', asOf],
    enabled: canRead && tab === 'aging',
    queryFn: () =>
      apiFetch<{
        data: Array<{
          customerId: string;
          customerName: string;
          totalOpen: string;
          buckets: Record<string, string>;
        }>;
        meta: { asOf: string };
      }>(`/reports/aging?asOf=${encodeURIComponent(asOf)}`).then((r) => r),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Sales reports</h1>
      <p className="mt-1 text-slate-600">Customer statement and receivables aging</p>
      <SalesSubNav />

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === 'statement' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
          }`}
          onClick={() => setTab('statement')}
        >
          Statement
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === 'aging' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
          }`}
          onClick={() => setTab('aging')}
        >
          Aging
        </button>
      </div>

      {tab === 'statement' && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600">Customer</span>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Select —</option>
                {(customers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">From</span>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">To</span>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
          </div>

          {statement.data && (
            <div className="mt-6">
              <p className="text-sm text-slate-600">
                Opening: <span className="font-medium tabular-nums">{statement.data.openingBalance}</span> · Closing:{' '}
                <span className="font-medium tabular-nums">{statement.data.closingBalance}</span>
              </p>
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Ref</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.data.lines.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2">{row.date}</td>
                        <td className="px-3 py-2 capitalize">{row.kind}</td>
                        <td className="px-3 py-2">{row.ref}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.debit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.credit}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{row.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'aging' && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="inline-block text-sm">
            <span className="text-slate-600">As of</span>
            <input
              type="date"
              className="ml-2 rounded-md border border-slate-300 px-3 py-2"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-right">Total open</th>
                  <th className="px-3 py-2 text-right">Current</th>
                  <th className="px-3 py-2 text-right">1–30</th>
                  <th className="px-3 py-2 text-right">31–60</th>
                  <th className="px-3 py-2 text-right">61–90</th>
                  <th className="px-3 py-2 text-right">90+</th>
                </tr>
              </thead>
              <tbody>
                {(aging.data?.data ?? []).map((r) => (
                  <tr key={r.customerId} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.customerName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.totalOpen}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.buckets.current}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d1_30}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d31_60}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d61_90}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.buckets.d90p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(aging.data?.data ?? []).length === 0 && (
              <p className="p-4 text-sm text-slate-500">No open receivables.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
