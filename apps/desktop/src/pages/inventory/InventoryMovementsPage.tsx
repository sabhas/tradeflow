import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { InventorySubNav } from '../../components/InventorySubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

const REF_TYPES = [
  { value: '', label: 'All types' },
  { value: 'opening_balance', label: 'Opening balance' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'sale', label: 'Sale' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'transfer_in', label: 'Transfer in' },
  { value: 'transfer_out', label: 'Transfer out' },
];

interface MovementRow {
  id: string;
  productId: string;
  warehouseId: string;
  quantityDelta: string;
  refType: string;
  refId?: string;
  unitCost?: string;
  movementDate: string;
  notes?: string;
  product?: { id: string; sku: string; name: string };
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

export function InventoryMovementsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'inventory:read');

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [refType, setRefType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

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
    if (refType) q.set('refType', refType);
    if (dateFrom) q.set('dateFrom', dateFrom);
    if (dateTo) q.set('dateTo', dateTo);
    q.set('limit', String(limit));
    q.set('offset', String(offset));
    return q.toString();
  }, [warehouseId, productId, refType, dateFrom, dateTo, offset]);

  const movements = useQuery({
    queryKey: ['inventory', 'movements', queryString],
    enabled: canRead,
    queryFn: async () => {
      const res = await apiFetch<{ data: MovementRow[]; meta?: { total: number } }>(
        `/inventory/movements?${queryString}`
      );
      return res;
    },
  });

  const total = movements.data?.meta?.total ?? 0;
  const hasMore = offset + limit < total;

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Inventory movements</h1>
      <p className="mt-1 text-slate-600">All stock movements with filters.</p>
      <InventorySubNav />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Warehouse</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setOffset(0);
            }}
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
            onChange={(e) => {
              setProductId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Type</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={refType}
            onChange={(e) => {
              setRefType(e.target.value);
              setOffset(0);
            }}
          >
            {REF_TYPES.map((t) => (
              <option key={t.value || 'all'} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">From</span>
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">To</span>
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>

      <p className="mb-2 text-xs text-slate-500">
        {total} movement{total === 1 ? '' : 's'}
        {movements.isFetching ? ' (updating…)' : ''}
      </p>

      <div className="overflow-x-auto rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Warehouse</th>
              <th className="px-4 py-3 text-right font-medium">Delta</th>
              <th className="px-4 py-3 text-left font-medium">Ref</th>
              <th className="px-4 py-3 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {movements.isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : (movements.data?.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No movements found.
                </td>
              </tr>
            ) : (
              (movements.data?.data ?? []).map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2">{row.movementDate}</td>
                  <td className="px-4 py-2">{REF_TYPES.find((t) => t.value === row.refType)?.label ?? row.refType}</td>
                  <td className="px-4 py-2">{row.product?.sku ?? '—'}</td>
                  <td className="px-4 py-2">{row.product?.name ?? row.productId}</td>
                  <td className="px-4 py-2">
                    {row.warehouse ? `${row.warehouse.code}` : row.warehouseId}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.quantityDelta}</td>
                  <td className="max-w-[120px] truncate px-4 py-2 font-mono text-xs">{row.refId ?? '—'}</td>
                  <td className="max-w-[160px] truncate px-4 py-2 text-slate-600">{row.notes ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={offset === 0}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!hasMore}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => setOffset((o) => o + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
