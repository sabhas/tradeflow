import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../api/client';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface OpenInv {
  id: string;
  invoiceNumber: string;
  openAmount: string;
  dueDate: string;
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
    queryKey: ['supplier-invoices-open', supplierId],
    enabled: !!supplierId && panelOpen,
    queryFn: () =>
      apiFetch<{ data: OpenInv[] }>(`/supplier-invoices/open?supplierId=${encodeURIComponent(supplierId)}`).then((r) => r.data),
  });

  const pay = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!supplierId) throw new Error('Select a supplier');
      if (allocations.length === 0) throw new Error('Allocate to at least one invoice');
      await apiFetch('/supplier-payments', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          paymentDate,
          amount,
          paymentMethod,
          reference: reference || null,
          allocations,
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
          <h1 className="text-2xl font-semibold text-slate-800">Supplier payments</h1>
          <p className="mt-1 text-slate-600">Pay suppliers and allocate to open invoices (AP + cash journal)</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setSupplierId('');
              setPaymentDate(new Date().toISOString().slice(0, 10));
              setAmount('0');
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

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3">{r.paymentDate}</td>
                <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Record supplier payment</h2>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>

            <div className="mt-4 space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Allocations must exactly equal the payment amount. Open balances load when you pick a supplier.
            </div>

            <label className="mt-4 block text-sm">
              <span className="text-slate-600">Supplier</span>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">—</option>
                {(suppliers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600">Payment date</span>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600">Total amount</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600">Method</span>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="bank">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-slate-600">Reference</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>

            <p className="mt-4 text-sm font-medium text-slate-700">Allocate to invoices</p>
            <div className="mt-2 space-y-2">
              {(openInvoices.data ?? []).map((inv) => {
                const row = allocations.find((a) => a.supplierInvoiceId === inv.id);
                return (
                  <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                    <span className="font-mono text-xs text-slate-600">{inv.invoiceNumber}</span>
                    <span className="text-xs text-slate-500">due {inv.dueDate}</span>
                    <span className="text-xs font-medium text-slate-700">open {inv.openAmount}</span>
                    <input
                      className="ml-auto w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                      placeholder="allocate"
                      value={row?.amount ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAllocations((prev) => {
                          const rest = prev.filter((a) => a.supplierInvoiceId !== inv.id);
                          if (!v) return rest;
                          return [...rest, { supplierInvoiceId: inv.id, amount: v }];
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200"
                      onClick={() => {
                        setAllocations((prev) => {
                          const rest = prev.filter((a) => a.supplierInvoiceId !== inv.id);
                          return [...rest, { supplierInvoiceId: inv.id, amount: inv.openAmount }];
                        });
                        setAmount(inv.openAmount);
                      }}
                    >
                      Use full open
                    </button>
                  </div>
                );
              })}
              {supplierId && !openInvoices.isLoading && (openInvoices.data?.length ?? 0) === 0 && (
                <p className="text-sm text-slate-500">No open invoices for this supplier.</p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setPanelOpen(false)}>
                Cancel
              </button>
              {canWrite && (
                <button
                  type="button"
                  disabled={pay.isPending}
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
