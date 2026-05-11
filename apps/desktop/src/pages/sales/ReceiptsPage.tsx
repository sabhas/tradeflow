import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { SalesSubNav } from '../../components/SalesSubNav';
import { parseAmount } from '../../lib/numberFormat';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';

interface CustomerOpt {
  id: string;
  name: string;
}
interface InvOpen {
  id: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  paymentType: string;
  status: string;
}

interface ReceiptRow {
  id: string;
  customerId: string;
  receiptDate: string;
  amount: string;
  paymentMethod: string;
  reference: string | null;
}

export function ReceiptsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'sales:read');
  const canPost = hasPermission(permissions, 'sales:post');
  const qc = useQueryClient();
  const { formatMoney, formatMoneyInput, moneyToFixed } = useMoneyFormat();

  const [customerId, setCustomerId] = useState('');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [allocInvoiceId, setAllocInvoiceId] = useState<string[]>([]);
  const [allocAmount, setAllocAmount] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ['customers', 'sales-dd'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: CustomerOpt[] }>('/customers?limit=500').then((r) => r.data),
  });

  const openInvoices = useQuery({
    queryKey: ['invoices', 'open', customerId],
    enabled: !!customerId && canRead,
    queryFn: async () => {
      const r = await apiFetch<{ data: InvOpen[] }>(
        `/invoices?customerId=${encodeURIComponent(customerId)}&status=posted&limit=200`
      );
      return r.data.filter((i) => i.paymentType === 'credit');
    },
  });

  const list = useQuery({
    queryKey: ['receipts'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: ReceiptRow[] }>('/receipts').then((r) => r.data),
  });

  const customerOptions = useMemo(
    () => [
      ...(customers.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [customers.data]
  );

  const receiptAmountValue = parseAmount(amount);
  const allocationTotal = useMemo(
    () => allocInvoiceId.reduce((sum, invoiceId) => sum + parseAmount(allocAmount[invoiceId] || '0'), 0),
    [allocAmount, allocInvoiceId]
  );
  const allocationDifference = receiptAmountValue - allocationTotal;
  const isAllocationBalanced = Math.abs(allocationDifference) <= 0.009;
  const canSubmitReceipt =
    !!customerId &&
    !!paymentMethod &&
    receiptAmountValue > 0 &&
    allocInvoiceId.length > 0 &&
    isAllocationBalanced;

  useEffect(() => {
    setAllocInvoiceId([]);
    setAllocAmount({});
  }, [customerId]);

  const toggleAlloc = (invoiceId: string, total: string) => {
    setAllocInvoiceId((prev) =>
      prev.includes(invoiceId) ? prev.filter((x) => x !== invoiceId) : [...prev, invoiceId]
    );
    setAllocAmount((prev) => {
      const next = { ...prev };
      if (next[invoiceId]) delete next[invoiceId];
      else next[invoiceId] = total;
      return next;
    });
  };

  const suggestOldest = () => {
    const invs = openInvoices.data ?? [];
    let left = parseAmount(amount);
    const nextAmt: Record<string, string> = {};
    const ids: string[] = [];
    for (const i of [...invs].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))) {
      if (left <= 0) break;
      const due = parseAmount(i.total);
      const apply = Math.min(due, left);
      if (apply > 0) {
        ids.push(i.id);
        nextAmt[i.id] = moneyToFixed(apply);
        left -= apply;
      }
    }
    setAllocInvoiceId(ids);
    setAllocAmount(nextAmt);
  };

  const submit = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!customerId) throw new Error('Customer required');
      const totalAmt = parseAmount(amount);
      if (totalAmt <= 0) throw new Error('Amount required');
      if (!paymentMethod) throw new Error('Payment method required');
      const normalizedReceiptAmount = moneyToFixed(totalAmt);
      const allocations = allocInvoiceId.map((invoiceId) => ({
        invoiceId,
        amount: moneyToFixed(parseAmount(allocAmount[invoiceId] || '0')),
      }));
      let sum = 0;
      for (const a of allocations) sum += parseAmount(a.amount);
      if (allocations.length === 0) throw new Error('Select invoices to allocate');
      if (Math.abs(sum - totalAmt) > 0.009) throw new Error('Allocation sum must equal receipt amount');

      await apiFetch('/receipts', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          receiptDate,
          amount: normalizedReceiptAmount,
          paymentMethod,
          reference: reference || null,
          allocations,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setAmount('');
      setReference('');
      setAllocInvoiceId([]);
      setAllocAmount({});
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Receipts</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">Record customer payments and allocate to credit invoices</p>
      <SalesSubNav />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      {canPost && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <h2 className="text-base font-semibold text-slate-800">New receipt</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Customer</span>
              <Combobox
                className="mt-1 w-full max-w-none"
                inputClassName="rounded-md border border-slate-300 px-3 py-2"
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                placeholder="Search customer…"
                disabled={customers.isLoading}
                aria-label="Customer"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Date</span>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Amount</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Method</span>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="">— Select —</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">Reference</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Check #, transaction id…"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950/40">
            <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
              Receipt: {receiptAmountValue > 0 ? formatMoney(moneyToFixed(receiptAmountValue)) : formatMoney('0')}
            </span>
            <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
              Allocated: {formatMoney(moneyToFixed(allocationTotal))}
            </span>
            <span
              className={`rounded-full px-2 py-1 font-medium ring-1 ${
                isAllocationBalanced
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-800'
                  : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-800'
              }`}
            >
              {isAllocationBalanced
                ? 'Balanced'
                : allocationDifference > 0
                  ? `Unallocated: ${formatMoney(moneyToFixed(allocationDifference))}`
                  : `Over by: ${formatMoney(moneyToFixed(Math.abs(allocationDifference)))}`}
            </span>
          </div>

          {customerId && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-slate-700">Allocate to invoices</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    onClick={suggestOldest}
                  >
                    Auto-fill oldest first
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      setAllocInvoiceId([]);
                      setAllocAmount({});
                    }}
                  >
                    Clear allocations
                  </button>
                </div>
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950">
                    <tr>
                      <th className="px-3 py-2 text-left"> </th>
                      <th className="px-3 py-2 text-left">Invoice</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Pay now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openInvoices.data ?? []).map((i) => (
                      <tr key={i.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allocInvoiceId.includes(i.id)}
                            onChange={() => toggleAlloc(i.id, i.total)}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {i.id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2">{i.invoiceDate}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(i.total)}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                            disabled={!allocInvoiceId.includes(i.id)}
                            value={allocAmount[i.id] ?? ''}
                            onChange={(e) =>
                              setAllocAmount((prev) => ({
                                ...prev,
                                [i.id]: formatMoneyInput(e.target.value),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(openInvoices.data ?? []).length === 0 && (
                  <p className="p-4 text-sm text-slate-500">No posted credit invoices for this customer.</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Receipt can be posted only when allocated amount exactly matches receipt amount.
            </p>
            <button
              type="button"
              disabled={!canSubmitReceipt || submit.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => submit.mutate()}
            >
              Post receipt
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
          Recent receipts
        </h2>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Method</th>
              <th className="px-4 py-3 text-left font-medium">Reference</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3">{r.receiptDate}</td>
                <td className="px-4 py-3">
                  {customers.data?.find((c) => c.id === r.customerId)?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.amount)}</td>
                <td className="px-4 py-3 capitalize">{r.paymentMethod}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.reference?.trim() || '—'}</td>
              </tr>
            ))}
            {!list.isLoading && (list.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  No receipts posted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
      </div>
    </div>
  );
}
