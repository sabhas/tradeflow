import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { downloadXlsx } from '../../lib/downloadXlsx';
import { hasPermission } from '../../lib/permissions';
import { printTableAsPdf } from '../../lib/printTable';
import { useAppSelector } from '../../hooks/useAppSelector';

interface TaxProfileOpt {
  id: string;
  name: string;
}

interface CollectedRow {
  lineId: string;
  invoiceId: string;
  invoiceDate: string;
  customerName: string;
  taxProfileName: string | null;
  taxProfileRate: string | null;
  taxProfileIsInclusive: boolean | null;
  productSku: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  lineNetBeforeTax: string;
  taxAmount: string;
}

interface PaidRow {
  lineId: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  supplierName: string;
  taxProfileName: string | null;
  taxProfileRate: string | null;
  taxProfileIsInclusive: boolean | null;
  productSku: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  lineNetBeforeTax: string;
  taxAmount: string;
}

interface SummaryProfileRow {
  taxProfileName: string;
  taxProfileRate: string | null;
  taxProfileIsInclusive: boolean | null;
  collected: string;
  paid: string;
}

function defaultDateRange() {
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - 1);
  return { dateFrom: dateFrom.toISOString().slice(0, 10), dateTo };
}

export function TaxReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canCollected = hasPermission(permissions, 'sales:read');
  const canPaid = hasPermission(permissions, 'purchases.reports:read');
  const canSummary = canCollected || canPaid;
  const canTaxMasters = hasPermission(permissions, 'masters.tax:read');

  const initialRange = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom);
  const [dateTo, setDateTo] = useState(initialRange.dateTo);
  const [taxProfileId, setTaxProfileId] = useState('');

  const [tab, setTab] = useState<'collected' | 'paid' | 'summary'>(() => {
    if (canCollected) return 'collected';
    if (canPaid) return 'paid';
    return 'summary';
  });

  const rangeQs = useMemo(() => {
    const q = new URLSearchParams({
      dateFrom,
      dateTo,
    });
    if (taxProfileId && (tab === 'collected' || tab === 'paid')) {
      q.set('taxProfileId', taxProfileId);
    }
    return q.toString();
  }, [dateFrom, dateTo, taxProfileId, tab]);

  const summaryQs = useMemo(() => {
    return new URLSearchParams({ dateFrom, dateTo }).toString();
  }, [dateFrom, dateTo]);

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles', 'report-dd'],
    enabled: canTaxMasters,
    queryFn: () => apiFetch<{ data: TaxProfileOpt[] }>('/tax-profiles').then((r) => r.data),
  });

  const collected = useQuery({
    queryKey: ['reports', 'tax-collected', rangeQs],
    enabled: canCollected && tab === 'collected',
    queryFn: () =>
      apiFetch<{ data: CollectedRow[]; meta: { totalTax: string } }>(
        `/reports/tax-collected?${rangeQs}`
      ).then((r) => r),
  });

  const paid = useQuery({
    queryKey: ['reports', 'tax-paid', rangeQs],
    enabled: canPaid && tab === 'paid',
    queryFn: () =>
      apiFetch<{ data: PaidRow[]; meta: { totalTax: string } }>(`/reports/tax-paid?${rangeQs}`).then(
        (r) => r
      ),
  });

  const summary = useQuery({
    queryKey: ['reports', 'tax-summary', summaryQs],
    enabled: canSummary && tab === 'summary',
    queryFn: () =>
      apiFetch<{
        data: {
          byProfile: SummaryProfileRow[];
          breakdown: { collectedInvoiceCount: string; paidInvoiceCount: string };
        };
        meta: {
          totalCollected: string;
          totalPaid: string;
          netTax: string;
          partial: { collected: boolean; paid: boolean };
        };
      }>(`/reports/tax-summary?${summaryQs}`).then((r) => r),
  });

  if (!canSummary) {
    return <p className="text-slate-600">You need sales or purchase report access to view tax reports.</p>;
  }

  const subtitle = `${dateFrom} → ${dateTo}${taxProfileId && tab !== 'summary' ? ` · Tax profile filter` : ''}`;

  const exportCollectedExcel = async () => {
    const d = collected.data?.data;
    if (!d?.length) return;
    const cols = [
      'Invoice date',
      'Customer',
      'Product',
      'Qty',
      'Unit price',
      'Discount',
      'Line net',
      'Tax profile',
      'Rate',
      'Inclusive',
      'Tax',
    ];
    const rows = d.map((r) => [
      r.invoiceDate,
      r.customerName,
      `${r.productSku} ${r.productName}`,
      r.quantity,
      r.unitPrice,
      r.discountAmount,
      r.lineNetBeforeTax,
      r.taxProfileName ?? '',
      r.taxProfileRate ?? '',
      r.taxProfileIsInclusive ? 'Yes' : 'No',
      r.taxAmount,
    ]);
    await downloadXlsx(`tax-collected-${dateFrom}-${dateTo}.xlsx`, 'Tax collected', cols, rows);
  };

  const exportCollectedPdf = () => {
    const d = collected.data?.data;
    if (!d?.length) return;
    const cols = ['Date', 'Customer', 'Product', 'Net', 'Tax'];
    const rows = d.map((r) => [
      r.invoiceDate,
      r.customerName,
      r.productName,
      r.lineNetBeforeTax,
      r.taxAmount,
    ]);
    printTableAsPdf('Tax collected', subtitle, cols, rows);
  };

  const exportPaidExcel = async () => {
    const d = paid.data?.data;
    if (!d?.length) return;
    const cols = [
      'Invoice date',
      'Supplier inv #',
      'Supplier',
      'Product',
      'Qty',
      'Unit price',
      'Discount',
      'Line net',
      'Tax profile',
      'Rate',
      'Inclusive',
      'Tax',
    ];
    const rows = d.map((r) => [
      r.invoiceDate,
      r.supplierInvoiceNumber,
      r.supplierName,
      `${r.productSku} ${r.productName}`,
      r.quantity,
      r.unitPrice,
      r.discountAmount,
      r.lineNetBeforeTax,
      r.taxProfileName ?? '',
      r.taxProfileRate ?? '',
      r.taxProfileIsInclusive ? 'Yes' : 'No',
      r.taxAmount,
    ]);
    await downloadXlsx(`tax-paid-${dateFrom}-${dateTo}.xlsx`, 'Tax paid', cols, rows);
  };

  const exportPaidPdf = () => {
    const d = paid.data?.data;
    if (!d?.length) return;
    const cols = ['Date', 'Supplier', 'Inv #', 'Net', 'Tax'];
    const rows = d.map((r) => [
      r.invoiceDate,
      r.supplierName,
      r.supplierInvoiceNumber,
      r.lineNetBeforeTax,
      r.taxAmount,
    ]);
    printTableAsPdf('Tax paid', subtitle, cols, rows);
  };

  const exportSummaryExcel = async () => {
    const bp = summary.data?.data.byProfile;
    if (!bp?.length) return;
    const cols = ['Tax profile', 'Rate', 'Inclusive', 'Collected', 'Paid', 'Net'];
    const rows = bp.map((r) => {
      const net = (parseFloat(r.collected) - parseFloat(r.paid)).toFixed(4);
      return [
        r.taxProfileName,
        r.taxProfileRate ?? '',
        r.taxProfileIsInclusive ? 'Yes' : 'No',
        r.collected,
        r.paid,
        net,
      ];
    });
    await downloadXlsx(`tax-summary-${dateFrom}-${dateTo}.xlsx`, 'Tax summary', cols, rows);
  };

  const exportSummaryPdf = () => {
    const bp = summary.data?.data.byProfile;
    if (!bp?.length) return;
    const cols = ['Tax profile', 'Collected', 'Paid', 'Net'];
    const rows = bp.map((r) => [
      r.taxProfileName,
      r.collected,
      r.paid,
      (parseFloat(r.collected) - parseFloat(r.paid)).toFixed(4),
    ]);
    printTableAsPdf('Tax summary', subtitle, cols, rows);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800">Tax</h2>
      <p className="mt-1 text-sm text-slate-600">Collected, paid, and period summary from posted documents.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {canCollected && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'collected' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('collected')}
          >
            Tax collected
          </button>
        )}
        {canPaid && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'paid' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('paid')}
          >
            Tax paid
          </button>
        )}
        {canSummary && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'summary' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('summary')}
          >
            Tax summary
          </button>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
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
          {canTaxMasters && tab !== 'summary' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Tax profile</span>
              <select
                className="min-w-[200px] rounded-md border border-slate-300 px-2 py-1.5"
                value={taxProfileId}
                onChange={(e) => setTaxProfileId(e.target.value)}
              >
                <option value="">All</option>
                {(taxProfiles.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {tab === 'collected' && collected.isPending && (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        )}
        {tab === 'collected' && collected.isError && (
          <p className="mt-6 text-sm text-red-600">{(collected.error as Error).message}</p>
        )}
        {tab === 'collected' && collected.data && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-600">
                Total tax:{' '}
                <span className="font-medium tabular-nums">{collected.data?.meta.totalTax ?? '—'}</span>
              </p>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportCollectedExcel().catch(() => {})}
                disabled={!collected.data?.data?.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportCollectedPdf}
                disabled={!collected.data?.data?.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-left">Tax profile</th>
                    <th className="px-3 py-2 text-right">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {(collected.data?.data ?? []).map((r) => (
                    <tr key={r.lineId} className="border-t border-slate-100">
                      <td className="px-3 py-2">{r.invoiceDate}</td>
                      <td className="px-3 py-2">{r.customerName}</td>
                      <td className="px-3 py-2">
                        <span className="text-slate-500">{r.productSku}</span> {r.productName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.lineNetBeforeTax}</td>
                      <td className="px-3 py-2">{r.taxProfileName ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.taxAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(collected.data?.data ?? []).length === 0 && (
                <p className="p-4 text-sm text-slate-500">No lines in this period.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'paid' && paid.isPending && (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        )}
        {tab === 'paid' && paid.isError && (
          <p className="mt-6 text-sm text-red-600">{(paid.error as Error).message}</p>
        )}
        {tab === 'paid' && paid.data && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-600">
                Total tax:{' '}
                <span className="font-medium tabular-nums">{paid.data?.meta.totalTax ?? '—'}</span>
              </p>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportPaidExcel().catch(() => {})}
                disabled={!paid.data?.data?.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportPaidPdf}
                disabled={!paid.data?.data?.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Supplier</th>
                    <th className="px-3 py-2 text-left">Inv #</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-left">Tax profile</th>
                    <th className="px-3 py-2 text-right">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {(paid.data?.data ?? []).map((r) => (
                    <tr key={r.lineId} className="border-t border-slate-100">
                      <td className="px-3 py-2">{r.invoiceDate}</td>
                      <td className="px-3 py-2">{r.supplierName}</td>
                      <td className="px-3 py-2">{r.supplierInvoiceNumber}</td>
                      <td className="px-3 py-2">
                        <span className="text-slate-500">{r.productSku}</span> {r.productName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.lineNetBeforeTax}</td>
                      <td className="px-3 py-2">{r.taxProfileName ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.taxAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(paid.data?.data ?? []).length === 0 && (
                <p className="p-4 text-sm text-slate-500">No lines in this period.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'summary' && summary.isPending && (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        )}
        {tab === 'summary' && summary.isError && (
          <p className="mt-6 text-sm text-red-600">{(summary.error as Error).message}</p>
        )}
        {tab === 'summary' && summary.data && (
          <div className="mt-6">
            {(summary.data.meta.partial.collected || summary.data.meta.partial.paid) && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {summary.data.meta.partial.collected
                  ? 'Collected totals are not shown (sales:read required). '
                  : ''}
                {summary.data.meta.partial.paid
                  ? 'Paid totals are not shown (purchases.reports:read required).'
                  : ''}
              </p>
            )}
            <p className="text-sm text-slate-600">
              Posted invoices:{' '}
              <span className="font-medium tabular-nums">
                {summary.data.data.breakdown.collectedInvoiceCount}
              </span>
              {' · '}
              Posted supplier invoices:{' '}
              <span className="font-medium tabular-nums">
                {summary.data.data.breakdown.paidInvoiceCount}
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Total collected{' '}
              <span className="font-medium tabular-nums">{summary.data.meta.totalCollected}</span>
              {' · '}
              Total paid <span className="font-medium tabular-nums">{summary.data.meta.totalPaid}</span>
              {' · '}
              Net <span className="font-medium tabular-nums">{summary.data.meta.netTax}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportSummaryExcel().catch(() => {})}
                disabled={!summary.data.data.byProfile.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportSummaryPdf}
                disabled={!summary.data.data.byProfile.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Tax profile</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-left">Inclusive</th>
                    <th className="px-3 py-2 text-right">Collected</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.data.byProfile.map((r, i) => {
                    const net = (parseFloat(r.collected) - parseFloat(r.paid)).toFixed(4);
                    return (
                      <tr key={`${r.taxProfileName}-${i}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">{r.taxProfileName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.taxProfileRate ?? '—'}</td>
                        <td className="px-3 py-2">{r.taxProfileIsInclusive ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.collected}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.paid}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{net}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {summary.data.data.byProfile.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No tax in this period.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
