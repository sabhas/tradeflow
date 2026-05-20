import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { InventorySubNav } from '../../components/InventorySubNav';
import {
  StockProductDetailModal,
  type StockDetailContext,
} from '../../components/StockProductDetailModal';
import { formatAmount } from '../../lib/numberFormat';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';

interface BalanceRow {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  updatedAt: string;
  valueAtLayers?: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    costPrice: string;
    tradePrice?: string;
    retailPrice?: string;
    supplier?: { id: string; name: string };
  };
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

interface SupplierOpt {
  id: string;
  name: string;
}

export function InventoryStockPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'inventory:read');
  const { formatMoney } = useMoneyFormat();

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [search, setSearch] = useState('');
  const [detailRow, setDetailRow] = useState<BalanceRow | null>(null);

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

  const suppliers = useQuery({
    queryKey: ['suppliers', 'inventory-dd'],
    enabled: canRead,
    queryFn: async () => {
      const res = await apiFetch<{ data: SupplierOpt[] }>('/suppliers?limit=500');
      return res.data;
    },
  });

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    if (warehouseId) q.set('warehouseId', warehouseId);
    if (productId) q.set('productId', productId);
    if (supplierId) q.set('supplierId', supplierId);
    return q.toString();
  }, [warehouseId, productId, supplierId]);

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
  const supplierOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    ],
    [suppliers.data]
  );

  const filteredRows = useMemo(() => {
    const rows = balances.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const sku = row.product?.sku?.toLowerCase() ?? '';
      const name = row.product?.name?.toLowerCase() ?? '';
      return sku.includes(q) || name.includes(q);
    });
  }, [balances.data, search]);

  const hasFilters = !!(warehouseId || productId || supplierId || search.trim());

  const renderMoney = (value?: string) => (value == null ? '—' : formatMoney(value));
  const renderQuantity = (value?: string) => (value == null ? '—' : formatAmount(value, 0));

  const totalQty = filteredRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalValue = filteredRows.reduce((sum, row) => sum + Number(row.valueAtLayers || 0), 0);

  const detailContext: StockDetailContext | null = detailRow
    ? {
        productId: detailRow.productId,
        warehouseId: detailRow.warehouseId,
        sku: detailRow.product?.sku ?? '—',
        productName: detailRow.product?.name ?? detailRow.productId,
        warehouseLabel: detailRow.warehouse
          ? `${detailRow.warehouse.code} — ${detailRow.warehouse.name}`
          : detailRow.warehouseId,
        supplierName: detailRow.product?.supplier?.name,
        summaryQuantity: detailRow.quantity,
        summaryValueAtLayers: detailRow.valueAtLayers,
      }
    : null;

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Current stock</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Stock by product and warehouse. Click a row to view batches, expiry, and per-batch pricing (FEFO).
      </p>
      <InventorySubNav />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Supplier</span>
          <Combobox
            className="min-w-[12rem]"
            inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={supplierId}
            onChange={setSupplierId}
            options={supplierOptions}
            placeholder="All suppliers…"
            disabled={suppliers.isLoading}
            aria-label="Supplier filter"
          />
        </label>
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU or product name…"
            className="min-w-[12rem] rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={() => {
              setWarehouseId('');
              setProductId('');
              setSupplierId('');
              setSearch('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Products in view</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatAmount(filteredRows.length, 0)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total quantity</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{formatAmount(totalQty, 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total value</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{formatMoney(totalValue)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-left font-medium">Warehouse</th>
              <th className="px-4 py-3 text-right font-medium">Trade price</th>
              <th className="px-4 py-3 text-right font-medium">Retail price</th>
              <th className="px-4 py-3 text-right font-medium">Quantity</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {balances.isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  {hasFilters
                    ? 'No stock rows match your filters.'
                    : 'No stock rows yet. Post an opening balance or receive stock.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  onClick={() => setDetailRow(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDetailRow(row);
                    }
                  }}
                >
                  <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                    {row.product?.sku ?? '—'}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {row.product?.name ?? row.productId}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.product?.supplier?.name ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    {row.warehouse ? `${row.warehouse.code} — ${row.warehouse.name}` : row.warehouseId}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.product?.tradePrice)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.product?.retailPrice)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{renderQuantity(row.quantity)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.valueAtLayers)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <StockProductDetailModal
        open={detailRow != null}
        onClose={() => setDetailRow(null)}
        context={detailContext}
      />
    </div>
  );
}
