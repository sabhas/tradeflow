import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from '../../api/client';
import { ChartCard } from '../../components/charts/ChartCard';
import { getChartTheme } from '../../components/charts/chartTheme';
import { Combobox } from '../../components/Combobox';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';

interface SupplierOpt {
  id: string;
  name: string;
}

export function PurchaseReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'purchases.reports:read');
  const [tab, setTab] = useState<'statement' | 'aging' | 'pricing'>('statement');
  const [supplierId, setSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const chartTheme = getChartTheme();
  const { formatMoney } = useMoneyFormat();

  const suppliers = useQuery({
    queryKey: ['suppliers', 'rep-dd'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: SupplierOpt[] }>('/suppliers?limit=500').then((r) => r.data),
  });

  const statement = useQuery({
    queryKey: ['supp-statement', supplierId, dateFrom, dateTo],
    enabled: canRead && tab === 'statement' && !!supplierId,
    queryFn: () =>
      apiFetch<{
        data: {
          openingBalance: string;
          closingBalance: string;
          lines: Array<{ kind: string; date: string; debit: string; credit: string; ref: string; balance: string }>;
        };
      }>(
        `/suppliers/${supplierId}/statement?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      ).then((r) => r.data),
  });

  const aging = useQuery({
    queryKey: ['payables-aging', asOf],
    enabled: canRead && tab === 'aging',
    queryFn: () =>
      apiFetch<{
        data: Array<{
          supplierId: string;
          supplierName: string;
          totalOpen: string;
          buckets: Record<string, string>;
        }>;
        meta: { asOf: string };
      }>(`/reports/payables-aging?asOf=${encodeURIComponent(asOf)}`).then((r) => r),
  });

  const pricing = useQuery({
    queryKey: ['pricing-history', supplierId],
    enabled: canRead && tab === 'pricing' && !!supplierId,
    queryFn: () =>
      apiFetch<{
        data: Array<{
          lineId: string;
          source: string;
          date: string;
          productId: string;
          unitPrice: string;
          documentId: string;
        }>;
      }>(`/suppliers/${supplierId}/pricing-history`).then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'pricing-labels'],
    enabled: canRead && tab === 'pricing' && !!pricing.data?.length,
    queryFn: () => apiFetch<{ data: Array<{ id: string; sku: string; name: string }> }>('/products?limit=500&activeOnly=true').then((r) => r.data),
  });

  const supplierOptions = useMemo(
    () => (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data]
  );

  if (!canRead) return <p className="text-slate-600">No permission.</p>;
  const payablesSummary = [
    { label: 'Current', value: (aging.data?.data ?? []).reduce((s, r) => s + Number(r.buckets.current), 0) },
    { label: '1-30', value: (aging.data?.data ?? []).reduce((s, r) => s + Number(r.buckets.d1_30), 0) },
    { label: '31-60', value: (aging.data?.data ?? []).reduce((s, r) => s + Number(r.buckets.d31_60), 0) },
    { label: '61-90', value: (aging.data?.data ?? []).reduce((s, r) => s + Number(r.buckets.d61_90), 0) },
    { label: '90+', value: (aging.data?.data ?? []).reduce((s, r) => s + Number(r.buckets.d90p), 0) },
  ];
  const pricingChartData = (pricing.data ?? []).map((r) => ({
    date: r.date,
    product: productName(r.productId),
    unitPrice: Number(r.unitPrice || 0),
  }));

  const productName = (id: string) => {
    const p = products.data?.find((x) => x.id === id);
    return p ? `${p.sku} ${p.name}` : id.slice(0, 8);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Purchase reports</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Supplier statement, payables aging, and pricing history
      </p>
      <PurchaseSubNav />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === 'statement'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
          }`}
          onClick={() => setTab('statement')}
        >
          Statement
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === 'aging'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
          }`}
          onClick={() => setTab('aging')}
        >
          Payables aging
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === 'pricing'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
          }`}
          onClick={() => setTab('pricing')}
        >
          Pricing history
        </button>
      </div>

      {tab === 'statement' && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Supplier</span>
              <Combobox
                className="mt-1 w-full max-w-none"
                inputClassName="rounded-md border border-slate-300 px-3 py-2"
                value={supplierId}
                onChange={setSupplierId}
                options={supplierOptions}
                placeholder="Search supplier…"
                disabled={suppliers.isLoading}
                aria-label="Supplier"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">From</span>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">To</span>
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
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  Opening balance: <strong className="tabular-nums">{formatMoney(statement.data.openingBalance)}</strong>
                </span>
                <span>
                  Closing balance: <strong className="tabular-nums">{formatMoney(statement.data.closingBalance)}</strong>
                </span>
              </div>
              <table className="mt-4 min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Ref</th>
                    <th className="py-2 pr-4 text-right">Debit</th>
                    <th className="py-2 pr-4 text-right">Credit</th>
                    <th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.data.lines.map((row, i) => (
                    <tr
                      key={`${row.kind}-${i}`}
                      className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2 pr-4 tabular-nums">{row.date}</td>
                      <td className="py-2 pr-4">{row.ref}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(row.debit)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(row.credit)}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{formatMoney(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'aging' && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <ChartCard title="Payables aging summary" subtitle={`As of ${asOf}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payablesSummary}>
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke={chartTheme.axis} />
                <YAxis stroke={chartTheme.axis} />
                <Tooltip />
                <Bar dataKey="value" fill={chartTheme.palette[1]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <label className="block max-w-xs text-sm">
            <span className="text-slate-600 dark:text-slate-400">As of</span>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          <table className="mt-6 min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-4">Supplier</th>
                <th className="py-2 pr-4 text-right">Open</th>
                <th className="py-2 pr-4 text-right">Current</th>
                <th className="py-2 pr-4 text-right">1–30</th>
                <th className="py-2 pr-4 text-right">31–60</th>
                <th className="py-2 pr-4 text-right">61–90</th>
                <th className="py-2 text-right">90+</th>
              </tr>
            </thead>
            <tbody>
              {(aging.data?.data ?? []).map((r) => (
                <tr
                  key={r.supplierId}
                  className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="py-2 pr-4">{r.supplierName}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(r.totalOpen)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(r.buckets.current)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(r.buckets.d1_30)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(r.buckets.d31_60)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(r.buckets.d61_90)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(r.buckets.d90p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!aging.isLoading && (aging.data?.data.length ?? 0) === 0 && (
            <p className="mt-4 text-slate-500">No open payables for this date.</p>
          )}
        </div>
      )}

      {tab === 'pricing' && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <label className="block max-w-md text-sm">
            <span className="text-slate-600 dark:text-slate-400">Supplier</span>
            <Combobox
              className="mt-1 w-full max-w-none"
              inputClassName="rounded-md border border-slate-300 px-3 py-2"
              value={supplierId}
              onChange={setSupplierId}
              options={supplierOptions}
              placeholder="Search supplier…"
              disabled={suppliers.isLoading}
              aria-label="Supplier"
            />
          </label>
          <ChartCard title="Supplier pricing trend" subtitle="Unit price over time">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pricingChartData}>
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke={chartTheme.axis} />
                <YAxis stroke={chartTheme.axis} />
                <Tooltip />
                <Line type="monotone" dataKey="unitPrice" stroke={chartTheme.palette[2]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <table className="mt-6 min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 text-right">Unit price</th>
              </tr>
            </thead>
            <tbody>
              {(pricing.data ?? []).map((r) => (
                <tr
                  key={`${r.source}-${r.lineId}`}
                  className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="py-2 pr-4 tabular-nums">{r.date}</td>
                  <td className="py-2 pr-4 capitalize">{r.source.replace('_', ' ')}</td>
                  <td className="py-2 pr-4">{productName(r.productId)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(r.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
