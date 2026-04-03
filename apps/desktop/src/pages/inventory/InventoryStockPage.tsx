import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
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
      const res = await apiFetch<{ data: ProductOpt[] }>('/products?limit=500');
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

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Current stock</h1>
      <p className="mt-1 text-slate-600">
        Balances by product and warehouse. Layer value uses FIFO/LIFO/FEFO stock layers; legacy column uses product cost
        price.
      </p>
      <InventorySubNav />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Warehouse</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">All</option>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Product</span>
          <select
            className="min-w-[14rem] rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">All</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
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
                <tr key={row.id} className="border-t border-slate-100">
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
