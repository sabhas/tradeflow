import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { downloadXlsx } from '../../lib/downloadXlsx';
import { hasPermission } from '../../lib/permissions';
import { printTableAsPdf } from '../../lib/printTable';
import { useAppSelector } from '../../hooks/useAppSelector';

type DailyRow = { date: string; count: number; totalAmount: string };
type MovementRow = {
  date: string;
  movementId: string;
  productSku: string;
  productName: string;
  type: string;
  qty: string;
  refId: string | null;
  warehouseName: string;
  notes: string;
};
type FastRow = {
  productId: string;
  productSku: string;
  productName: string;
  quantitySold: string;
  lineValue: string;
};

function defaultRange() {
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - 1);
  return { dateFrom: dateFrom.toISOString().slice(0, 10), dateTo };
}

export function OperationalReportsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canSales = hasPermission(permissions, 'sales:read');
  const canInventory = hasPermission(permissions, 'inventory:read');

  const [tab, setTab] = useState<'daily' | 'movement' | 'fast'>(() => {
    if (canSales) return 'daily';
    if (canInventory) return 'movement';
    return 'daily';
  });

  const initial = defaultRange();
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<'quantity' | 'value'>('quantity');

  const customers = useQuery({
    queryKey: ['customers', 'report-dd'],
    enabled: canSales && (tab === 'daily' || tab === 'fast'),
    staleTime: 120_000,
    queryFn: () => apiFetch<{ data: { id: string; name: string }[] }>('/customers?limit=500').then((r) => r.data),
  });

  const warehouses = useQuery({
    queryKey: ['warehouses', 'report-dd'],
    enabled: canSales && tab === 'daily',
    staleTime: 120_000,
    queryFn: () => apiFetch<{ data: { id: string; name: string }[] }>('/warehouses').then((r) => r.data),
  });

  const warehousesMv = useQuery({
    queryKey: ['warehouses', 'report-dd-mv'],
    enabled: canInventory && tab === 'movement',
    staleTime: 120_000,
    queryFn: () => apiFetch<{ data: { id: string; name: string }[] }>('/warehouses').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'report-dd'],
    enabled: canInventory && tab === 'movement',
    staleTime: 120_000,
    queryFn: () => apiFetch<{ data: { id: string; sku: string; name: string }[] }>('/products?limit=500').then(
      (r) => r.data
    ),
  });

  const dailyQs = useMemo(() => {
    const q = new URLSearchParams({ dateFrom, dateTo });
    if (customerId) q.set('customerId', customerId);
    if (warehouseId) q.set('warehouseId', warehouseId);
    return q.toString();
  }, [dateFrom, dateTo, customerId, warehouseId]);

  const movementQs = useMemo(() => {
    const q = new URLSearchParams({ dateFrom, dateTo });
    if (productId) q.set('productId', productId);
    if (warehouseId) q.set('warehouseId', warehouseId);
    return q.toString();
  }, [dateFrom, dateTo, productId, warehouseId]);

  const fastQs = useMemo(() => {
    const q = new URLSearchParams({ dateFrom, dateTo, limit: String(limit), sortBy });
    return q.toString();
  }, [dateFrom, dateTo, limit, sortBy]);

  const daily = useQuery({
    queryKey: ['reports', 'daily-sales', dailyQs],
    enabled: canSales && tab === 'daily',
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<{ data: DailyRow[]; meta: Record<string, string | number> }>(
        `/reports/daily-sales?${dailyQs}`
      ).then((r) => r),
  });

  const movement = useQuery({
    queryKey: ['reports', 'stock-movement', movementQs],
    enabled: canInventory && tab === 'movement',
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<{ data: MovementRow[]; meta: Record<string, unknown> }>(
        `/reports/stock-movement?${movementQs}`
      ).then((r) => r),
  });

  const fast = useQuery({
    queryKey: ['reports', 'fast-moving', fastQs],
    enabled: canSales && tab === 'fast',
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<{ data: FastRow[]; meta: Record<string, unknown> }>(`/reports/fast-moving?${fastQs}`).then(
        (r) => r
      ),
  });

  if (!canSales && !canInventory) {
    return <p className="text-slate-600">You need sales or inventory access to view operational reports.</p>;
  }

  const rangeSubtitle = `${dateFrom} → ${dateTo}`;

  const exportDailyExcel = async () => {
    const d = daily.data?.data;
    if (!d?.length) return;
    await downloadXlsx(
      `daily-sales-${dateFrom}-${dateTo}.xlsx`,
      'Daily sales',
      ['Date', 'Invoice count', 'Total amount'],
      d.map((r) => [r.date, r.count, r.totalAmount])
    );
  };

  const exportDailyPdf = () => {
    const d = daily.data?.data;
    if (!d?.length) return;
    printTableAsPdf(
      'Daily sales',
      rangeSubtitle,
      ['Date', 'Count', 'Total'],
      d.map((r) => [r.date, String(r.count), r.totalAmount])
    );
  };

  const exportMovementExcel = async () => {
    const d = movement.data?.data;
    if (!d?.length) return;
    await downloadXlsx(
      `stock-movement-${dateFrom}-${dateTo}.xlsx`,
      'Stock movement',
      ['Date', 'SKU', 'Product', 'Warehouse', 'Type', 'Qty', 'Ref', 'Notes'],
      d.map((r) => [
        r.date,
        r.productSku,
        r.productName,
        r.warehouseName,
        r.type,
        r.qty,
        r.refId ?? '',
        r.notes,
      ])
    );
  };

  const exportMovementPdf = () => {
    const d = movement.data?.data;
    if (!d?.length) return;
    printTableAsPdf(
      'Stock movement',
      rangeSubtitle,
      ['Date', 'Product', 'Type', 'Qty', 'Warehouse'],
      d.map((r) => [r.date, `${r.productSku} ${r.productName}`, r.type, r.qty, r.warehouseName])
    );
  };

  const exportFastExcel = async () => {
    const d = fast.data?.data;
    if (!d?.length) return;
    await downloadXlsx(
      `fast-moving-${dateFrom}-${dateTo}.xlsx`,
      'Fast-moving',
      ['SKU', 'Product', 'Qty sold', 'Line value'],
      d.map((r) => [r.productSku, r.productName, r.quantitySold, r.lineValue])
    );
  };

  const exportFastPdf = () => {
    const d = fast.data?.data;
    if (!d?.length) return;
    printTableAsPdf(
      'Fast-moving products',
      `${rangeSubtitle} · Top ${limit} by ${sortBy}`,
      ['Product', 'Qty sold', 'Line value'],
      d.map((r) => [`${r.productSku} ${r.productName}`, r.quantitySold, r.lineValue])
    );
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800">Operational reports</h2>
      <p className="mt-1 text-sm text-slate-600">Posted sales and inventory movements for the selected period.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {canSales && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'daily' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('daily')}
          >
            Daily sales
          </button>
        )}
        {canInventory && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'movement' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('movement')}
          >
            Stock movement
          </button>
        )}
        {canSales && (
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'fast' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setTab('fast')}
          >
            Fast-moving items
          </button>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">From</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1.5"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">To</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1.5"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          {tab === 'daily' && canSales && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Customer</span>
                <select
                  className="min-w-[200px] rounded-md border border-slate-300 px-2 py-1.5"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">All</option>
                  {(customers.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Warehouse</span>
                <select
                  className="min-w-[200px] rounded-md border border-slate-300 px-2 py-1.5"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">All</option>
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {tab === 'movement' && canInventory && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Product</span>
                <select
                  className="min-w-[220px] rounded-md border border-slate-300 px-2 py-1.5"
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
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Warehouse</span>
                <select
                  className="min-w-[200px] rounded-md border border-slate-300 px-2 py-1.5"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">All</option>
                  {(warehousesMv.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {tab === 'fast' && canSales && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Limit</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="w-24 rounded-md border border-slate-300 px-2 py-1.5"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 50)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">Sort by</span>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1.5"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'quantity' | 'value')}
                >
                  <option value="quantity">Quantity sold</option>
                  <option value="value">Line value</option>
                </select>
              </label>
            </>
          )}
        </div>

        {tab === 'daily' && daily.isPending && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {tab === 'daily' && daily.isError && (
          <p className="mt-6 text-sm text-red-600">{(daily.error as Error).message}</p>
        )}
        {tab === 'daily' && daily.data && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-600">
                Invoices:{' '}
                <span className="font-medium tabular-nums">{daily.data.meta.invoiceCount as number}</span>
                {' · '}
                Total:{' '}
                <span className="font-medium tabular-nums">{String(daily.data.meta.grandTotal)}</span>
              </p>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportDailyExcel().catch(() => {})}
                disabled={!daily.data.data.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportDailyPdf}
                disabled={!daily.data.data.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Invoices</th>
                    <th className="px-3 py-2 text-right">Total amount</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.data.data.map((r) => (
                    <tr key={r.date} className="border-t border-slate-100">
                      <td className="px-3 py-2">{r.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.totalAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {daily.data.data.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No posted invoices in this period.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'movement' && movement.isPending && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {tab === 'movement' && movement.isError && (
          <p className="mt-6 text-sm text-red-600">{(movement.error as Error).message}</p>
        )}
        {tab === 'movement' && movement.data && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-600">
                Rows: <span className="font-medium">{movement.data.meta.rowCount as number}</span>
              </p>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportMovementExcel().catch(() => {})}
                disabled={!movement.data.data.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportMovementPdf}
                disabled={!movement.data.data.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Warehouse</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-left">Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {movement.data.data.map((r) => (
                    <tr key={r.movementId} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2">
                        <span className="text-slate-500">{r.productSku}</span> {r.productName}
                      </td>
                      <td className="px-3 py-2">{r.warehouseName}</td>
                      <td className="px-3 py-2">{r.type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.refId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {movement.data.data.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No movements in this period.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'fast' && fast.isPending && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {tab === 'fast' && fast.isError && (
          <p className="mt-6 text-sm text-red-600">{(fast.error as Error).message}</p>
        )}
        {tab === 'fast' && fast.data && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={() => exportFastExcel().catch(() => {})}
                disabled={!fast.data.data.length}
              >
                Excel
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                onClick={exportFastPdf}
                disabled={!fast.data.data.length}
              >
                PDF
              </button>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Qty sold</th>
                    <th className="px-3 py-2 text-right">Line value</th>
                  </tr>
                </thead>
                <tbody>
                  {fast.data.data.map((r) => (
                    <tr key={r.productId} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <span className="text-slate-500">{r.productSku}</span> {r.productName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.quantitySold}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.lineValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fast.data.data.length === 0 && (
                <p className="p-4 text-sm text-slate-500">No lines in this period.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
