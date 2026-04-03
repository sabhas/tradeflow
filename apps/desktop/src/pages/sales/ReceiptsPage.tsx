import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { SalesSubNav } from '../../components/SalesSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

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
}

export function ReceiptsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'sales:read');
  const canPost = hasPermission(permissions, 'sales:post');
  const qc = useQueryClient();

  const [customerId, setCustomerId] = useState('');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
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
    let left = parseFloat(amount || '0');
    const nextAmt: Record<string, string> = {};
    const ids: string[] = [];
    for (const i of [...invs].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))) {
      if (left <= 0) break;
      const due = parseFloat(i.total);
      const apply = Math.min(due, left);
      if (apply > 0) {
        ids.push(i.id);
        nextAmt[i.id] = apply.toFixed(4);
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
      const totalAmt = parseFloat(amount || '0');
      if (totalAmt <= 0) throw new Error('Amount required');
      const allocations = allocInvoiceId.map((invoiceId) => ({
        invoiceId,
        amount: allocAmount[invoiceId] || '0',
      }));
      let sum = 0;
      for (const a of allocations) sum += parseFloat(a.amount);
      if (allocations.length === 0) throw new Error('Select invoices to allocate');
      if (Math.abs(sum - totalAmt) > 0.0001) throw new Error('Allocation sum must equal receipt amount');

      await apiFetch('/receipts', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          receiptDate,
          amount,
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
      <h1 className="text-2xl font-semibold text-slate-800">Receipts</h1>
      <p className="mt-1 text-slate-600">Record customer payments and allocate to credit invoices</p>
      <SalesSubNav />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      {canPost && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800">New receipt</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600">Customer</span>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">—</option>
                {(customers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Date</span>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Amount</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Method</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Reference</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Check #, transaction id…"
              />
            </label>
          </div>

          {customerId && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-slate-700">Allocate to invoices</h3>
                <button
                  type="button"
                  className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200"
                  onClick={suggestOldest}
                >
                  Auto-fill oldest first
                </button>
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left"> </th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Pay now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openInvoices.data ?? []).map((i) => (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allocInvoiceId.includes(i.id)}
                            onChange={() => toggleAlloc(i.id, i.total)}
                          />
                        </td>
                        <td className="px-3 py-2">{i.invoiceDate}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.total}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                            disabled={!allocInvoiceId.includes(i.id)}
                            value={allocAmount[i.id] ?? ''}
                            onChange={(e) =>
                              setAllocAmount((prev) => ({ ...prev, [i.id]: e.target.value }))
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

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={submit.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => submit.mutate()}
            >
              Post receipt
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
          Recent receipts
        </h2>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Method</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{r.receiptDate}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.amount}</td>
                <td className="px-4 py-3">{r.paymentMethod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
