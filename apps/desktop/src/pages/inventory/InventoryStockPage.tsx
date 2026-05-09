import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { InventorySubNav } from '../../components/InventorySubNav';
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
  valueAtCost?: string;
  valueAtLayers?: string;
  product?: { id: string; sku: string; name: string; costPrice: string; tradePrice?: string; retailPrice?: string };
  warehouse?: { id: string; name: string; code: string };
}

interface BatchBalanceRow {
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  batchCode: string;
  expiryDate?: string | null;
  quantity: string;
  valueAtLayers: string;
  tradePrice?: string;
  retailPrice?: string;
  oldestReceivedAt?: string | null;
  latestReceivedAt?: string | null;
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
  const { formatMoney } = useMoneyFormat();

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [viewMode, setViewMode] = useState<'summary' | 'batch'>('summary');
  const [batchQuery, setBatchQuery] = useState('');
  const [expiryBefore, setExpiryBefore] = useState('');

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
  const batchQueryString = useMemo(() => {
    const q = new URLSearchParams();
    if (warehouseId) q.set('warehouseId', warehouseId);
    if (productId) q.set('productId', productId);
    if (batchQuery.trim()) q.set('batch', batchQuery.trim());
    if (expiryBefore) q.set('expiryBefore', expiryBefore);
    return q.toString();
  }, [warehouseId, productId, batchQuery, expiryBefore]);
  const batchBalances = useQuery({
    queryKey: ['inventory', 'balances', 'batches', batchQueryString],
    enabled: canRead && viewMode === 'batch',
    queryFn: async () => {
      const path = batchQueryString ? `/inventory/balances/batches?${batchQueryString}` : '/inventory/balances/batches';
      const res = await apiFetch<{ data: BatchBalanceRow[] }>(path);
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
  const renderMoney = (value?: string) => (value == null ? '—' : formatMoney(value));
  const renderQuantity = (value?: string) => (value == null ? '—' : formatAmount(value, 0));
  const activeRows = viewMode === 'summary' ? balances.data ?? [] : batchBalances.data ?? [];
  const totalQty = activeRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalValue =
    viewMode === 'summary'
      ? (balances.data ?? []).reduce((sum, row) => sum + Number(row.valueAtLayers || 0), 0)
      : (batchBalances.data ?? []).reduce((sum, row) => sum + Number(row.valueAtLayers || 0), 0);
  const totalBatchRows = batchBalances.data?.length ?? 0;

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Current stock</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Review stock by summary or drill down to batch/expiry-level details for FEFO operations.
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
        <div className="ml-auto flex rounded-md border border-slate-300 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            className={`rounded px-3 py-1.5 ${viewMode === 'summary' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-700 dark:text-slate-300'}`}
            onClick={() => setViewMode('summary')}
          >
            Summary
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1.5 ${viewMode === 'batch' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-700 dark:text-slate-300'}`}
            onClick={() => setViewMode('batch')}
          >
            By batch
          </button>
        </div>
      </div>

      {viewMode === 'batch' && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Batch contains</span>
            <input
              type="text"
              value={batchQuery}
              onChange={(e) => setBatchQuery(e.target.value)}
              placeholder="e.g. BATCH-24"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Expiry on/before</span>
            <input
              type="date"
              value={expiryBefore}
              onChange={(e) => setExpiryBefore(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
            onClick={() => {
              setBatchQuery('');
              setExpiryBefore('');
            }}
          >
            Clear batch filters
          </button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Rows</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{formatAmount(activeRows.length, 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total quantity</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{formatAmount(totalQty, 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {viewMode === 'summary' ? 'Total value' : 'Batch rows'}
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {viewMode === 'summary' ? formatMoney(totalValue) : formatAmount(totalBatchRows, 0)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        {viewMode === 'summary' ? (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left font-medium">SKU</th>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-left font-medium">Warehouse</th>
                <th className="px-4 py-3 text-right font-medium">Trade price</th>
                <th className="px-4 py-3 text-right font-medium">Retail price</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 text-right font-medium">Value (product cost)</th>
              </tr>
            </thead>
            <tbody>
              {balances.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : (balances.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
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
                    <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.product?.tradePrice)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.product?.retailPrice)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderQuantity(row.quantity)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.valueAtLayers)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.valueAtCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left font-medium">SKU</th>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-left font-medium">Warehouse</th>
                <th className="px-4 py-3 text-left font-medium">Batch</th>
                <th className="px-4 py-3 text-left font-medium">Expiry</th>
                <th className="px-4 py-3 text-right font-medium">Trade price</th>
                <th className="px-4 py-3 text-right font-medium">Retail price</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {batchBalances.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Loading batch rows…
                  </td>
                </tr>
              ) : (batchBalances.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No batch rows for selected filters.
                  </td>
                </tr>
              ) : (
                (batchBalances.data ?? []).map((row) => (
                  <tr
                    key={`${row.productId}|${row.warehouseId}|${row.batchCode}|${row.expiryDate ?? 'none'}`}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-4 py-2">{row.productSku}</td>
                    <td className="px-4 py-2">{row.productName}</td>
                    <td className="px-4 py-2">{`${row.warehouseCode} — ${row.warehouseName}`}</td>
                    <td className="px-4 py-2">{row.batchCode || 'Unspecified'}</td>
                    <td className="px-4 py-2">{row.expiryDate ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.tradePrice)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.retailPrice)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderQuantity(row.quantity)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{renderMoney(row.valueAtLayers)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
