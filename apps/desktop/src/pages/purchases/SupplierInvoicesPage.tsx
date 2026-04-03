import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface InvRow {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  total: string;
  supplier?: { name: string };
}

type Line = {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxProfileId: string;
  grnLineId: string;
};

const emptyLine = (): Line => ({
  productId: '',
  quantity: '1',
  unitPrice: '0',
  discountAmount: '0',
  taxProfileId: '',
  grnLineId: '',
});

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

export function SupplierInvoicesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'purchases.supplier_invoices:read');
  const canWrite = hasPermission(permissions, 'purchases.supplier_invoices:write');
  const canPost = hasPermission(permissions, 'purchases.supplier_invoices:post');
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [grnId, setGrnId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['supplier-invoices'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: InvRow[] }>('/supplier-invoices').then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ['supplier-invoice', editingId],
    enabled: !!editingId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: InvRow & {
          dueDate: string;
          grnId: string | null;
          purchaseOrderId: string | null;
          notes?: string | null;
          discountAmount: string;
          lines: Array<{
            productId: string;
            quantity: string;
            unitPrice: string;
            discountAmount: string;
            taxProfileId?: string | null;
            grnLineId?: string | null;
          }>;
        };
      }>(`/supplier-invoices/${editingId}`).then((r) => r.data),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'si-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/suppliers?limit=500').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'si-dd'],
    enabled: canRead && panelOpen,
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; sku: string; name: string; costPrice?: string }> }>('/products?limit=500').then(
        (r) => r.data
      ),
  });

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/tax-profiles').then((r) => r.data),
  });

  const grnIdTrimmed = grnId.trim();
  const linkedGrn = useQuery({
    queryKey: ['grn', 'invoice-link', grnIdTrimmed],
    enabled: panelOpen && canRead && isUuid(grnIdTrimmed),
    queryFn: () =>
      apiFetch<{
        data: {
          supplierId: string;
          status: string;
          lines?: Array<{ id: string; productId: string; quantity: string; unitPrice: string }>;
        };
      }>(`/grns/${grnIdTrimmed}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!detail.data || !editingId) return;
    const d = detail.data;
    setSupplierId(d.supplierId);
    setInvoiceNumber(d.invoiceNumber);
    setInvoiceDate(d.invoiceDate);
    setDueDate(d.dueDate);
    setGrnId(d.grnId ?? '');
    setPurchaseOrderId(d.purchaseOrderId ?? '');
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
            grnLineId: l.grnLineId ?? '',
          }))
        : [emptyLine()]
    );
  }, [detail.data, editingId]);

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId);
      if (!supplierId) throw new Error('Select a supplier');
      if (!invoiceNumber.trim()) throw new Error('Invoice number required');
      if (cleaned.length === 0) throw new Error('Add at least one line');
      const payload = {
        supplierId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate: dueDate || null,
        grnId: grnId || null,
        purchaseOrderId: purchaseOrderId || null,
        notes: notes || null,
        discountAmount: headerDiscount,
        lines: cleaned.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount || '0',
          taxProfileId: l.taxProfileId || null,
          grnLineId: l.grnLineId || null,
        })),
      };
      if (editingId) {
        await apiFetch(`/supplier-invoices/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/supplier-invoices', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      setPanelOpen(false);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const postInv = useMutation({
    mutationFn: (id: string) => apiFetch(`/supplier-invoices/${id}/post`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-invoices'] }),
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/supplier-invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-invoices'] }),
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Supplier invoices</h1>
          <p className="mt-1 text-slate-600">Match to GRN where needed; post to accounting and update landed cost</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setEditingId(null);
              setSupplierId('');
              setInvoiceNumber('');
              setInvoiceDate(new Date().toISOString().slice(0, 10));
              setDueDate('');
              setGrnId('');
              setPurchaseOrderId('');
              setNotes('');
              setHeaderDiscount('0');
              setLines([emptyLine()]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New supplier invoice
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
              <th className="px-4 py-3 text-left font-medium">Number</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3">{r.invoiceDate}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.invoiceNumber}</td>
                <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
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
                      <button type="button" className="ml-3 text-red-600 hover:underline" onClick={() => del.mutate(r.id)}>
                        Delete
                      </button>
                    </>
                  )}
                  {canPost && r.status === 'draft' && (
                    <button
                      type="button"
                      className="ml-3 font-medium text-emerald-700 hover:underline"
                      onClick={() => postInv.mutate(r.id)}
                    >
                      Post
                    </button>
                  )}
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
              <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit invoice' : 'New supplier invoice'}</h2>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
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
              <label className="block text-sm">
                <span className="text-slate-600">Supplier ref / invoice #</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
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
                <span className="text-slate-600">GRN id (optional link)</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                  value={grnId}
                  placeholder="UUID for cost match"
                  onChange={(e) => setGrnId(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">PO id (optional)</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                  value={purchaseOrderId}
                  onChange={(e) => setPurchaseOrderId(e.target.value)}
                />
              </label>
              {isUuid(grnIdTrimmed) && (
                <div className="sm:col-span-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-sm">
                  {linkedGrn.isLoading && <p className="text-slate-600">Loading GRN…</p>}
                  {linkedGrn.isError && (
                    <p className="text-red-700">Could not load GRN. Check the id and your permissions.</p>
                  )}
                  {linkedGrn.data && (
                    <>
                      <p className="font-medium text-indigo-900">
                        Linked GRN · {linkedGrn.data.status === 'posted' ? 'Posted' : 'Draft'} ·{' '}
                        {(linkedGrn.data.lines ?? []).length} line(s)
                      </p>
                      {supplierId && linkedGrn.data.supplierId !== supplierId && (
                        <p className="mt-2 text-amber-800">
                          Supplier on this invoice does not match the GRN supplier — adjust before saving.
                        </p>
                      )}
                      {canWrite && (linkedGrn.data.lines?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                          onClick={() => {
                            const gl = linkedGrn.data?.lines ?? [];
                            setLines(
                              gl.map((l) => ({
                                productId: l.productId,
                                quantity: l.quantity,
                                unitPrice: l.unitPrice,
                                discountAmount: '0',
                                taxProfileId: '',
                                grnLineId: l.id,
                              }))
                            );
                            if (!supplierId) setSupplierId(linkedGrn.data!.supplierId);
                          }}
                        >
                          Fill lines from GRN (sets GRN line ids for cost match)
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600">Header discount</span>
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
                  <label className="sm:col-span-3">
                    <span className="text-xs text-slate-500">Product</span>
                    <select
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.productId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const p = products.data?.find((x) => x.id === pid);
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], productId: pid, unitPrice: p?.costPrice ?? n[idx].unitPrice };
                          return n;
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
                    <span className="text-xs text-slate-500">Disc.</span>
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
                    <span className="text-xs text-slate-500">GRN line</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1.5 font-mono text-[10px]"
                      value={line.grnLineId}
                      placeholder="opt"
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], grnLineId: e.target.value };
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
                      <option value="">Def</option>
                      {(taxProfiles.data ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end justify-end sm:col-span-1">
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline"
                      onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setPanelOpen(false)}>
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
