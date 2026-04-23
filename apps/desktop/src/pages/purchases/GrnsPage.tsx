import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { formatAmount, formatAmountInput, normalizeAmountInput } from '../../lib/numberFormat';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface GrnRow {
  id: string;
  grnDate: string;
  status: string;
  supplierId: string;
  supplier?: { name: string };
  purchaseOrderId?: string | null;
}

interface EligibleResponse {
  purchaseOrderId: string;
  supplierId: string;
  warehouseId: string;
  lines: Array<{
    purchaseOrderLineId: string;
    productId: string;
    productName?: string;
    batchTracked: boolean;
    expiryTracked: boolean;
    remaining: string;
    unitPrice: string;
  }>;
}

type Line = {
  productId: string;
  quantity: string;
  unitPrice: string;
  tradePrice: string;
  retailPrice: string;
  purchaseOrderLineId: string;
  batchCode: string;
  expiryDate: string;
};

export function GrnsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'purchases.grn:read');
  const canWrite = hasPermission(permissions, 'purchases.grn:write');
  const canPost = hasPermission(permissions, 'purchases.grn:post');
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromPo = searchParams.get('fromPo') || '';

  const [panelOpen, setPanelOpen] = useState(!!fromPo);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(fromPo || null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [grnDate, setGrnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([
    {
      productId: '',
      quantity: '1',
      unitPrice: '0',
      tradePrice: '',
      retailPrice: '',
      purchaseOrderLineId: '',
      batchCode: '',
      expiryDate: '',
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [copiedGrnId, setCopiedGrnId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['grns'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: GrnRow[] }>('/grns').then((r) => r.data),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'grn-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/suppliers?limit=500').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'grn-dd'],
    enabled: canRead && panelOpen && !purchaseOrderId,
    queryFn: () =>
      apiFetch<{
        data: Array<{
          id: string;
          sku: string;
          name: string;
          supplierId?: string;
          batchTracked: boolean;
          expiryTracked: boolean;
          costPrice: string;
          sellingPrice: string;
          retailPrice: string;
        }>;
      }>('/products?limit=500&activeOnly=true').then((r) => r.data),
  });

  const productById = useMemo(() => {
    const m = new Map<
      string,
      {
        batchTracked: boolean;
        expiryTracked: boolean;
        name: string;
        costPrice: string;
        sellingPrice: string;
        retailPrice: string;
      }
    >();
    for (const p of products.data ?? []) {
      m.set(p.id, {
        batchTracked: p.batchTracked,
        expiryTracked: p.expiryTracked,
        name: p.name,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        retailPrice: p.retailPrice,
      });
    }
    return m;
  }, [products.data]);

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead && panelOpen,
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; name: string; code: string; isDefault: boolean }> }>('/warehouses').then(
        (r) => r.data
      ),
  });

  const eligible = useQuery({
    queryKey: ['po-grn-eligible', purchaseOrderId],
    enabled: !!purchaseOrderId && panelOpen,
    queryFn: () => apiFetch<{ data: EligibleResponse }>(`/purchase-orders/${purchaseOrderId}/grn-eligible`).then((r) => r.data),
  });

  const poLinked = !!purchaseOrderId && !!eligible.data;
  const supplierOptions = useMemo(
    () => (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data]
  );
  const warehouseOptions = useMemo(
    () => (warehouses.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    [warehouses.data]
  );
  const productLineOptions = useMemo(() => {
    const all = products.data ?? [];
    const filtered =
      supplierId && all.length > 0 ? all.filter((p) => p.supplierId === supplierId) : all;
    return filtered.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }));
  }, [products.data, supplierId]);

  useEffect(() => {
    if (!eligible.data) return;
    setSupplierId(eligible.data.supplierId);
    setWarehouseId(eligible.data.warehouseId);
    if (eligible.data.lines.length) {
      setLines(
        eligible.data.lines.map((l) => ({
          productId: l.productId,
          quantity: l.remaining,
          unitPrice: formatAmount(l.unitPrice),
          tradePrice: '',
          retailPrice: '',
          purchaseOrderLineId: l.purchaseOrderLineId,
          batchCode: '',
          expiryDate: '',
        }))
      );
    }
  }, [eligible.data]);

  useEffect(() => {
    if (purchaseOrderId) return;
    if (warehouseId || !warehouses.data?.length) return;
    const defaultWarehouse = warehouses.data.find((w) => w.isDefault);
    setWarehouseId(defaultWarehouse?.id ?? warehouses.data[0].id);
  }, [purchaseOrderId, warehouseId, warehouses.data]);

  useEffect(() => {
    if (!supplierId || purchaseOrderId) return;
    const supplierProducts = new Set(
      (products.data ?? []).filter((p) => p.supplierId === supplierId).map((p) => p.id)
    );
    setLines((prev) =>
      prev.map((line) =>
        line.productId && !supplierProducts.has(line.productId) ? { ...line, productId: '' } : line
      )
    );
  }, [supplierId, purchaseOrderId, products.data]);

  const createGrn = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId && parseFloat(l.quantity) > 0);
      if (!supplierId) throw new Error('Select a supplier');
      if (!warehouseId) throw new Error('Select a warehouse');
      if (cleaned.length === 0) throw new Error('Add at least one line with quantity');
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const l = lines[lineIdx];
        if (!l.productId || parseFloat(l.quantity) <= 0) continue;
        const fromPo = poLinked && eligible.data?.lines[lineIdx];
        const meta = fromPo
          ? {
              batchTracked: fromPo.batchTracked,
              expiryTracked: fromPo.expiryTracked,
              name: fromPo.productName ?? 'Product',
            }
          : productById.get(l.productId);
        if (!meta) continue;
        if (meta.batchTracked && !l.batchCode.trim()) {
          throw new Error(`Batch is required for "${meta.name}" (batch-tracked product)`);
        }
        if (meta.expiryTracked && !l.expiryDate.trim()) {
          throw new Error(`Expiry date is required for "${meta.name}" (expiry-tracked product)`);
        }
      }
      await apiFetch('/grns', {
        method: 'POST',
        body: JSON.stringify({
          purchaseOrderId: purchaseOrderId || null,
          supplierId,
          warehouseId,
          grnDate,
          lines: cleaned.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice || undefined,
            tradePrice: l.tradePrice.trim() ? l.tradePrice.trim() : undefined,
            retailPrice: l.retailPrice.trim() ? l.retailPrice.trim() : undefined,
            purchaseOrderLineId: l.purchaseOrderLineId || null,
            batchCode: l.batchCode.trim() ? l.batchCode.trim() : null,
            expiryDate: l.expiryDate.trim() ? l.expiryDate : null,
          })),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grns'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setPanelOpen(false);
      setPurchaseOrderId(null);
      setSearchParams({});
    },
    onError: (e: Error) => setError(e.message),
  });

  const postGrn = useMutation({
    mutationFn: (id: string) => apiFetch(`/grns/${id}/post`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grns'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Goods receipt (GRN)</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Record stock in from suppliers; posting updates inventory and PO receipts. Copy <span className="font-medium">GRN id</span> to link on the
            supplier invoice screen.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setPurchaseOrderId(null);
              setSupplierId('');
              setGrnDate(new Date().toISOString().slice(0, 10));
              setLines([
                {
                  productId: '',
                  quantity: '1',
                  unitPrice: '0',
                  tradePrice: '',
                  retailPrice: '',
                  purchaseOrderLineId: '',
                  batchCode: '',
                  expiryDate: '',
                },
              ]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New GRN
          </button>
        )}
      </div>
      <PurchaseSubNav />

      {fromPo && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Prefilled from purchase order — adjust received quantities, then save draft and post.
        </div>
      )}

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
              <th className="px-4 py-3 text-right font-medium">GRN id</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3">{r.grnDate}</td>
                <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    title={r.id}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(r.id);
                        setCopiedGrnId(r.id);
                        window.setTimeout(() => setCopiedGrnId((cur) => (cur === r.id ? null : cur)), 2000);
                      } catch {
                        setError('Could not copy GRN id to clipboard');
                      }
                    }}
                  >
                    {copiedGrnId === r.id ? 'Copied' : 'Copy id'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  {canPost && r.status === 'draft' && (
                    <button
                      type="button"
                      className="font-medium text-emerald-700 hover:underline"
                      onClick={() => postGrn.mutate(r.id)}
                    >
                      Post to stock
                    </button>
                  )}
                  {r.status === 'posted' && (
                    <span className="text-xs font-medium text-emerald-600">Stock updated</span>
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
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New goods receipt</h2>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Tip:</span>
              <span>Link from a purchase order to pre-fill lines, or create a standalone receipt for a supplier.</span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Purchase order (optional)</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                  placeholder="Paste PO id or use Receive link from orders list"
                  value={purchaseOrderId ?? ''}
                  onChange={(e) => setPurchaseOrderId(e.target.value || null)}
                  disabled={!!fromPo}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Supplier</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions}
                  placeholder="Search supplier…"
                  disabled={poLinked || suppliers.isLoading}
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
                  disabled={poLinked || warehouses.isLoading}
                  aria-label="Warehouse"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Receipt date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={grnDate}
                  onChange={(e) => setGrnDate(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lines</span>
              {!purchaseOrderId && (
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:underline"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      {
                        productId: '',
                        quantity: '1',
                        unitPrice: '0',
                        tradePrice: '',
                        retailPrice: '',
                        purchaseOrderLineId: '',
                        batchCode: '',
                        expiryDate: '',
                      },
                    ])
                  }
                >
                  + Add line
                </button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {lines.map((line, idx) => {
                const poLine = purchaseOrderId ? eligible.data?.lines[idx] : undefined;
                const manualProduct = line.productId ? productById.get(line.productId) : undefined;
                const batchRequired = poLine?.batchTracked ?? manualProduct?.batchTracked ?? false;
                const expiryRequired = poLine?.expiryTracked ?? manualProduct?.expiryTracked ?? false;
                return (
                <div
                  key={idx}
                  className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <div className="grid gap-2 sm:grid-cols-12 sm:items-end">
                  <label className="sm:col-span-5">
                    <span className="text-xs text-slate-500">Product</span>
                    {purchaseOrderId && eligible.data?.lines[idx]?.productName ? (
                      <div className="mt-0.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950">
                        {eligible.data.lines[idx].productName}
                      </div>
                    ) : (
                      <>
                        <Combobox
                          className="mt-0.5 w-full max-w-none"
                          inputClassName="rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={line.productId}
                          onChange={(v) =>
                            setLines((prev) => {
                              const n = [...prev];
                              const p = v ? productById.get(v) : undefined;
                              n[idx] = {
                                ...n[idx],
                                productId: v,
                                unitPrice: p ? formatAmount(p.costPrice) : n[idx].unitPrice,
                                tradePrice: p ? formatAmount(p.sellingPrice) : n[idx].tradePrice,
                                retailPrice: p ? formatAmount(p.retailPrice) : n[idx].retailPrice,
                              };
                              return n;
                            })
                          }
                          options={productLineOptions}
                          placeholder="Search product…"
                          disabled={products.isLoading}
                          aria-label="Product"
                        />
                        {!supplierId && (
                          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Select supplier first</p>
                        )}
                      </>
                    )}
                  </label>
                  <label className="sm:col-span-3">
                    <span className="text-xs text-slate-500">Qty received</span>
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
                  <label className="sm:col-span-4">
                    <span className="text-xs text-slate-500">Unit cost</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={formatAmountInput(line.unitPrice)}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], unitPrice: normalizeAmountInput(e.target.value) };
                          return n;
                        })
                      }
                      onBlur={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], unitPrice: formatAmount(normalizeAmountInput(e.target.value)) };
                          return n;
                        })
                      }
                    />
                  </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label>
                    <span className="text-xs text-slate-500">Trade price (batch)</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.tradePrice}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], tradePrice: e.target.value };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs text-slate-500">Retail price (batch)</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.retailPrice}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], retailPrice: e.target.value };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs text-slate-500">
                      Batch{batchRequired ? <span className="text-amber-700 dark:text-amber-400"> *</span> : ' (optional)'}
                    </span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.batchCode}
                      required={batchRequired}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], batchCode: e.target.value };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs text-slate-500">
                      Expiry{expiryRequired ? <span className="text-amber-700 dark:text-amber-400"> *</span> : ' (optional)'}
                    </span>
                    <input
                      type="date"
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.expiryDate}
                      required={expiryRequired}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], expiryDate: e.target.value };
                          return n;
                        })
                      }
                    />
                  </label>
                  </div>
                </div>
              );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => {
                  setPanelOpen(false);
                  setSearchParams({});
                }}
              >
                Cancel
              </button>
              {canWrite && (
                <button
                  type="button"
                  disabled={createGrn.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => createGrn.mutate()}
                >
                  Save draft GRN
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
