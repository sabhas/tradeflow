import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { InventorySubNav } from '../../components/InventorySubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface WarehouseOpt {
  id: string;
  name: string;
  code: string;
}

interface ProductOpt {
  id: string;
  sku: string;
  name: string;
}

type Line = { productId: string; quantity: string; unitCost: string };

export function InventoryOpeningBalancePage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canWrite = hasPermission(permissions, 'inventory:write');
  const qc = useQueryClient();

  const [warehouseId, setWarehouseId] = useState('');
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '1', unitCost: '' }]);
  const [error, setError] = useState<string | null>(null);

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canWrite,
    queryFn: async () => {
      const res = await apiFetch<{ data: WarehouseOpt[] }>('/warehouses');
      return res.data;
    },
  });

  const products = useQuery({
    queryKey: ['products', 'inventory-dd'],
    enabled: canWrite,
    queryFn: async () => {
      const res = await apiFetch<{ data: ProductOpt[] }>('/products?limit=500');
      return res.data;
    },
  });

  const productOptions = products.data ?? [];

  useEffect(() => {
    if (warehouseId || !warehouses.data?.length) return;
    setWarehouseId(warehouses.data[0].id);
  }, [warehouseId, warehouses.data]);

  const submit = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId && parseFloat(l.quantity) > 0);
      if (!warehouseId) throw new Error('Select a warehouse');
      if (cleaned.length === 0) throw new Error('Add at least one line with a product and quantity');
      await apiFetch('/inventory/opening-balance', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId,
          movementDate,
          lines: cleaned.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCost: l.unitCost.trim() ? l.unitCost : null,
          })),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setLines([{ productId: '', quantity: '1', unitCost: '' }]);
    },
    onError: (e: Error) => setError(e.message || 'Request failed'),
  });

  if (!canWrite) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Opening balance</h1>
      <p className="mt-1 text-slate-600">Post initial quantities per product for a warehouse and effective date.</p>
      <InventorySubNav />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="max-w-3xl space-y-4 rounded-lg bg-white p-6 shadow ring-1 ring-slate-200">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Warehouse</span>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Select…</option>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Movement date</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Lines</span>
            <button
              type="button"
              className="text-sm text-indigo-600 hover:text-indigo-800"
              onClick={() => setLines((prev) => [...prev, { productId: '', quantity: '1', unitCost: '' }])}
            >
              + Add line
            </button>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-3">
              <label className="min-w-[12rem] flex-1 flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Product</span>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={line.productId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, productId: v } : l)));
                  }}
                >
                  <option value="">Select…</option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-28 flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Qty</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))
                  }
                />
              </label>
              <label className="w-32 flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Unit cost</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional"
                  value={line.unitCost}
                  onChange={(e) =>
                    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unitCost: e.target.value } : l)))
                  }
                />
              </label>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="mb-0.5 text-sm text-red-600 hover:text-red-800"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="pt-2">
          <button
            type="button"
            disabled={submit.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Posting…' : 'Post opening balance'}
          </button>
          {submit.isSuccess && <span className="ml-3 text-sm text-green-700">Posted successfully.</span>}
        </div>
      </div>
    </div>
  );
}
