import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
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

type Line = { productId: string; quantity: number; unitCost: string; batchCode: string; expiryDate: string };

export function InventoryOpeningBalancePage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canWrite = hasPermission(permissions, 'inventory:write');
  const qc = useQueryClient();

  const [warehouseId, setWarehouseId] = useState('');
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([
    { productId: '', quantity: 1, unitCost: '', batchCode: '', expiryDate: '' },
  ]);
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
      const res = await apiFetch<{ data: ProductOpt[] }>('/products?limit=500&activeOnly=true');
      return res.data;
    },
  });

  const warehouseOptions = useMemo(
    () => [
      { value: '', label: 'Select…' },
      ...(warehouses.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    ],
    [warehouses.data]
  );
  const productLineOptions = useMemo(
    () => [
      { value: '', label: 'Select…' },
      ...(products.data ?? []).map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
    ],
    [products.data]
  );

  useEffect(() => {
    if (warehouseId || !warehouses.data?.length) return;
    setWarehouseId(warehouses.data[0].id);
  }, [warehouseId, warehouses.data]);

  const submit = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId && l.quantity > 0);
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
            batchCode: l.batchCode.trim() ? l.batchCode.trim() : null,
            expiryDate: l.expiryDate.trim() ? l.expiryDate : null,
          })),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setLines([{ productId: '', quantity: 1, unitCost: '', batchCode: '', expiryDate: '' }]);
    },
    onError: (e: Error) => setError(e.message || 'Request failed'),
  });

  if (!canWrite) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Opening balance</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Post initial quantities per product for a warehouse and effective date.
      </p>
      <InventorySubNav />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="max-w-3xl space-y-4 rounded-lg bg-white p-6 shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 dark:shadow-none">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Warehouse</span>
            <Combobox
              className="w-full max-w-none"
              value={warehouseId}
              onChange={setWarehouseId}
              options={warehouseOptions}
              placeholder="Search warehouse…"
              disabled={warehouses.isLoading}
              aria-label="Warehouse"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Movement date</span>
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
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lines</span>
            <button
              type="button"
              className="text-sm text-indigo-600 hover:text-indigo-800"
              onClick={() =>
                setLines((prev) => [...prev, { productId: '', quantity: 1, unitCost: '', batchCode: '', expiryDate: '' }])
              }
            >
              + Add line
            </button>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <label className="min-w-[12rem] flex-1 flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Product</span>
                <Combobox
                  className="w-full max-w-none"
                  value={line.productId}
                  onChange={(v) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, productId: v } : l)))}
                  options={productLineOptions}
                  placeholder="Search product…"
                  disabled={products.isLoading}
                  aria-label="Product"
                />
              </label>
              <label className="w-28 flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Qty</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  value={line.quantity}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = raw === '' ? 0 : Number(raw);
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, quantity: Number.isFinite(v) ? v : 0 } : l))
                    );
                  }}
                />
              </label>
              <label className="w-32 flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Unit cost</span>
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
              <label className="w-28 flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Batch</span>
                <input
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  placeholder="Opt."
                  value={line.batchCode}
                  onChange={(e) =>
                    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, batchCode: e.target.value } : l)))
                  }
                />
              </label>
              <label className="w-36 flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Expiry</span>
                <input
                  type="date"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={line.expiryDate}
                  onChange={(e) =>
                    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, expiryDate: e.target.value } : l)))
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
