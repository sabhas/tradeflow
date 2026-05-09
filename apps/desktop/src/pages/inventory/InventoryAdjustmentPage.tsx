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

type Line = { productId: string; quantityDelta: number };

export function InventoryAdjustmentPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canWrite = hasPermission(permissions, 'inventory:write');
  const qc = useQueryClient();

  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [movementDate, setMovementDate] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantityDelta: 1 }]);
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
      const cleaned = lines.filter((l) => l.productId && l.quantityDelta !== 0);
      if (!warehouseId) throw new Error('Select a warehouse');
      if (!reason.trim()) throw new Error('Enter a reason');
      if (cleaned.length === 0) throw new Error('Add at least one line with a product and non-zero delta');
      const payload: Record<string, unknown> = {
        warehouseId,
        reason: reason.trim(),
        lines: cleaned.map((l) => ({
          productId: l.productId,
          quantityDelta: l.quantityDelta,
        })),
      };
      if (movementDate) payload.movementDate = movementDate;
      await apiFetch('/inventory/adjustment', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setLines([{ productId: '', quantityDelta: 1 }]);
      setReason('');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!canWrite) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Stock adjustment</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Increase or decrease quantities with a reason (damage, count correction, expiry, etc.). Negative stock is blocked.
      </p>
      <InventorySubNav />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="max-w-3xl space-y-4 rounded-lg bg-white p-6 shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 dark:shadow-none">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
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
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">Reason</span>
            <input
              type="text"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. Stock count correction"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Movement date (optional)</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">Defaults to today if empty.</span>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lines</span>
            <button
              type="button"
              className="text-sm text-indigo-600 hover:text-indigo-800"
              onClick={() => setLines((prev) => [...prev, { productId: '', quantityDelta: 1 }])}
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
              <label className="w-36 flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Qty delta (+/−)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  value={line.quantityDelta}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = raw === '' ? 0 : Number(raw);
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, quantityDelta: Number.isFinite(v) ? v : 0 } : l))
                    );
                  }}
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
            {submit.isPending ? 'Posting…' : 'Post adjustment'}
          </button>
          {submit.isSuccess && <span className="ml-3 text-sm text-green-700">Posted successfully.</span>}
        </div>
      </div>
    </div>
  );
}
