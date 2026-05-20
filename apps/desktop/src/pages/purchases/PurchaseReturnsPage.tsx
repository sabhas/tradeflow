import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';

interface SupplierOpt {
  id: string;
  name: string;
}
interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  supplierId?: string;
  costPrice?: string;
}
interface TaxOpt {
  id: string;
  name: string;
}
interface PRRow {
  id: string;
  supplierId: string;
  returnDate: string;
  status: string;
  total: string;
  supplier?: { name: string };
}

type Line = { productId: string; quantity: number; unitPrice: string; discountAmount: string; taxProfileId: string };

const emptyLine = (): Line => ({
  productId: '',
  quantity: 1,
  unitPrice: '0',
  discountAmount: '0',
  taxProfileId: '',
});

export function PurchaseReturnsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'purchases.grn:read');
  const canWrite = hasPermission(permissions, 'purchases.grn:write');
  const canPost = hasPermission(permissions, 'purchases.grn:post');
  const qc = useQueryClient();
  const { formatMoney, formatMoneyInput, normalizeMoneyInput } = useMoneyFormat();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['purchase-returns'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: PRRow[] }>('/purchase-returns?limit=200').then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ['purchase-return', editingId],
    enabled: !!editingId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: PRRow & {
          warehouseId: string;
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
      }>(`/purchase-returns/${editingId}`).then((r) => r.data),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'pr-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: SupplierOpt[] }>('/suppliers?limit=500').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'pr-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: ProductOpt[] }>('/products?limit=500&activeOnly=true').then((r) => r.data),
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

  const supplierOptions = useMemo(
    () => (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data]
  );
  const warehouseOptions = useMemo(
    () => (warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name })),
    [warehouses.data]
  );
  const productLineOptions = useMemo(() => {
    const all = products.data ?? [];
    const filtered =
      supplierId && all.length > 0 ? all.filter((p) => p.supplierId === supplierId) : all;
    return filtered.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }));
  }, [products.data, supplierId]);
  const taxLineOptions = useMemo(
    () => (taxProfiles.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    [taxProfiles.data]
  );

  useEffect(() => {
    if (!detail.data || !editingId) return;
    const d = detail.data;
    setSupplierId(d.supplierId);
    setWarehouseId(d.warehouseId);
    setReturnDate(d.returnDate);
    setNotes(d.notes ?? '');
    setHeaderDiscount(formatMoney(d.discountAmount));
    setLines(
      (d.lines || []).length
        ? d.lines.map((l) => ({
            productId: l.productId,
            quantity: parseFloat(l.quantity),
            unitPrice: formatMoney(l.unitPrice),
            discountAmount: formatMoney(l.discountAmount),
            taxProfileId: l.taxProfileId ?? '',
          }))
        : [emptyLine()]
    );
  }, [detail.data, editingId]);

  useEffect(() => {
    if (!panelOpen || editingId) return;
    setSupplierId('');
    setWarehouseId('');
  }, [panelOpen, editingId]);

  useEffect(() => {
    if (!supplierId) return;
    const supplierProducts = new Set(
      (products.data ?? []).filter((p) => p.supplierId === supplierId).map((p) => p.id)
    );
    setLines((prev) =>
      prev.map((line) =>
        line.productId && !supplierProducts.has(line.productId) ? { ...line, productId: '' } : line
      )
    );
  }, [supplierId, products.data]);

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId);
      if (!supplierId) throw new Error('Select a supplier');
      if (!warehouseId) throw new Error('Select a warehouse');
      if (cleaned.length === 0) throw new Error('Add at least one line');
      const payload = {
        supplierId,
        returnDate,
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
        await apiFetch(`/purchase-returns/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/purchase-returns', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      setPanelOpen(false);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const postPr = useMutation({
    mutationFn: (id: string) => apiFetch(`/purchase-returns/${id}/post`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-returns'] }),
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/purchase-returns/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-returns'] }),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Purchase returns</h1>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setEditingId(null);
              setReturnDate(new Date().toISOString().slice(0, 10));
              setNotes('');
              setHeaderDiscount('0');
              setLines([emptyLine()]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New return
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
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3 tabular-nums">{r.returnDate}</td>
                <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.total)}</td>
                <td className="px-4 py-3 text-right">
                  {canWrite && r.status === 'draft' && (
                    <>
                      <button
                        type="button"
                        className="text-sm font-medium text-indigo-600 hover:underline"
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
                        className="ml-2 text-sm font-medium text-red-600 hover:underline"
                        onClick={() => del.mutate(r.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {canPost && r.status === 'draft' && (
                    <button
                      type="button"
                      className="ml-2 text-sm font-medium text-green-700 hover:underline"
                      onClick={() => postPr.mutate(r.id)}
                    >
                      Post
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!list.isLoading && (list.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No purchase returns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit purchase return' : 'New purchase return'}
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setPanelOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Supplier</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions}
                  placeholder="Search supplier…"
                  disabled={suppliers.isLoading}
                  aria-label="Supplier"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Warehouse</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouseOptions}
                  placeholder="Search warehouse…"
                  disabled={warehouses.isLoading}
                  aria-label="Warehouse"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Return date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Header discount</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={headerDiscount}
                  onChange={(e) => setHeaderDiscount(normalizeMoneyInput(e.target.value))}
                  onBlur={() => setHeaderDiscount(formatMoneyInput(headerDiscount))}
                />
              </label>
            </div>

            <label className="mt-4 block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Notes</span>
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
                <div
                  key={idx}
                  className="grid gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-12 sm:items-end"
                >
                  <label className="sm:col-span-4">
                    <span className="text-xs text-slate-500">Product</span>
                    <Combobox
                      className="mt-0.5 w-full max-w-none"
                      inputClassName="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.productId}
                      onChange={(pid) => {
                        const p = products.data?.find((x) => x.id === pid);
                        setLines((prev) => {
                          const next = [...prev];
                          next[idx] = {
                            ...next[idx],
                            productId: pid,
                            unitPrice: p?.costPrice ? formatMoneyInput(p.costPrice) : next[idx].unitPrice,
                          };
                          return next;
                        });
                      }}
                      options={productLineOptions}
                      placeholder="Product…"
                      disabled={products.isLoading}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Qty</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.quantity}
                      onChange={(e) => {
                        const v = e.target.value === '' ? 0 : Number(e.target.value);
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], quantity: Number.isFinite(v) ? v : 0 };
                          return n;
                        });
                      }}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Unit price</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], unitPrice: normalizeMoneyInput(e.target.value) };
                          return n;
                        })
                      }
                      onBlur={() =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], unitPrice: formatMoneyInput(n[idx].unitPrice) };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Line discount</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.discountAmount}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], discountAmount: normalizeMoneyInput(e.target.value) };
                          return n;
                        })
                      }
                      onBlur={() =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], discountAmount: formatMoneyInput(n[idx].discountAmount) };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Tax</span>
                    <Combobox
                      className="mt-0.5 w-full max-w-none"
                      inputClassName="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.taxProfileId}
                      onChange={(tid) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], taxProfileId: tid };
                          return n;
                        })
                      }
                      options={taxLineOptions}
                      placeholder="Tax…"
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm"
                onClick={() => setPanelOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
