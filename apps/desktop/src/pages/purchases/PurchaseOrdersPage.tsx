import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface SupplierOpt {
  id: string;
  name: string;
}
interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  costPrice?: string;
}
interface TaxOpt {
  id: string;
  name: string;
}
interface PORow {
  id: string;
  supplierId: string;
  orderDate: string;
  status: string;
  total: string;
  supplier?: { name: string };
}

type Line = { productId: string; quantity: string; unitPrice: string; discountAmount: string; taxProfileId: string };

const emptyLine = (): Line => ({
  productId: '',
  quantity: '1',
  unitPrice: '0',
  discountAmount: '0',
  taxProfileId: '',
});

export function PurchaseOrdersPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'purchases.orders:read');
  const canWrite = hasPermission(permissions, 'purchases.orders:write');
  const canPost = hasPermission(permissions, 'purchases.orders:post');
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['purchase-orders'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: PORow[] }>('/purchase-orders').then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ['purchase-order', editingId],
    enabled: !!editingId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: PORow & {
          warehouseId: string;
          expectedDate: string | null;
          notes?: string | null;
          discountAmount: string;
          lines: Array<{
            productId: string;
            quantity: string;
            unitPrice: string;
            discountAmount: string;
            taxProfileId?: string | null;
          }>;
        };
      }>(`/purchase-orders/${editingId}`).then((r) => r.data),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'po-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: SupplierOpt[] }>('/suppliers?limit=500').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'po-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: ProductOpt[] }>('/products?limit=500').then((r) => r.data),
  });

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/warehouses').then((r) => r.data),
  });

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: TaxOpt[] }>('/tax-profiles').then((r) => r.data),
  });

  const stats = useMemo(() => {
    const rows = list.data ?? [];
    return {
      draft: rows.filter((r) => r.status === 'draft').length,
      sent: rows.filter((r) => r.status === 'sent').length,
      closed: rows.filter((r) => r.status === 'closed').length,
    };
  }, [list.data]);

  useEffect(() => {
    if (!detail.data || !editingId) return;
    const d = detail.data;
    setSupplierId(d.supplierId);
    setWarehouseId(d.warehouseId);
    setOrderDate(d.orderDate);
    setExpectedDate(d.expectedDate ?? '');
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

  useEffect(() => {
    if (!panelOpen || editingId || warehouseId || !warehouses.data?.length) return;
    setWarehouseId(warehouses.data[0].id);
  }, [panelOpen, editingId, warehouseId, warehouses.data]);

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId);
      if (!supplierId) throw new Error('Select a supplier');
      if (!warehouseId) throw new Error('Select a warehouse');
      if (cleaned.length === 0) throw new Error('Add at least one line');
      const payload = {
        supplierId,
        orderDate,
        expectedDate: expectedDate || null,
        warehouseId,
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
        await apiFetch(`/purchase-orders/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setPanelOpen(false);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const sendPo = useMutation({
    mutationFn: (id: string) => apiFetch(`/purchase-orders/${id}/send`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/purchase-orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Purchase orders</h1>
          <p className="mt-1 text-slate-600">Create POs, send to suppliers, then receive via GRN</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
            onClick={() => {
              setEditingId(null);
              setSupplierId('');
              setOrderDate(new Date().toISOString().slice(0, 10));
              setExpectedDate('');
              setNotes('');
              setHeaderDiscount('0');
              setLines([emptyLine()]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New purchase order
          </button>
        )}
      </div>

      <PurchaseSubNav />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Draft</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.draft}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sent</p>
          <p className="mt-1 text-2xl font-semibold text-indigo-700">{stats.sent}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Closed</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{stats.closed}</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                <td className="px-4 py-3 tabular-nums">{r.orderDate}</td>
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
                      className="ml-3 font-medium text-emerald-700 hover:underline"
                      onClick={() => sendPo.mutate(r.id)}
                    >
                      Send
                    </button>
                  )}
                  {(r.status === 'sent' || r.status === 'draft') && (
                    <Link
                      to={`/purchases/grns?fromPo=${r.id}`}
                      className="ml-3 font-medium text-slate-700 hover:underline"
                    >
                      Receive →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
        {!list.isLoading && (list.data?.length ?? 0) === 0 && (
          <p className="p-8 text-center text-slate-500">No purchase orders yet. Create one to start buying stock.</p>
        )}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Edit purchase order' : 'New purchase order'}
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setPanelOpen(false)}
              >
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
                <span className="text-slate-600">Warehouse</span>
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
                <span className="text-slate-600">Order date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Expected date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </label>
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
                            unitPrice: p?.costPrice ?? next[idx].unitPrice,
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
                    <span className="text-xs text-slate-500">Cost</span>
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
