import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { LineStockInfo } from '../../components/LineStockInfo';
import { SalesSubNav } from '../../components/SalesSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';

interface CustomerOpt {
  id: string;
  name: string;
}
interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  sellingPrice: string;
}
interface TaxOpt {
  id: string;
  name: string;
}
interface OrderRow {
  id: string;
  customerId: string;
  customerName?: string | null;
  orderDate: string;
  status: string;
  total: string;
  hasInvoice: boolean;
  warehouseName?: string | null;
  salespersonName?: string | null;
  lineCount?: number;
}
interface OrderLine {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxProfileId?: string | null;
  deliveredQuantity: string;
  product?: { sku: string; name: string };
}

type Line = { productId: string; quantity: number; unitPrice: string; discountAmount: string; taxProfileId: string };

const emptyLine = (): Line => ({
  productId: '',
  quantity: 1,
  unitPrice: '0',
  discountAmount: '0',
  taxProfileId: '',
});

const PAGE_SIZE = 50;

export function SalesOrdersPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'sales:read');
  const canWrite = hasPermission(permissions, 'sales:create') || hasPermission(permissions, 'sales:update');
  const qc = useQueryClient();
  const { formatMoney, formatMoneyPlain, formatMoneyInput, normalizeMoneyInput } = useMoneyFormat();

  const [panelOpen, setPanelOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertOrderId, setConvertOrderId] = useState<string | null>(null);
  const [invWarehouse, setInvWarehouse] = useState('');
  const [invPayment, setInvPayment] = useState<'credit' | 'cash' | ''>('credit');
  const [invLines, setInvLines] = useState<Array<{ salesOrderLineId: string; quantity: number }>>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [filterHasInvoice, setFilterHasInvoice] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filterQueryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filterDateFrom) p.set('dateFrom', filterDateFrom);
    if (filterDateTo) p.set('dateTo', filterDateTo);
    if (filterStatus) p.set('status', filterStatus);
    if (filterCustomerId) p.set('customerId', filterCustomerId);
    if (filterWarehouseId) p.set('warehouseId', filterWarehouseId);
    if (filterHasInvoice === 'yes') p.set('hasInvoice', 'true');
    if (filterHasInvoice === 'no') p.set('hasInvoice', 'false');
    return p.toString();
  }, [
    filterDateFrom,
    filterDateTo,
    filterStatus,
    filterCustomerId,
    filterWarehouseId,
    filterHasInvoice,
  ]);

  useEffect(() => {
    setPage(0);
  }, [filterQueryString]);

  const offset = page * PAGE_SIZE;

  const list = useQuery({
    queryKey: ['sales-orders', filterQueryString, page],
    enabled: canRead,
    queryFn: () => {
      const params = new URLSearchParams(filterQueryString);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      return apiFetch<{ data: OrderRow[]; meta: { total: number; limit: number; offset: number } }>(
        `/sales-orders?${params.toString()}`
      );
    },
  });

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!list.data) return;
    const ids = new Set(rows.map((r) => r.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => ids.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [list.data, rows]);

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));
  const someOnPageSelected = rows.some((r) => selectedIds.includes(r.id));

  const selectedDraftIds = useMemo(
    () => selectedIds.filter((id) => rows.find((r) => r.id === id)?.status === 'draft'),
    [selectedIds, rows]
  );
  const selectedConvertibleIds = useMemo(
    () =>
      selectedIds.filter((id) => {
        const row = rows.find((r) => r.id === id);
        return !!row && row.status === 'confirmed' && !row.hasInvoice;
      }),
    [selectedIds, rows]
  );

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead,
    queryFn: () => apiFetchData<Array<{ id: string; name: string; isDefault?: boolean }>>('/warehouses'),
  });

  const filterCustomers = useQuery({
    queryKey: ['customers', 'so-filter'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: CustomerOpt[] }>('/customers?limit=500').then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ['sales-order', editingId],
    enabled: !!editingId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: OrderRow & {
          lines: OrderLine[];
          notes?: string;
          warehouseId?: string | null;
          salespersonId?: string | null;
          discountAmount: string;
        };
      }>(`/sales-orders/${editingId}`).then((r) => r.data),
  });

  const convertDetail = useQuery({
    queryKey: ['sales-order', convertOrderId],
    enabled: !!convertOrderId && convertOpen,
    queryFn: () =>
      apiFetch<{ data: { lines: OrderLine[] } }>(`/sales-orders/${convertOrderId}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!panelOpen || !editingId) return;
    // While the selected order is loading, clear line state so we do not briefly show
    // stale amounts (e.g. from "New order" or another order) with API precision.
    if (detail.isLoading) {
      setLines([emptyLine()]);
      setHeaderDiscount('0');
      return;
    }
    if (!detail.data) return;
    if (detail.data.id !== editingId) return;

    const d = detail.data;
    setCustomerId(d.customerId);
    setOrderDate(d.orderDate);
    setWarehouseId(d.warehouseId ?? '');
    setSalespersonId(d.salespersonId ?? '');
    setNotes(d.notes ?? '');
    setHeaderDiscount(formatMoneyPlain(d.discountAmount));
    setLines(
      (d.lines || []).length
        ? d.lines.map((l) => ({
            productId: l.productId,
            quantity: parseFloat(l.quantity),
            unitPrice: formatMoneyPlain(l.unitPrice),
            discountAmount: formatMoneyPlain(l.discountAmount),
            taxProfileId: l.taxProfileId ?? '',
          }))
        : [emptyLine()]
    );
  }, [panelOpen, editingId, detail.data, detail.isLoading, formatMoneyPlain]);

  useEffect(() => {
    const d = convertDetail.data;
    if (!d?.lines || !convertOpen) return;
    setInvLines(
      d.lines.map((l) => {
        const rem = Math.max(
          0,
          parseFloat(l.quantity) - parseFloat(l.deliveredQuantity || '0')
        ).toFixed(4);
        return { salesOrderLineId: l.id, quantity: parseFloat(rem) };
      })
    );
  }, [convertDetail.data, convertOpen]);

  useEffect(() => {
    if (!panelOpen || editingId) return;
    if (warehouseId || !warehouses.data?.length) return;
    const defaultWarehouse = warehouses.data.find((w) => w.isDefault);
    setWarehouseId(defaultWarehouse?.id ?? warehouses.data[0].id);
  }, [panelOpen, editingId, warehouseId, warehouses.data]);

  useEffect(() => {
    if (!convertOpen) return;
    if (invWarehouse || !warehouses.data?.length) return;
    const defaultWarehouse = warehouses.data.find((w) => w.isDefault);
    setInvWarehouse(defaultWarehouse?.id ?? warehouses.data[0].id);
  }, [convertOpen, invWarehouse, warehouses.data]);

  const customers = useQuery({
    queryKey: ['customers', 'sales-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: CustomerOpt[] }>('/customers?limit=500').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'sales-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: ProductOpt[] }>('/products?limit=500&activeOnly=true').then((r) => r.data),
  });

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetchData<TaxOpt[]>('/tax-profiles'),
  });

  const salespersons = useQuery({
    queryKey: ['salespersons', 'so-panel'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/salespersons').then((r) => r.data),
  });

  const filterCustomerOptions = useMemo(
    () => [
      { value: '', label: 'All customers' },
      ...(filterCustomers.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [filterCustomers.data]
  );
  const filterWarehouseOptions = useMemo(
    () => [
      { value: '', label: 'All warehouses' },
      ...(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name })),
    ],
    [warehouses.data]
  );

  const customerOptions = useMemo(
    () => [
      ...(customers.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [customers.data]
  );
  const warehouseOptions = useMemo(
    () => [
      ...(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name })),
    ],
    [warehouses.data]
  );
  const salespersonOptions = useMemo(
    () => [
      ...(salespersons.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    ],
    [salespersons.data]
  );
  const productLineOptions = useMemo(
    () => [
      ...(products.data ?? []).map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
    ],
    [products.data]
  );
  const taxLineOptions = useMemo(
    () => [
      ...(taxProfiles.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ],
    [taxProfiles.data]
  );

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId);
      if (!customerId) throw new Error('Select a customer');
      if (cleaned.length === 0) throw new Error('Add at least one line');
      const payload = {
        customerId,
        orderDate,
        warehouseId: warehouseId || null,
        salespersonId: salespersonId || null,
        notes: notes || null,
        discountAmount: headerDiscount,
        lines: cleaned.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount || '0',
          taxProfileId: l.taxProfileId || null,
        })),
      };
      if (editingId) {
        await apiFetch(`/sales-orders/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/sales-orders', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      setPanelOpen(false);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/sales-orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-orders'] }),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => apiFetch(`/sales-orders/${id}/confirm`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['sales-order'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const panelOrder =
    editingId && detail.data?.id === editingId ? detail.data : undefined;
  /** API allows edits only for draft; avoid showing an editable form that will fail on save. */
  const orderReadOnly = !!editingId && (!panelOrder || panelOrder.status !== 'draft');

  const doConvert = useMutation({
    mutationFn: async () => {
      if (!convertOrderId) throw new Error('No order');
      if (!invWarehouse) throw new Error('Select warehouse');
      if (!invPayment) throw new Error('Select payment type');
      const linesPayload = invLines.filter((l) => l.quantity > 0);
      if (linesPayload.length === 0) throw new Error('Enter quantity on at least one line');
      await apiFetch(`/sales-orders/${convertOrderId}/convert-to-invoice`, {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: invWarehouse,
          paymentType: invPayment,
          invoiceDate: new Date().toISOString().slice(0, 10),
          discountAmount: '0',
          lines: linesPayload,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['sales-order'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setConvertOpen(false);
      setConvertOrderId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const bulkAction = useMutation({
    mutationFn: async (action: 'confirm' | 'delete') => {
      if (selectedDraftIds.length === 0) throw new Error('Select at least one draft order');
      const res = await apiFetch<{ data: { results: Array<{ id: string; ok: boolean; error?: string }> } }>(
        '/sales-orders/bulk',
        { method: 'POST', body: JSON.stringify({ action, ids: selectedDraftIds }) }
      );
      const failed = res.data.results.filter((r) => !r.ok);
      if (failed.length > 0) {
        throw new Error(
          failed
            .slice(0, 5)
            .map((f) => `${f.error ?? 'Failed'}`)
            .join('; ') + (failed.length > 5 ? ` (+${failed.length - 5} more)` : '')
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['sales-order'] });
      setSelectedIds([]);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const bulkConvert = useMutation({
    mutationFn: async () => {
      if (selectedConvertibleIds.length === 0) {
        throw new Error('Select at least one confirmed, uninvoiced order');
      }

      const defaultWarehouse = warehouses.data?.find((w) => w.isDefault)?.id ?? warehouses.data?.[0]?.id;
      const failures: string[] = [];

      for (const id of selectedConvertibleIds) {
        try {
          const detailRes = await apiFetch<{
            data: { warehouseId?: string | null; lines: OrderLine[] };
          }>(`/sales-orders/${id}`);
          const targetWarehouse = detailRes.data.warehouseId ?? defaultWarehouse;
          if (!targetWarehouse) {
            failures.push('No warehouse set on selected order(s).');
            continue;
          }

          const linesPayload = detailRes.data.lines
            .map((l) => {
              const remaining = Math.max(
                0,
                parseFloat(l.quantity || '0') - parseFloat(l.deliveredQuantity || '0')
              );
              return { salesOrderLineId: l.id, quantity: remaining };
            })
            .filter((l) => l.quantity > 0);

          if (linesPayload.length === 0) {
            failures.push('Some selected orders have no remaining quantity to invoice.');
            continue;
          }

          await apiFetch(`/sales-orders/${id}/convert-to-invoice`, {
            method: 'POST',
            body: JSON.stringify({
              warehouseId: targetWarehouse,
              paymentType: 'credit',
              invoiceDate: new Date().toISOString().slice(0, 10),
              discountAmount: '0',
              lines: linesPayload,
            }),
          });
        } catch (e) {
          failures.push((e as Error).message);
        }
      }

      if (failures.length > 0) {
        throw new Error(
          failures
            .slice(0, 4)
            .join('; ') + (failures.length > 4 ? ` (+${failures.length - 4} more)` : '')
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['sales-order'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedIds([]);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const hasFilters =
    !!filterDateFrom ||
    !!filterDateTo ||
    !!filterStatus ||
    !!filterCustomerId ||
    !!filterWarehouseId ||
    !!filterHasInvoice;

  const clearFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterStatus('');
    setFilterCustomerId('');
    setFilterWarehouseId('');
    setFilterHasInvoice('');
  };

  const togglePageSelected = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !rows.some((r) => r.id === id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...rows.map((r) => r.id)])]);
    }
  };

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Sales orders</h1>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setEditingId(null);
              setCustomerId('');
              setOrderDate(new Date().toISOString().slice(0, 10));
              setWarehouseId('');
              setSalespersonId('');
              setNotes('');
              setHeaderDiscount('0');
              setLines([emptyLine()]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New order
          </button>
        )}
      </div>
      <SalesSubNav />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">From</span>
            <input
              type="date"
              className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">To</span>
            <input
              type="date"
              className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">Status</span>
            <select
              className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="void">Void</option>
            </select>
          </label>
          <label className="block min-w-[12rem] flex-1 text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">Customer</span>
            <Combobox
              className="mt-0.5 w-full max-w-none"
              inputClassName="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={filterCustomerId}
              onChange={setFilterCustomerId}
              options={filterCustomerOptions}
              placeholder="All customers"
              disabled={filterCustomers.isLoading}
              aria-label="Filter by customer"
            />
          </label>
          <label className="block min-w-[10rem] text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">Warehouse</span>
            <Combobox
              className="mt-0.5 w-full max-w-none"
              inputClassName="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={filterWarehouseId}
              onChange={setFilterWarehouseId}
              options={filterWarehouseOptions}
              placeholder="All warehouses"
              disabled={warehouses.isLoading}
              aria-label="Filter by warehouse"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">Invoiced</span>
            <select
              className="mt-0.5 block min-w-[8rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={filterHasInvoice}
              onChange={(e) => setFilterHasInvoice(e.target.value)}
            >
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          {hasFilters && (
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={clearFilters}
            >
              Clear
            </button>
          )}
        </div>
        {canWrite && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected (${selectedDraftIds.length} draft, ${selectedConvertibleIds.length} ready to invoice)`
                : `${total} order${total === 1 ? '' : 's'}`}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-emerald-600/80 hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-45 dark:bg-emerald-600 dark:ring-emerald-500/30 dark:hover:bg-emerald-500"
                disabled={selectedConvertibleIds.length === 0 || bulkConvert.isPending}
                onClick={() => {
                  setError(null);
                  bulkConvert.mutate();
                }}
                title="Create draft invoices for selected confirmed orders"
              >
                Invoice selected (${selectedConvertibleIds.length})
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-indigo-600/80 hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-45 dark:bg-indigo-500 dark:ring-indigo-400/30 dark:hover:bg-indigo-400"
                disabled={selectedDraftIds.length === 0 || bulkAction.isPending}
                onClick={() => {
                  setError(null);
                  bulkAction.mutate('confirm');
                }}
                title="Confirm all selected draft orders"
              >
                Confirm selected ({selectedDraftIds.length})
              </button>
              <button
                type="button"
                className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:pointer-events-none disabled:opacity-45 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                disabled={selectedDraftIds.length === 0 || bulkAction.isPending}
                onClick={() => {
                  if (!window.confirm(`Delete ${selectedDraftIds.length} draft order(s)? This cannot be undone.`)) {
                    return;
                  }
                  setError(null);
                  bulkAction.mutate('delete');
                }}
                title="Delete selected draft orders only"
              >
                Delete selected ({selectedDraftIds.length})
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              {canWrite && (
                <th className="w-10 px-3 py-3 text-left font-medium">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                    }}
                    onChange={togglePageSelected}
                    disabled={rows.length === 0}
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Warehouse</th>
              <th className="px-4 py-3 text-right font-medium">Lines</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Invoice</th>
              <th className="px-4 py-3 text-left font-medium">Salesperson</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const checked = selectedIds.includes(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-t border-slate-100 dark:border-slate-800 ${
                    checked ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''
                  }`}
                >
                  {canWrite && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select order ${r.orderDate}`}
                        className="h-4 w-4 rounded border-slate-300"
                        checked={checked}
                        onChange={() => toggleRowSelected(r.id)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">{r.orderDate}</td>
                  <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {r.customerName ?? '—'}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-slate-600 dark:text-slate-400">
                    {r.warehouseName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {r.lineCount ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        r.status === 'draft'
                          ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                          : r.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                            : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {r.hasInvoice ? (
                      <span className="text-emerald-700 dark:text-emerald-400">Linked</span>
                    ) : r.status === 'confirmed' ? (
                      <span className="text-slate-500">Pending</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-slate-600 dark:text-slate-400">
                    {r.salespersonName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {formatMoney(r.total)}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                        <button
                          type="button"
                          className="text-indigo-600 hover:underline dark:text-indigo-400"
                          onClick={() => {
                            setEditingId(r.id);
                            setError(null);
                            setPanelOpen(true);
                          }}
                        >
                          {r.status === 'draft' ? 'Edit' : 'View'}
                        </button>
                        {r.status === 'draft' && (
                          <button
                            type="button"
                            className="text-amber-700 hover:underline dark:text-amber-400"
                            onClick={() => confirm.mutate(r.id)}
                          >
                            Confirm
                          </button>
                        )}
                        {r.status === 'confirmed' && !r.hasInvoice && (
                          <button
                            type="button"
                            className="text-green-700 hover:underline dark:text-green-400"
                            onClick={() => {
                              setConvertOrderId(r.id);
                              setInvPayment('credit');
                              setConvertOpen(true);
                              setError(null);
                            }}
                          >
                            Invoice
                          </button>
                        )}
                        {r.status === 'confirmed' && r.hasInvoice && (
                          <span
                            className="text-xs text-slate-500 dark:text-slate-400"
                            title="A sales invoice is already linked to this order"
                          >
                            Invoiced
                          </span>
                        )}
                        {r.status === 'draft' && (
                          <button
                            type="button"
                            className="text-red-600 hover:underline dark:text-red-400"
                            onClick={() => del.mutate(r.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {!list.isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={canWrite ? 10 : 8}
                  className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                >
                  {hasFilters ? 'No orders match the current filters.' : 'No sales orders yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? (orderReadOnly ? 'View order' : 'Edit order') : 'New order'}
              </h2>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>
            {orderReadOnly && panelOrder && (
              <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                {panelOrder.status === 'void'
                  ? 'This order is void. Details are read-only.'
                  : panelOrder.hasInvoice
                    ? 'This order is confirmed and already has a linked sales invoice. Details are read-only.'
                    : 'This order is confirmed. Details are read-only; use Invoice on the list to create the linked sales invoice.'}
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Customer</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={customerId}
                  onChange={setCustomerId}
                  options={customerOptions}
                  placeholder="Search customer…"
                  disabled={customers.isLoading || orderReadOnly}
                  aria-label="Customer"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Order date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  disabled={orderReadOnly}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Default warehouse</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouseOptions}
                  placeholder="Search warehouse…"
                  disabled={warehouses.isLoading || orderReadOnly}
                  aria-label="Default warehouse"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Salesperson</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={salespersonId}
                  onChange={setSalespersonId}
                  options={salespersonOptions}
                  placeholder="Search salesperson…"
                  disabled={salespersons.isLoading || orderReadOnly}
                  aria-label="Salesperson"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Invoice-level discount</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={headerDiscount}
                  onChange={(e) => setHeaderDiscount(formatMoneyInput(e.target.value))}
                  onBlur={(e) => setHeaderDiscount(formatMoneyPlain(normalizeMoneyInput(e.target.value)))}
                  disabled={orderReadOnly}
                />
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Notes</span>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={orderReadOnly}
              />
            </label>
            <div className="mt-4 flex justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lines</span>
              {!orderReadOnly && (
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                >
                  + Add line
                </button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-12 sm:items-end">
                  <label className="sm:col-span-4">
                    <span className="text-xs text-slate-500">Product</span>
                    <Combobox
                      className="mt-0.5 w-full max-w-none"
                      inputClassName="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.productId}
                      onChange={(pid) => {
                        const p = products.data?.find((x) => x.id === pid);
                        setLines((prev) => {
                          const next = [...prev];
                          next[idx] = {
                            ...next[idx],
                            productId: pid,
                            unitPrice: p ? formatMoneyPlain(p.sellingPrice) : next[idx].unitPrice,
                          };
                          return next;
                        });
                      }}
                      options={productLineOptions}
                      placeholder="Search product…"
                      disabled={products.isLoading || orderReadOnly}
                      aria-label="Product"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Qty</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums disabled:opacity-60"
                      value={line.quantity}
                      disabled={orderReadOnly}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          const raw = e.target.value;
                          const v = raw === '' ? 0 : Number(raw);
                          n[idx] = { ...n[idx], quantity: Number.isFinite(v) ? v : 0 };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Price</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-60"
                      value={line.unitPrice}
                      disabled={orderReadOnly}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], unitPrice: formatMoneyInput(e.target.value) };
                          return n;
                        })
                      }
                      onBlur={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = {
                            ...n[idx],
                            unitPrice: formatMoneyPlain(normalizeMoneyInput(e.target.value)),
                          };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Line disc.</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-60"
                      value={line.discountAmount}
                      disabled={orderReadOnly}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = {
                            ...n[idx],
                            discountAmount: formatMoneyInput(e.target.value),
                          };
                          return n;
                        })
                      }
                      onBlur={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = {
                            ...n[idx],
                            discountAmount: formatMoneyPlain(normalizeMoneyInput(e.target.value)),
                          };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label className="sm:col-span-1">
                    <span className="text-xs text-slate-500">Tax</span>
                    <Combobox
                      className="mt-0.5 w-full max-w-none"
                      inputClassName="rounded border border-slate-300 px-1 py-1.5 text-xs"
                      value={line.taxProfileId}
                      onChange={(v) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], taxProfileId: v };
                          return n;
                        })
                      }
                      options={taxLineOptions}
                      placeholder="Tax…"
                      disabled={taxProfiles.isLoading || orderReadOnly}
                      aria-label="Line tax profile"
                    />
                  </label>
                  {!orderReadOnly && (
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:underline dark:text-red-400"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="sm:col-span-12">
                    <LineStockInfo
                      productId={line.productId}
                      warehouseId={warehouseId}
                      requestedQuantity={line.quantity}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setPanelOpen(false)}
              >
                {orderReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!orderReadOnly && (
                <button
                  type="button"
                  disabled={save.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => save.mutate()}
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {convertOpen && convertDetail.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create invoice from order</h2>
            <p className="mt-1 text-sm text-slate-600">Set quantity to invoice per line (remaining pre-filled).</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Ship from warehouse</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={invWarehouse}
                  onChange={setInvWarehouse}
                  options={warehouseOptions}
                  placeholder="Search warehouse…"
                  disabled={warehouses.isLoading}
                  aria-label="Ship from warehouse"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Payment</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={invPayment}
                  onChange={(e) => setInvPayment(e.target.value as 'credit' | 'cash' | '')}
                >
                  <option value="">— Select —</option>
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
            </div>
            <ul className="mt-4 space-y-2">
              {invLines.map((il, idx) => {
                const ol = convertDetail.data.lines.find((l) => l.id === il.salesOrderLineId);
                return (
                  <li
                    key={il.salesOrderLineId}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                        {ol?.product ? `${ol.product.sku} — ${ol.product.name}` : ol?.productId ?? il.salesOrderLineId}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right tabular-nums dark:border-slate-600 dark:bg-slate-900"
                        value={il.quantity}
                        onChange={(e) =>
                          setInvLines((prev) => {
                            const n = [...prev];
                            const raw = e.target.value;
                            const v = raw === '' ? 0 : Number(raw);
                            n[idx] = { ...n[idx], quantity: Number.isFinite(v) ? v : 0 };
                            return n;
                          })
                        }
                      />
                    </div>
                    {ol?.productId && (
                      <LineStockInfo
                        productId={ol.productId}
                        warehouseId={invWarehouse}
                        requestedQuantity={il.quantity}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => setConvertOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={doConvert.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => doConvert.mutate()}
              >
                Create draft invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
