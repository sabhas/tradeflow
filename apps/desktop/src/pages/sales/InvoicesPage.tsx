import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, apiFetchData, openAuthenticatedRoute } from '../../api/client';
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
interface InvRow {
  id: string;
  customerId: string;
  invoiceDate: string;
  status: string;
  paymentType: string;
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

export function InvoicesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'sales:read');
  const canWrite = hasPermission(permissions, 'sales:create') || hasPermission(permissions, 'sales:update');
  const canPost = hasPermission(permissions, 'sales:post');
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [paymentType, setPaymentType] = useState<'credit' | 'cash'>('credit');
  const [warehouseId, setWarehouseId] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['invoices'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: InvRow[] }>('/invoices').then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ['invoice', editingId],
    enabled: !!editingId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: InvRow & {
          dueDate: string;
          warehouseId: string;
          lines: Array<{
            productId: string;
            quantity: string;
            unitPrice: string;
            discountAmount: string;
            taxProfileId?: string | null;
          }>;
          notes?: string;
          discountAmount: string;
          salespersonId?: string | null;
        };
      }>(`/invoices/${editingId}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!detail.data || !editingId) return;
    const d = detail.data;
    setCustomerId(d.customerId);
    setInvoiceDate(d.invoiceDate);
    setDueDate(d.dueDate);
    setPaymentType(d.paymentType as 'credit' | 'cash');
    setWarehouseId(d.warehouseId);
    setSalespersonId(d.salespersonId ?? '');
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

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetchData<Array<{ id: string; name: string }>>('/warehouses'),
  });

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetchData<TaxOpt[]>('/tax-profiles'),
  });

  const salespersons = useQuery({
    queryKey: ['salespersons', 'inv-panel'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/salespersons').then((r) => r.data),
  });

  useEffect(() => {
    if (warehouseId || !warehouses.data?.length) return;
    setWarehouseId(warehouses.data[0].id);
  }, [warehouseId, warehouses.data]);

  const barcodeLookup = useMutation({
    mutationFn: async (code: string) => {
      const data = await apiFetch<{ data: ProductOpt }>(`/products/lookup/barcode/${encodeURIComponent(code)}`).then(
        (r) => r.data
      );
      return data;
    },
    onSuccess: (data) => {
      setLines((prev) => {
        const last = prev[prev.length - 1];
        if (prev.length && !last.productId) {
          const next = [...prev];
          next[next.length - 1] = {
            productId: data.id,
            quantity: '1',
            unitPrice: data.sellingPrice,
            discountAmount: '0',
            taxProfileId: '',
          };
          return next;
        }
        return [
          ...prev,
          {
            productId: data.id,
            quantity: '1',
            unitPrice: data.sellingPrice,
            discountAmount: '0',
            taxProfileId: '',
          },
        ];
      });
      setBarcode('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId);
      if (!customerId) throw new Error('Select a customer');
      if (!warehouseId) throw new Error('Select a warehouse');
      if (cleaned.length === 0) throw new Error('Add at least one line');
      const payload = {
        customerId,
        invoiceDate,
        dueDate: dueDate || null,
        paymentType,
        warehouseId,
        salespersonId: salespersonId || null,
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
        await apiFetch(`/invoices/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/invoices', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setPanelOpen(false);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const postInv = useMutation({
    mutationFn: (id: string) => apiFetch(`/invoices/${id}/post`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Invoices</h1>
          <p className="mt-1 text-slate-600">Draft, post (stock + accounts), print</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setEditingId(null);
              setCustomerId('');
              setInvoiceDate(new Date().toISOString().slice(0, 10));
              setDueDate('');
              setPaymentType('credit');
              setNotes('');
              setHeaderDiscount('0');
              setSalespersonId('');
              setLines([emptyLine()]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New invoice
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
              <th className="px-4 py-3 text-left font-medium">Pay</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{r.invoiceDate}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
                <td className="px-4 py-3">{r.paymentType}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.total}</td>
                <td className="px-4 py-3 text-right">
                  {canWrite && r.status === 'draft' && (
                    <>
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
                      <button
                        type="button"
                        className="ml-3 text-red-600 hover:underline"
                        onClick={() => del.mutate(r.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {canPost && r.status === 'draft' && (
                    <button
                      type="button"
                      className="ml-3 font-medium text-green-700 hover:underline"
                      onClick={() => postInv.mutate(r.id)}
                    >
                      Post
                    </button>
                  )}
                  <button
                    type="button"
                    className="ml-3 text-slate-600 hover:underline"
                    onClick={() => openAuthenticatedRoute(`/invoices/${r.id}/pdf`).catch((e) => setError(e.message))}
                  >
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit invoice' : 'New invoice'}</h2>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
              <label className="text-sm">
                <span className="text-slate-600">Barcode / scan</span>
                <input
                  className="mt-0.5 w-48 rounded-md border border-slate-300 px-2 py-1.5"
                  value={barcode}
                  placeholder="Scan or type + Enter"
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && barcode.trim()) {
                      e.preventDefault();
                      barcodeLookup.mutate(barcode.trim());
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={!barcode.trim() || barcodeLookup.isPending}
                onClick={() => barcodeLookup.mutate(barcode.trim())}
              >
                Add product
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
                <span className="text-slate-600">Warehouse (posting)</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">—</option>
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Salesperson</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={salespersonId}
                  onChange={(e) => setSalespersonId(e.target.value)}
                >
                  <option value="">—</option>
                  {(salespersons.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Invoice date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Due date (optional)</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Payment</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as 'credit' | 'cash')}
                >
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Invoice discount</span>
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

            <div className="mt-4 flex justify-between">
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
                <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 sm:items-end">
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
                          next[idx] = { ...next[idx], productId: pid, unitPrice: p ? p.sellingPrice : next[idx].unitPrice };
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

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                onClick={() => setPanelOpen(false)}
              >
                Cancel
              </button>
              {canWrite && (
                <button
                  type="button"
                  disabled={save.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => save.mutate()}
                >
                  Save draft
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
