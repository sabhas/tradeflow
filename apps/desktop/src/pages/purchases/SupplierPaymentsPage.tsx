import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { formatAmount, formatAmountInput, normalizeAmountInput, parseAmount } from '../../lib/numberFormat';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface OpenInv {
  id: string;
  invoiceNumber: string;
  openAmount: string;
  dueDate: string;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

export function SupplierPaymentsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'purchases.payments:read');
  const canWrite = hasPermission(permissions, 'purchases.payments:write');
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('0');
  const [useDebitAmount, setUseDebitAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [reference, setReference] = useState('');
  const [allocations, setAllocations] = useState<Array<{ supplierInvoiceId: string; amount: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['supplier-payments'],
    enabled: canRead,
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; paymentDate: string; amount: string; supplier?: { name: string } }> }>(
        '/supplier-payments'
      ).then((r) => r.data),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'pay-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/suppliers?limit=500').then((r) => r.data),
  });

  const openInvoices = useQuery({
    queryKey: ['supplier-invoices-open', supplierId, paymentDate],
    enabled: !!supplierId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: OpenInv[];
        meta?: { availableDebitAmount?: string; asOfDate?: string };
      }>(
        `/supplier-invoices/open?supplierId=${encodeURIComponent(supplierId)}&paymentDate=${encodeURIComponent(paymentDate)}`
      ).then((r) => ({ invoices: r.data, meta: r.meta })),
  });

  const supplierOptions = useMemo(
    () => (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data]
  );
  const allocatedTotal = useMemo(
    () =>
      allocations.reduce((sum, row) => {
        const parsed = parseAmount(row.amount, 'nan');
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0),
    [allocations]
  );
  const payAmt = parseAmount(amount, 'nan');
  const debitAmt = parseAmount(useDebitAmount, 'nan');
  const availableDebit = parseAmount(openInvoices.data?.meta?.availableDebitAmount ?? '0', 'nan');
  const expectedAllocation = (Number.isFinite(payAmt) ? payAmt : 0) + (Number.isFinite(debitAmt) ? debitAmt : 0);
  const allocationDelta = expectedAllocation - allocatedTotal;
  const allocationMatched =
    toCents(Number.isFinite(expectedAllocation) ? expectedAllocation : 0) ===
    toCents(Number.isFinite(allocatedTotal) ? allocatedTotal : 0);

  const pay = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!supplierId) throw new Error('Select a supplier');
      if (allocations.length === 0) throw new Error('Allocate to at least one invoice');
      const allocSum = allocations.reduce((sum, a) => sum + parseAmount(a.amount), 0);
      const payAmt = parseAmount(amount, 'nan');
      const debitAmt = parseAmount(useDebitAmount, 'nan');
      if (!Number.isFinite(allocSum) || !Number.isFinite(payAmt) || !Number.isFinite(debitAmt)) {
        throw new Error('Enter valid numeric amounts');
      }
      if (debitAmt - (Number.isFinite(availableDebit) ? availableDebit : 0) > 0.01) {
        throw new Error(`Debit used cannot exceed available balance (${formatAmount(availableDebit)})`);
      }
      if (toCents(payAmt + debitAmt) !== toCents(allocSum)) {
        throw new Error('Allocations must equal total amount + debit used');
      }
      await apiFetch('/supplier-payments', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          paymentDate,
          amount: String(payAmt),
          useDebitAmount: String(debitAmt),
          paymentMethod,
          reference: reference || null,
          allocations: allocations.map((a) => ({ ...a, amount: String(parseAmount(a.amount)) })),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-payments'] });
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      setPanelOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Supplier payments</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">Pay suppliers and allocate to open invoices (AP + cash journal)</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setSupplierId('');
              setPaymentDate(new Date().toISOString().slice(0, 10));
              setAmount('0');
              setUseDebitAmount('0');
              setReference('');
              setAllocations([]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            Record payment
          </button>
        )}
      </div>
      <PurchaseSubNav />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3">{r.paymentDate}</td>
                <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatAmount(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Record supplier payment</h2>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Supplier</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={supplierId}
                  onChange={(next) => {
                    setSupplierId(next);
                    setAllocations([]);
                    setUseDebitAmount('0');
                    setAmount('0');
                  }}
                  options={supplierOptions}
                  placeholder="Search supplier…"
                  disabled={suppliers.isLoading}
                  aria-label="Supplier"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Payment date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Method</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="bank">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Cash/Bank payment amount</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={formatAmountInput(amount)}
                  onChange={(e) => setAmount(normalizeAmountInput(e.target.value))}
                  onBlur={(e) => setAmount(formatAmount(normalizeAmountInput(e.target.value)))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Use supplier debit balance</span>
                <div className="mt-1 flex gap-2">
                  <input
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    value={formatAmountInput(useDebitAmount)}
                    onChange={(e) => setUseDebitAmount(normalizeAmountInput(e.target.value))}
                    onBlur={(e) => setUseDebitAmount(formatAmount(normalizeAmountInput(e.target.value)))}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Available debit: {formatAmount(availableDebit)}
                </p>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Reference</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/40 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Allocated</p>
                <p className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{formatAmount(allocatedTotal)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Cash + Bank</p>
                <p className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{formatAmount(payAmt || 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Debit Used</p>
                <p className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{formatAmount(debitAmt || 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Difference</p>
                <p className={`tabular-nums font-semibold ${Math.abs(allocationDelta) <= 0.01 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {formatAmount(allocationDelta)}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">Allocate to invoices</p>
            <div className="mt-2 space-y-2">
              {(openInvoices.data?.invoices ?? []).map((inv) => {
                const row = allocations.find((a) => a.supplierInvoiceId === inv.id);
                return (
                  <div key={inv.id} className="grid gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700 sm:grid-cols-[1.3fr_auto_auto_auto] sm:items-center">
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{inv.invoiceNumber}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">due {inv.dueDate}</span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      open {formatAmount(inv.openAmount)}
                    </span>
                    <input
                      className="w-32 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="allocate"
                      value={formatAmountInput(row?.amount ?? '')}
                      onChange={(e) => {
                        const v = normalizeAmountInput(e.target.value);
                        setAllocations((prev) => {
                          const rest = prev.filter((a) => a.supplierInvoiceId !== inv.id);
                          if (!v) return rest;
                          return [...rest, { supplierInvoiceId: inv.id, amount: v }];
                        });
                      }}
                      onBlur={(e) => {
                        const v = normalizeAmountInput(e.target.value);
                        setAllocations((prev) => {
                          const rest = prev.filter((a) => a.supplierInvoiceId !== inv.id);
                          if (!v) return rest;
                          return [...rest, { supplierInvoiceId: inv.id, amount: formatAmount(v) }];
                        });
                      }}
                    />
                  </div>
                );
              })}
              {supplierId && !openInvoices.isLoading && (openInvoices.data?.invoices?.length ?? 0) === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">No open invoices for this supplier.</p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => setPanelOpen(false)}>
                Cancel
              </button>
              {canWrite && (
                <button
                  type="button"
                  disabled={pay.isPending || !allocationMatched || debitAmt - availableDebit > 0.01}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => pay.mutate()}
                >
                  Save payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
