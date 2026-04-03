import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { AccountingSubNav } from '../../components/AccountingSubNav';
import { downloadXlsx } from '../../lib/downloadXlsx';
import { printTableAsPdf } from '../../lib/printTable';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

type TbRow = { accountId: string; code: string; name: string; type: string; debit: string; credit: string };
type ExpenseRow = {
  accountId: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
  netExpense: string;
};

export function FinancialReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'accounting:read');
  const [tab, setTab] = useState<'tb' | 'pl' | 'bs' | 'exp'>('tb');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  const tbParams = useMemo(
    () =>
      `dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
    [dateFrom, dateTo]
  );
  const plParams = tbParams;

  const tb = useQuery({
    queryKey: ['reports', 'trial-balance', tbParams],
    enabled: canRead && tab === 'tb',
    queryFn: () =>
      apiFetch<{ data: TbRow[]; meta: Record<string, string> }>(`/reports/trial-balance?${tbParams}`).then(
        (r) => r
      ),
  });

  const pl = useQuery({
    queryKey: ['reports', 'profit-loss', plParams],
    enabled: canRead && tab === 'pl',
    queryFn: () =>
      apiFetch<{ data: TbRow[]; meta: Record<string, string> }>(`/reports/profit-loss?${plParams}`).then(
        (r) => r
      ),
  });

  const bs = useQuery({
    queryKey: ['reports', 'balance-sheet', asOf],
    enabled: canRead && tab === 'bs',
    queryFn: () =>
      apiFetch<{ data: TbRow[]; meta: Record<string, string> }>(
        `/reports/balance-sheet?asOfDate=${encodeURIComponent(asOf)}`
      ).then((r) => r),
  });

  const exp = useQuery({
    queryKey: ['reports', 'expense-analysis', tbParams],
    enabled: canRead && tab === 'exp',
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<{ data: ExpenseRow[]; meta: Record<string, string> }>(
        `/reports/expense-analysis?${tbParams}`
      ).then((r) => r),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  const periodSubtitle = `${dateFrom} → ${dateTo}`;
  const asOfSubtitle = `As of ${asOf}`;

  const exportTbExcel = async () => {
    if (!tb.data?.data) return;
    await downloadXlsx(
      `trial-balance-${dateFrom}-${dateTo}.xlsx`,
      'Trial balance',
      ['Code', 'Name', 'Type', 'Debit', 'Credit'],
      tb.data.data.map((r) => [r.code, r.name, r.type, r.debit, r.credit])
    );
  };

  const exportTbPdf = () => {
    if (!tb.data?.data) return;
    printTableAsPdf(
      'Trial balance',
      periodSubtitle,
      ['Code', 'Name', 'Type', 'Debit', 'Credit'],
      tb.data.data.map((r) => [r.code, r.name, r.type, r.debit, r.credit])
    );
  };

  const exportPlExcel = async () => {
    if (!pl.data?.data) return;
    await downloadXlsx(
      `profit-loss-${dateFrom}-${dateTo}.xlsx`,
      'Profit and loss',
      ['Code', 'Name', 'Type', 'Debit', 'Credit'],
      pl.data.data.map((r) => [r.code, r.name, r.type, r.debit, r.credit])
    );
  };

  const exportPlPdf = () => {
    if (!pl.data?.data) return;
    printTableAsPdf(
      'Profit and loss',
      periodSubtitle,
      ['Code', 'Name', 'Type', 'Debit', 'Credit'],
      pl.data.data.map((r) => [r.code, r.name, r.type, r.debit, r.credit])
    );
  };

  const exportBsExcel = async () => {
    if (!bs.data?.data) return;
    await downloadXlsx(
      `balance-sheet-${asOf}.xlsx`,
      'Balance sheet',
      ['Code', 'Name', 'Type', 'Debit', 'Credit'],
      bs.data.data.map((r) => [r.code, r.name, r.type, r.debit, r.credit])
    );
  };

  const exportBsPdf = () => {
    if (!bs.data?.data) return;
    printTableAsPdf(
      'Balance sheet',
      asOfSubtitle,
      ['Code', 'Name', 'Type', 'Debit', 'Credit'],
      bs.data.data.map((r) => [r.code, r.name, r.type, r.debit, r.credit])
    );
  };

  const exportExpExcel = async () => {
    if (!exp.data?.data) return;
    await downloadXlsx(
      `expense-analysis-${dateFrom}-${dateTo}.xlsx`,
      'Expense analysis',
      ['Code', 'Name', 'Debit', 'Credit', 'Net expense'],
      exp.data.data.map((r) => [r.code, r.name, r.debit, r.credit, r.netExpense])
    );
  };

  const exportExpPdf = () => {
    if (!exp.data?.data) return;
    printTableAsPdf(
      'Expense analysis',
      periodSubtitle,
      ['Code', 'Name', 'Debit', 'Credit', 'Net'],
      exp.data.data.map((r) => [r.code, r.name, r.debit, r.credit, r.netExpense])
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Financial reports</h1>
      <p className="mt-1 text-slate-600">
        Trial balance, profit &amp; loss, balance sheet, and expense analysis from posted journals
      </p>
      <AccountingSubNav />

      <div className="mt-4 flex flex-wrap gap-2">
        {(['tb', 'pl', 'bs', 'exp'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab(k)}
          >
            {k === 'tb'
              ? 'Trial balance'
              : k === 'pl'
                ? 'P&L'
                : k === 'bs'
                  ? 'Balance sheet'
                  : 'Expense analysis'}
          </button>
        ))}
      </div>

      {(tab === 'tb' || tab === 'pl' || tab === 'exp') && (
        <div className="mt-4 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">From</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1.5"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">To</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1.5"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          {tab === 'tb' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => exportTbExcel().catch(() => {})}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={exportTbPdf}
              >
                PDF
              </button>
            </div>
          )}
          {tab === 'pl' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => exportPlExcel().catch(() => {})}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={exportPlPdf}
              >
                PDF
              </button>
            </div>
          )}
          {tab === 'exp' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => exportExpExcel().catch(() => {})}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={exportExpPdf}
              >
                PDF
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'bs' && (
        <div className="mt-4 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">As of</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1.5"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => exportBsExcel().catch(() => {})}
            >
              Excel
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={exportBsPdf}
            >
              PDF
            </button>
          </div>
        </div>
      )}

      {tab === 'tb' && tb.data && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Totals — Debit: {tb.data.meta.totalDebit} · Credit: {tb.data.meta.totalCredit}
          </p>
          <ReportTable rows={tb.data.data} />
        </div>
      )}

      {tab === 'pl' && pl.data && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Income (net): {pl.data.meta.incomeNet} · Expenses (net): {pl.data.meta.expenseNet} · Net:{' '}
            {pl.data.meta.netProfit}
          </p>
          <ReportTable rows={pl.data.data} />
        </div>
      )}

      {tab === 'bs' && bs.data && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Assets: {bs.data.meta.totalAssets} · Liabilities: {bs.data.meta.totalLiabilities} · Equity:{' '}
            {bs.data.meta.totalEquity} · L+E: {bs.data.meta.liabilitiesPlusEquity}
          </p>
          <ReportTable rows={bs.data.data} />
        </div>
      )}

      {tab === 'exp' && exp.data && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Total net expense:{' '}
            <span className="font-medium tabular-nums">{exp.data.meta.totalNetExpense}</span>
          </p>
          <ExpenseTable rows={exp.data.data} />
        </div>
      )}
    </div>
  );
}

function ExpenseTable({ rows }: { rows: ExpenseRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-2 font-medium text-slate-700">Code</th>
            <th className="px-4 py-2 font-medium text-slate-700">Name</th>
            <th className="px-4 py-2 font-medium text-slate-700">Debit</th>
            <th className="px-4 py-2 font-medium text-slate-700">Credit</th>
            <th className="px-4 py-2 font-medium text-slate-700">Net expense</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No expense activity for this period.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.accountId} className="border-b border-slate-100">
                <td className="px-4 py-2 font-mono">{r.code}</td>
                <td className="px-4 py-2 text-slate-800">{r.name}</td>
                <td className="px-4 py-2 font-mono">{r.debit}</td>
                <td className="px-4 py-2 font-mono">{r.credit}</td>
                <td className="px-4 py-2 font-mono">{r.netExpense}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReportTable({ rows }: { rows: TbRow[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-2 font-medium text-slate-700">Code</th>
            <th className="px-4 py-2 font-medium text-slate-700">Name</th>
            <th className="px-4 py-2 font-medium text-slate-700">Type</th>
            <th className="px-4 py-2 font-medium text-slate-700">Debit</th>
            <th className="px-4 py-2 font-medium text-slate-700">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No rows for this period.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.accountId} className="border-b border-slate-100">
                <td className="px-4 py-2 font-mono">{r.code}</td>
                <td className="px-4 py-2 text-slate-800">{r.name}</td>
                <td className="px-4 py-2 text-slate-600">{r.type}</td>
                <td className="px-4 py-2 font-mono">{r.debit}</td>
                <td className="px-4 py-2 font-mono">{r.credit}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
