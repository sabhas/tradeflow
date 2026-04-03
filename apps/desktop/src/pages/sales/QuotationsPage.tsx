import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { SalesSubNav } from '../../components/SalesSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface CustomerOpt {
  id: string;
  name: string;
}
interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  sellingPrice: string;
}
interface TaxOpt {
  id: string;
  name: string;
}
interface QuotationRow {
  id: string;
  customerId: string;
  quotationDate: string;
  status: string;
  total: string;
}

type Line = { productId: string; quantity: string; unitPrice: string; discountAmount: string; taxProfileId: string };

const emptyLine = (): Line => ({
  productId: '',
  quantity: '1',
  unitPrice: '0',
  discountAmount: '0',
  taxProfileId: '',
});

export function QuotationsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'sales:read');
  const canWrite = hasPermission(permissions, 'sales:create') || hasPermission(permissions, 'sales:update');
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [quotationDate, setQuotationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['quotations'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: QuotationRow[] }>('/quotations').then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ['quotation', editingId],
    enabled: !!editingId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: QuotationRow & {
          lines: Array<{
            productId: string;
            quantity: string;
            unitPrice: string;
            discountAmount: string;
            taxProfileId?: string | null;
          }>;
          notes?: string;
          validUntil?: string;
          discountAmount: string;
        };
      }>(`/quotations/${editingId}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!detail.data || !editingId) return;
    const d = detail.data;
    setCustomerId(d.customerId);
    setQuotationDate(d.quotationDate);
    setValidUntil(d.validUntil ?? '');
    setNotes(d.notes ?? '');
    setHeaderDiscount(d.discountAmount);
    setLines(
      (d.lines || []).length
        ? d.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId ?? '',
          }))
        : [emptyLine()]
    );
  }, [detail.data, editingId]);

  const customers = useQuery({
    queryKey: ['customers', 'sales-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: CustomerOpt[] }>('/customers?limit=500').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'sales-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: ProductOpt[] }>('/products?limit=500').then((r) => r.data),
  });

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetchData<TaxOpt[]>('/tax-profiles'),
  });

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId);
      if (!customerId) throw new Error('Select a customer');
      if (cleaned.length === 0) throw new Error('Add at least one line with a product');
      const payload = {
        customerId,
        quotationDate,
        validUntil: validUntil || null,
        notes: notes || null,
        discountAmount: headerDiscount,
        lines: cleaned.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount || '0',
          taxProfileId: l.taxProfileId || null,
        })),
      };
      if (editingId) {
        await apiFetch(`/quotations/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/quotations', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      setPanelOpen(false);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/quotations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
  });

  const convert = useMutation({
    mutationFn: (id: string) => apiFetch(`/quotations/${id}/convert-to-order`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Quotations</h1>
          <p className="mt-1 text-slate-600">Draft quotes → convert to sales order</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setEditingId(null);
              setCustomerId('');
              setQuotationDate(new Date().toISOString().slice(0, 10));
              setValidUntil('');
              setNotes('');
              setHeaderDiscount('0');
              setLines([emptyLine()]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New quotation
          </button>
        )}
      </div>
      <SalesSubNav />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{r.quotationDate}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.total}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => {
                        setEditingId(r.id);
                        setError(null);
                        setPanelOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    {r.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          className="ml-3 text-green-700 hover:underline"
                          onClick={() => convert.mutate(r.id)}
                        >
                          To order
                        </button>
                        <button
                          type="button"
                          className="ml-3 text-red-600 hover:underline"
                          onClick={() => del.mutate(r.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qv-title"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="qv-title" className="text-lg font-semibold text-slate-900">
                {editingId ? 'Edit quotation' : 'New quotation'}
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                <span className="text-slate-600">Quote date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Valid until</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Invoice-level discount</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={headerDiscount}
                  onChange={(e) => setHeaderDiscount(e.target.value)}
                />
              </label>
            </div>

            <label className="mt-4 block text-sm">
              <span className="text-slate-600">Notes</span>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Lines</span>
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:underline"
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                >
                  + Add line
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <label className="sm:col-span-4">
                      <span className="text-xs text-slate-500">Product</span>
                      <select
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={line.productId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          const p = products.data?.find((x) => x.id === pid);
                          setLines((prev) => {
                            const next = [...prev];
                            next[idx] = {
                              ...next[idx],
                              productId: pid,
                              unitPrice: p ? p.sellingPrice : next[idx].unitPrice,
                            };
                            return next;
                          });
                        }}
                      >
                        <option value="">—</option>
                        {(products.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs text-slate-500">Qty</span>
                      <input
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) => {
                            const n = [...prev];
                            n[idx] = { ...n[idx], quantity: e.target.value };
                            return n;
                          })
                        }
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs text-slate-500">Price</span>
                      <input
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={line.unitPrice}
                        onChange={(e) =>
                          setLines((prev) => {
                            const n = [...prev];
                            n[idx] = { ...n[idx], unitPrice: e.target.value };
                            return n;
                          })
                        }
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs text-slate-500">Line disc.</span>
                      <input
                        className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={line.discountAmount}
                        onChange={(e) =>
                          setLines((prev) => {
                            const n = [...prev];
                            n[idx] = { ...n[idx], discountAmount: e.target.value };
                            return n;
                          })
                        }
                      />
                    </label>
                    <label className="sm:col-span-1">
                      <span className="text-xs text-slate-500">Tax</span>
                      <select
                        className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1.5 text-xs"
                        value={line.taxProfileId}
                        onChange={(e) =>
                          setLines((prev) => {
                            const n = [...prev];
                            n[idx] = { ...n[idx], taxProfileId: e.target.value };
                            return n;
                          })
                        }
                      >
                        <option value="">Default</option>
                        {(taxProfiles.data ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => setPanelOpen(false)}
              >
                Cancel
              </button>
              {canWrite && (
                <button
                  type="button"
                  disabled={save.isPending || (!!editingId && detail.isLoading)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => save.mutate()}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
