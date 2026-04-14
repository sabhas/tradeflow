import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { InventorySubNav } from '../../components/InventorySubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface BalanceRow {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  updatedAt: string;
  valueAtCost?: string;
  valueAtLayers?: string;
  product?: { id: string; sku: string; name: string; costPrice: string };
  warehouse?: { id: string; name: string; code: string };
}

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

export function InventoryStockPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'inventory:read');

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead,
    queryFn: async () => {
      const res = await apiFetch<{ data: WarehouseOpt[] }>('/warehouses');
      return res.data;
    },
  });

  const products = useQuery({
    queryKey: ['products', 'inventory-dd'],
    enabled: canRead,
    queryFn: async () => {
      const res = await apiFetch<{ data: ProductOpt[] }>('/products?limit=500&activeOnly=true');
      return res.data;
    },
  });

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    if (warehouseId) q.set('warehouseId', warehouseId);
    if (productId) q.set('productId', productId);
    return q.toString();
  }, [warehouseId, productId]);

  const balances = useQuery({
    queryKey: ['inventory', 'balances', queryString],
    enabled: canRead,
    queryFn: async () => {
      const path = queryString ? `/inventory/balances?${queryString}` : '/inventory/balances';
      const res = await apiFetch<{ data: BalanceRow[] }>(path);
      return res.data;
    },
  });

  const warehouseOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...(warehouses.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    ],
    [warehouses.data]
  );
  const productOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...(products.data ?? []).map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
    ],
    [products.data]
  );

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Current stock</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Balances by product and warehouse. Layer value uses FIFO/LIFO/FEFO stock layers; legacy column uses product cost
        price.
      </p>
      <InventorySubNav />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Warehouse</span>
          <Combobox
            inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouseOptions}
            placeholder="All warehouses…"
            disabled={warehouses.isLoading}
            aria-label="Warehouse filter"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Product</span>
          <Combobox
            className="min-w-[14rem]"
            inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={productId}
            onChange={setProductId}
            options={productOptions}
            placeholder="All products…"
            disabled={products.isLoading}
            aria-label="Product filter"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Warehouse</th>
              <th className="px-4 py-3 text-right font-medium">Quantity</th>
              <th className="px-4 py-3 text-right font-medium">Value (layers)</th>
              <th className="px-4 py-3 text-right font-medium">Value (product cost)</th>
            </tr>
          </thead>
          <tbody>
            {balances.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : (balances.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No stock rows yet. Post an opening balance or receive stock.
                </td>
              </tr>
            ) : (
              (balances.data ?? []).map((row) => (
                <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">{row.product?.sku ?? '—'}</td>
                  <td className="px-4 py-2">{row.product?.name ?? row.productId}</td>
                  <td className="px-4 py-2">
                    {row.warehouse ? `${row.warehouse.code} — ${row.warehouse.name}` : row.warehouseId}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.valueAtLayers ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.valueAtCost ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
