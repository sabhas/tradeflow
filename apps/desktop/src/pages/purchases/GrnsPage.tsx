import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GrnInvoiceSettlementBadge, type InvoiceSettlement } from '../../components/GrnInvoiceSettlementBadge';
import { apiFetch } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { PurchaseSubNav } from '../../components/PurchaseSubNav';
import { CUSTOM_OPTION_VALUE, SelectOrCustomInput } from '../../components/SelectOrCustomInput';
import { DatePickerInput } from '../../components/DatePickerInput';
import { formatAmount, parseAmount } from '../../lib/numberFormat';
import { invalidateGrnInvoiceSignals } from '../../lib/purchaseQueryInvalidation';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';

interface GrnRow {
  id: string;
  grnDate: string;
  status: string;
  supplierId: string;
  supplier?: { name: string };
  purchaseOrderId?: string | null;
  invoiceSettlement?: InvoiceSettlement;
  supplierInvoiceId?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceStatus?: string | null;
}

interface GrnDetailLine {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  tradePrice?: string | null;
  retailPrice?: string | null;
  purchaseOrderLineId?: string | null;
  batchCode?: string | null;
  expiryDate?: string | null;
}

interface GrnDetail {
  id: string;
  grnDate: string;
  status: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  warehouseId: string;
  invoiceSettlement?: InvoiceSettlement;
  supplierInvoiceId?: string | null;
  supplierInvoiceNumber?: string | null;
  supplier?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  lines?: GrnDetailLine[];
}

interface EligibleResponse {
  purchaseOrderId: string;
  supplierId: string;
  warehouseId: string;
  lines: Array<{
    purchaseOrderLineId: string;
    productId: string;
    productName?: string;
    batchTracked: boolean;
    expiryTracked: boolean;
    remaining: string;
    unitPrice: string;
  }>;
}

interface BatchBalanceRow {
  productId: string;
  batchCode: string;
  expiryDate?: string | null;
  quantity: string;
  valueAtLayers: string;
  tradePrice?: string;
  retailPrice?: string;
}

type Line = {
  productId: string;
  quantity: number;
  unitPrice: string;
  tradePrice: string;
  retailPrice: string;
  purchaseOrderLineId: string;
  batchCode: string;
  expiryDate: string;
  selectedExistingBatchKey: string;
};

export function GrnsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'purchases.grn:read');
  const canWrite = hasPermission(permissions, 'purchases.grn:write');
  const canPost = hasPermission(permissions, 'purchases.grn:post');
  const canInvoiceWrite = hasPermission(permissions, 'purchases.supplier_invoices:write');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { formatMoney, formatMoneyPlain, formatMoneyInput, normalizeMoneyInput } = useMoneyFormat();

  const moneyForApi = (raw: string) => String(parseAmount(raw));
  const [searchParams, setSearchParams] = useSearchParams();
  const fromPo = searchParams.get('fromPo') || '';
  const invoiceSettlementFilter = searchParams.get('invoiceSettlement') || '';

  const [panelOpen, setPanelOpen] = useState(!!fromPo);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(fromPo || null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [grnDate, setGrnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([
    {
      productId: '',
      quantity: 1,
      unitPrice: '0',
      tradePrice: '',
      retailPrice: '',
      purchaseOrderLineId: '',
      batchCode: '',
      expiryDate: '',
      selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [copiedGrnId, setCopiedGrnId] = useState<string | null>(null);
  const [viewGrnId, setViewGrnId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [postSuccessGrnId, setPostSuccessGrnId] = useState<string | null>(null);

  const listQuery = invoiceSettlementFilter
    ? `?invoiceSettlement=${encodeURIComponent(invoiceSettlementFilter)}`
    : '';
  const list = useQuery({
    queryKey: ['grns', invoiceSettlementFilter],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: GrnRow[] }>(`/grns${listQuery}`).then((r) => r.data),
  });

  const grnDetail = useQuery({
    queryKey: ['grn', viewGrnId],
    enabled: canRead && !!viewGrnId,
    queryFn: () => apiFetch<{ data: GrnDetail }>(`/grns/${viewGrnId}`).then((r) => r.data),
  });

  const editDetail = useQuery({
    queryKey: ['grn', editingId],
    enabled: canRead && panelOpen && !!editingId,
    queryFn: () => apiFetch<{ data: GrnDetail }>(`/grns/${editingId}`).then((r) => r.data),
  });

  const productsForView = useQuery({
    queryKey: ['products', 'grn-view'],
    enabled: canRead && !!viewGrnId,
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; sku: string; name: string }> }>('/products?limit=500&activeOnly=true').then(
        (r) => r.data
      ),
  });

  const productLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productsForView.data ?? []) {
      m.set(p.id, `${p.sku} — ${p.name}`);
    }
    return m;
  }, [productsForView.data]);

  const suppliers = useQuery({
    queryKey: ['suppliers', 'grn-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/suppliers?limit=500').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'grn-dd'],
    enabled: canRead && panelOpen && (!purchaseOrderId || !!editingId),
    queryFn: () =>
      apiFetch<{
        data: Array<{
          id: string;
          sku: string;
          name: string;
          supplierId?: string;
          batchTracked: boolean;
          expiryTracked: boolean;
          costPrice: string;
          sellingPrice: string;
          retailPrice: string;
        }>;
      }>('/products?limit=500&activeOnly=true').then((r) => r.data),
  });

  const productById = useMemo(() => {
    const m = new Map<
      string,
      {
        batchTracked: boolean;
        expiryTracked: boolean;
        name: string;
        costPrice: string;
        sellingPrice: string;
        retailPrice: string;
      }
    >();
    for (const p of products.data ?? []) {
      m.set(p.id, {
        batchTracked: p.batchTracked,
        expiryTracked: p.expiryTracked,
        name: p.name,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        retailPrice: p.retailPrice,
      });
    }
    return m;
  }, [products.data]);

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead && panelOpen,
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; name: string; code: string; isDefault: boolean }> }>('/warehouses').then(
        (r) => r.data
      ),
  });

  const eligible = useQuery({
    queryKey: ['po-grn-eligible', purchaseOrderId],
    enabled: !!purchaseOrderId && panelOpen,
    queryFn: () => apiFetch<{ data: EligibleResponse }>(`/purchase-orders/${purchaseOrderId}/grn-eligible`).then((r) => r.data),
  });
  const batchBalances = useQuery({
    queryKey: ['inventory', 'balances', 'batches', warehouseId],
    enabled: canRead && panelOpen && !!warehouseId,
    queryFn: async () => {
      const query = new URLSearchParams({ warehouseId });
      const res = await apiFetch<{ data: BatchBalanceRow[] }>(`/inventory/balances/batches?${query.toString()}`);
      return res.data;
    },
  });

  const poLinked = !!purchaseOrderId && !!eligible.data;
  const supplierOptions = useMemo(
    () => (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data]
  );
  const warehouseOptions = useMemo(
    () => (warehouses.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    [warehouses.data]
  );
  const productLineOptions = useMemo(() => {
    const all = products.data ?? [];
    const filtered =
      supplierId && all.length > 0 ? all.filter((p) => p.supplierId === supplierId) : all;
    return filtered.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }));
  }, [products.data, supplierId]);
  const existingBatchesByProduct = useMemo(() => {
    const map = new Map<
      string,
      Array<
        BatchBalanceRow & {
          key: string;
          displayCode: string;
          avgUnitCost: string;
        }
      >
    >();
    for (const row of batchBalances.data ?? []) {
      const displayCode = row.batchCode === 'Unspecified' ? '' : row.batchCode;
      const key = `${displayCode}::${row.expiryDate ?? ''}`;
      const qty = Number(row.quantity);
      const val = Number(row.valueAtLayers);
      const avgUnitCost = qty > 0 ? String(val / qty) : '0';
      const list = map.get(row.productId) ?? [];
      list.push({ ...row, key, displayCode, avgUnitCost });
      map.set(row.productId, list);
    }
    return map;
  }, [batchBalances.data]);

  useEffect(() => {
    if (!editDetail.data || !editingId) return;
    const d = editDetail.data;
    setPurchaseOrderId(d.purchaseOrderId ?? null);
    setSupplierId(d.supplierId);
    setWarehouseId(d.warehouseId);
    setGrnDate(d.grnDate);
    setLines(
      (d.lines ?? []).length
        ? (d.lines ?? []).map((l) => ({
            productId: l.productId,
            quantity: parseFloat(l.quantity),
            unitPrice: formatMoneyPlain(l.unitPrice),
            tradePrice: l.tradePrice != null && l.tradePrice !== '' ? formatMoneyPlain(l.tradePrice) : '',
            retailPrice: l.retailPrice != null && l.retailPrice !== '' ? formatMoneyPlain(l.retailPrice) : '',
            purchaseOrderLineId: l.purchaseOrderLineId ?? '',
            batchCode: l.batchCode ?? '',
            expiryDate: l.expiryDate ?? '',
            selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
          }))
        : [
            {
              productId: '',
              quantity: 1,
              unitPrice: '0',
              tradePrice: '',
              retailPrice: '',
              purchaseOrderLineId: '',
              batchCode: '',
              expiryDate: '',
              selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
            },
          ]
    );
  }, [editDetail.data, editingId]);

  useEffect(() => {
    if (!eligible.data || editingId) return;
    setSupplierId(eligible.data.supplierId);
    setWarehouseId(eligible.data.warehouseId);
    if (eligible.data.lines.length) {
      setLines(
        eligible.data.lines.map((l) => ({
          productId: l.productId,
          quantity: parseFloat(l.remaining),
          unitPrice: formatMoneyPlain(l.unitPrice),
          tradePrice: '',
          retailPrice: '',
          purchaseOrderLineId: l.purchaseOrderLineId,
          batchCode: '',
          expiryDate: '',
          selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
        }))
      );
    }
  }, [eligible.data]);

  useEffect(() => {
    if (purchaseOrderId) return;
    if (warehouseId || !warehouses.data?.length) return;
    const defaultWarehouse = warehouses.data.find((w) => w.isDefault);
    setWarehouseId(defaultWarehouse?.id ?? warehouses.data[0].id);
  }, [purchaseOrderId, warehouseId, warehouses.data]);

  useEffect(() => {
    if (!supplierId || purchaseOrderId) return;
    const supplierProducts = new Set(
      (products.data ?? []).filter((p) => p.supplierId === supplierId).map((p) => p.id)
    );
    setLines((prev) =>
      prev.map((line) =>
        line.productId && !supplierProducts.has(line.productId) ? { ...line, productId: '' } : line
      )
    );
  }, [supplierId, purchaseOrderId, products.data]);

  const saveGrn = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId && l.quantity > 0);
      if (!supplierId) throw new Error('Select a supplier');
      if (!warehouseId) throw new Error('Select a warehouse');
      if (cleaned.length === 0) throw new Error('Add at least one line with quantity');
      for (const l of lines) {
        if (!l.productId || l.quantity <= 0) continue;
        const fromPo =
          poLinked && l.purchaseOrderLineId
            ? eligible.data?.lines.find((el) => el.purchaseOrderLineId === l.purchaseOrderLineId)
            : undefined;
        const meta = fromPo
          ? {
              batchTracked: fromPo.batchTracked,
              expiryTracked: fromPo.expiryTracked,
              name: fromPo.productName ?? 'Product',
            }
          : productById.get(l.productId);
        if (!meta) continue;
        if (meta.batchTracked && !l.batchCode.trim()) {
          throw new Error(`Batch is required for "${meta.name}" (batch-tracked product)`);
        }
        if (meta.expiryTracked && !l.expiryDate.trim()) {
          throw new Error(`Expiry date is required for "${meta.name}" (expiry-tracked product)`);
        }
      }
      const payload = {
        purchaseOrderId: purchaseOrderId || null,
        supplierId,
        warehouseId,
        grnDate,
        lines: cleaned.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice.trim() ? moneyForApi(l.unitPrice) : undefined,
          tradePrice: l.tradePrice.trim() ? moneyForApi(l.tradePrice) : undefined,
          retailPrice: l.retailPrice.trim() ? moneyForApi(l.retailPrice) : undefined,
          purchaseOrderLineId: l.purchaseOrderLineId || null,
          batchCode: l.batchCode.trim() ? l.batchCode.trim() : null,
          expiryDate: l.expiryDate.trim() ? l.expiryDate : null,
        })),
      };
      if (editingId) {
        await apiFetch(`/grns/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/grns', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grns'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (editingId) qc.invalidateQueries({ queryKey: ['grn', editingId] });
      setPanelOpen(false);
      setEditingId(null);
      setPurchaseOrderId(null);
      setSearchParams({});
    },
    onError: (e: Error) => setError(e.message),
  });

  const openEditDraft = (id: string) => {
    setViewGrnId(null);
    setEditingId(id);
    setError(null);
    setPanelOpen(true);
  };

  const postGrn = useMutation({
    mutationFn: (id: string) => apiFetch(`/grns/${id}/post`, { method: 'POST', body: '{}' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['grns'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      invalidateGrnInvoiceSignals(qc);
      setPostSuccessGrnId(id);
    },
    onError: (e: Error) => setError(e.message),
  });

  const createInvoiceDraft = useMutation({
    mutationFn: (grnId: string) =>
      apiFetch<{ data: { supplierInvoiceId: string } }>(`/grns/${grnId}/create-supplier-invoice-draft`, {
        method: 'POST',
        body: '{}',
      }).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      invalidateGrnInvoiceSignals(qc);
      setPostSuccessGrnId(null);
      setViewGrnId(null);
      navigate(`/purchases/invoices?edit=${data.supplierInvoiceId}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Goods receipt (GRN)</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Two-step purchase receipt: post the GRN to bring stock in, then create and post a supplier invoice to record payable and clear accrued
            purchases.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => {
              setViewGrnId(null);
              setEditingId(null);
              setPurchaseOrderId(null);
              setSupplierId('');
              setGrnDate(new Date().toISOString().slice(0, 10));
              setLines([
                {
                  productId: '',
                  quantity: 1,
                  unitPrice: '0',
                  tradePrice: '',
                  retailPrice: '',
                  purchaseOrderLineId: '',
                  batchCode: '',
                  expiryDate: '',
                  selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
                },
              ]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New GRN
          </button>
        )}
      </div>
      <PurchaseSubNav />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-400">Supplier invoice:</span>
        {[
          { value: '', label: 'All' },
          { value: 'awaiting_invoice', label: 'Awaiting invoice' },
          { value: 'invoice_draft', label: 'Draft invoice' },
        ].map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              invoiceSettlementFilter === f.value
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (f.value) next.set('invoiceSettlement', f.value);
              else next.delete('invoiceSettlement');
              setSearchParams(next);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {postSuccessGrnId && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Stock posted successfully</p>
          <p className="mt-1">
            Create a supplier invoice to record the supplier bill, move the amount to accounts payable, and clear accrued purchases.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canInvoiceWrite && (
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                disabled={createInvoiceDraft.isPending}
                onClick={() => createInvoiceDraft.mutate(postSuccessGrnId)}
              >
                Create draft supplier invoice
              </button>
            )}
            <Link
              to={`/purchases/invoices?grnId=${postSuccessGrnId}`}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100/80 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-slate-800"
            >
              Open supplier invoices
            </Link>
            <button
              type="button"
              className="px-2 py-1.5 text-xs text-amber-800 hover:underline dark:text-amber-200"
              onClick={() => setPostSuccessGrnId(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {fromPo && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Prefilled from purchase order — adjust received quantities, then save draft and post.
        </div>
      )}

      {!panelOpen && error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Supplier invoice</th>
              <th className="px-4 py-3 text-right font-medium">GRN id</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3">{r.grnDate}</td>
                <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
                <td className="px-4 py-3">
                  <GrnInvoiceSettlementBadge settlement={r.invoiceSettlement ?? 'not_applicable'} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    title={r.id}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(r.id);
                        setCopiedGrnId(r.id);
                        window.setTimeout(() => setCopiedGrnId((cur) => (cur === r.id ? null : cur)), 2000);
                      } catch {
                        setError('Could not copy GRN id to clipboard');
                      }
                    }}
                  >
                    {copiedGrnId === r.id ? 'Copied' : 'Copy id'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-indigo-600 hover:underline"
                    onClick={() => setViewGrnId(r.id)}
                  >
                    View
                  </button>
                  {canWrite && r.status === 'draft' && (
                    <button
                      type="button"
                      className="ml-3 text-indigo-600 hover:underline"
                      onClick={() => openEditDraft(r.id)}
                    >
                      Edit
                    </button>
                  )}
                  {canPost && r.status === 'draft' && (
                    <button
                      type="button"
                      className="ml-3 font-medium text-emerald-700 hover:underline"
                      onClick={() => postGrn.mutate(r.id)}
                    >
                      Post to stock
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading && <p className="p-4 text-slate-500">Loading…</p>}
      </div>

      {viewGrnId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Goods receipt (GRN)</h2>
                <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{viewGrnId}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                onClick={() => setViewGrnId(null)}
              >
                ×
              </button>
            </div>
            {grnDetail.isLoading && <p className="mt-6 text-slate-500">Loading…</p>}
            {grnDetail.isError && (
              <p className="mt-6 text-sm text-red-700">Could not load this GRN. Check permissions or try again.</p>
            )}
            {grnDetail.data && (
              <div className="mt-6 space-y-6">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Supplier</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{grnDetail.data.supplier?.name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Warehouse</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{grnDetail.data.warehouse?.name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Receipt date</dt>
                    <dd className="font-medium text-slate-900 dark:text-slate-100">{grnDetail.data.grnDate}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                    <dd className="capitalize font-medium text-slate-900 dark:text-slate-100">{grnDetail.data.status}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Supplier invoice</dt>
                    <dd className="mt-0.5">
                      <GrnInvoiceSettlementBadge
                        settlement={grnDetail.data.invoiceSettlement ?? 'not_applicable'}
                      />
                      {grnDetail.data.supplierInvoiceNumber && (
                        <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">
                          {grnDetail.data.supplierInvoiceNumber}
                        </span>
                      )}
                    </dd>
                  </div>
                  {grnDetail.data.purchaseOrderId && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500 dark:text-slate-400">Purchase order</dt>
                      <dd className="font-mono text-xs text-slate-800 dark:text-slate-200">{grnDetail.data.purchaseOrderId}</dd>
                    </div>
                  )}
                </dl>
                <div>
                  <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Lines</h3>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-950">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Product</th>
                          <th className="px-3 py-2 text-right font-medium">Qty</th>
                          <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                          <th className="px-3 py-2 text-left font-medium">Batch</th>
                          <th className="px-3 py-2 text-left font-medium">Expiry</th>
                          <th className="px-3 py-2 text-right font-medium">Trade</th>
                          <th className="px-3 py-2 text-right font-medium">Retail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(grnDetail.data.lines ?? []).map((line) => (
                          <tr key={line.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                              {productLabelById.get(line.productId) ?? (
                                <span className="font-mono text-xs text-slate-500">{line.productId}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatAmount(line.quantity, 4)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.unitPrice)}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{line.batchCode ?? '—'}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{line.expiryDate ?? '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                              {line.tradePrice != null && line.tradePrice !== '' ? formatMoney(line.tradePrice) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                              {line.retailPrice != null && line.retailPrice !== '' ? formatMoney(line.retailPrice) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(grnDetail.data.lines ?? []).length === 0 && (
                      <p className="px-3 py-4 text-center text-slate-500">No lines on this GRN.</p>
                    )}
                  </div>
                </div>
                {grnDetail.data.status === 'posted' &&
                  grnDetail.data.invoiceSettlement !== 'invoice_posted' && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
                      <p className="font-medium">Supplier invoice required</p>
                      <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
                        Post a supplier invoice linked to this GRN to clear accrued purchases and record accounts payable.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canInvoiceWrite &&
                          (grnDetail.data.invoiceSettlement === 'awaiting_invoice' ? (
                            <button
                              type="button"
                              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                              disabled={createInvoiceDraft.isPending}
                              onClick={() => createInvoiceDraft.mutate(grnDetail.data!.id)}
                            >
                              Create draft supplier invoice
                            </button>
                          ) : grnDetail.data.supplierInvoiceId ? (
                            <Link
                              to={`/purchases/invoices?edit=${grnDetail.data.supplierInvoiceId}`}
                              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                            >
                              Edit draft invoice
                            </Link>
                          ) : null)}
                        <Link
                          to={`/purchases/invoices?grnId=${grnDetail.data.id}`}
                          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100/80 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/50"
                        >
                          Open supplier invoices
                        </Link>
                      </div>
                    </div>
                  )}
                <div className="flex flex-wrap justify-end gap-2">
                  {canWrite && grnDetail.data.status === 'draft' && (
                    <button
                      type="button"
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                      onClick={() => openEditDraft(grnDetail.data!.id)}
                    >
                      Edit draft
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(grnDetail.data!.id);
                        setCopiedGrnId(grnDetail.data!.id);
                        window.setTimeout(() => setCopiedGrnId((cur) => (cur === grnDetail.data!.id ? null : cur)), 2000);
                      } catch {
                        setError('Could not copy GRN id to clipboard');
                      }
                    }}
                  >
                    {copiedGrnId === grnDetail.data.id ? 'Copied id' : 'Copy GRN id'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => setViewGrnId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit goods receipt' : 'New goods receipt'}
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                onClick={() => {
                  setPanelOpen(false);
                  setEditingId(null);
                  setError(null);
                }}
              >
                ×
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">Tip:</span>
              <span>Link from a purchase order to pre-fill lines, or create a standalone receipt for a supplier.</span>
            </div>
            {editDetail.isLoading && editingId && (
              <p className="mt-4 text-sm text-slate-500">Loading draft…</p>
            )}
            {error && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Purchase order (optional)</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                  placeholder="Paste PO id or use Receive link from orders list"
                  value={purchaseOrderId ?? ''}
                  onChange={(e) => setPurchaseOrderId(e.target.value || null)}
                  disabled={!!fromPo || !!editingId}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Supplier</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions}
                  placeholder="Search supplier…"
                  disabled={poLinked || suppliers.isLoading}
                  aria-label="Supplier"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Warehouse</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouseOptions}
                  placeholder="Search warehouse…"
                  disabled={poLinked || warehouses.isLoading}
                  aria-label="Warehouse"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">Receipt date</span>
                <DatePickerInput
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={grnDate}
                  onChange={(e) => setGrnDate(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lines</span>
              {!purchaseOrderId && (
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:underline"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      {
                        productId: '',
                        quantity: 1,
                        unitPrice: '0',
                        tradePrice: '',
                        retailPrice: '',
                        purchaseOrderLineId: '',
                        batchCode: '',
                        expiryDate: '',
                        selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
                      },
                    ])
                  }
                >
                  + Add line
                </button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {lines.map((line, idx) => {
                const poLine =
                  purchaseOrderId && line.purchaseOrderLineId
                    ? eligible.data?.lines.find((el) => el.purchaseOrderLineId === line.purchaseOrderLineId)
                    : purchaseOrderId
                      ? eligible.data?.lines[idx]
                      : undefined;
                const poProductName =
                  poLine?.productName ??
                  (line.productId ? productById.get(line.productId)?.name : undefined);
                const manualProduct = line.productId ? productById.get(line.productId) : undefined;
                const batchRequired = poLine?.batchTracked ?? manualProduct?.batchTracked ?? false;
                const expiryRequired = poLine?.expiryTracked ?? manualProduct?.expiryTracked ?? false;
                const batchOptions = line.productId ? existingBatchesByProduct.get(line.productId) ?? [] : [];
                const selectedExistingBatch = line.selectedExistingBatchKey
                  ? batchOptions.find((b) => b.key === line.selectedExistingBatchKey)
                  : undefined;
                const lockBatchDerivedFields = !!selectedExistingBatch;
                const batchDerivedLockInputClass =
                  'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 dark:disabled:border-slate-600 dark:disabled:bg-slate-950/80 dark:disabled:text-slate-400';
                return (
                <div
                  key={idx}
                  className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <div className="grid gap-2 sm:grid-cols-12 sm:items-end">
                  <label className="flex flex-col gap-0.5 sm:col-span-5">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Product</span>
                    {!supplierId && (
                      <span className="text-[11px] font-medium text-amber-800 dark:text-amber-400">
                        Select supplier first to choose a product.
                      </span>
                    )}
                    {purchaseOrderId && poProductName ? (
                      <div className="mt-0.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950">
                        {poProductName}
                      </div>
                    ) : (
                      <Combobox
                        className="mt-0.5 w-full max-w-none"
                        inputClassName="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={line.productId}
                        onChange={(v) =>
                          setLines((prev) => {
                            const n = [...prev];
                            const p = v ? productById.get(v) : undefined;
                            n[idx] = {
                              ...n[idx],
                              productId: v,
                              unitPrice: p ? formatMoneyPlain(p.costPrice) : n[idx].unitPrice,
                              tradePrice: p ? formatMoneyPlain(p.sellingPrice) : n[idx].tradePrice,
                              retailPrice: p ? formatMoneyPlain(p.retailPrice) : n[idx].retailPrice,
                              batchCode: '',
                              expiryDate: '',
                              selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
                            };
                            return n;
                          })
                        }
                        options={productLineOptions}
                        placeholder="Search product…"
                        disabled={products.isLoading}
                        aria-label="Product"
                      />
                    )}
                  </label>
                  <label className="sm:col-span-4">
                    <span className="text-xs text-slate-500">
                      Batch{batchRequired ? <span className="text-amber-700 dark:text-amber-400"> *</span> : ' (optional)'}
                    </span>
                    <SelectOrCustomInput
                      className="mt-0.5"
                      options={batchOptions.map((b) => ({ value: b.key, label: b.displayCode || 'Unspecified' }))}
                      value={
                        batchOptions.some((b) => b.key === line.selectedExistingBatchKey)
                          ? line.selectedExistingBatchKey
                          : line.batchCode
                      }
                      onChange={(value) =>
                        setLines((prev) => {
                          const n = [...prev];
                          const selected = batchOptions.find((b) => b.key === value);
                          if (selected) {
                            n[idx] = {
                              ...n[idx],
                              selectedExistingBatchKey: selected.key,
                              batchCode: selected.displayCode,
                              expiryDate: selected.expiryDate ? String(selected.expiryDate).slice(0, 10) : '',
                              unitPrice: formatMoneyPlain(selected.avgUnitCost),
                              tradePrice: formatMoneyPlain((selected.tradePrice ?? n[idx].tradePrice) || '0'),
                              retailPrice: formatMoneyPlain((selected.retailPrice ?? n[idx].retailPrice) || '0'),
                            };
                            return n;
                          }
                          const p = n[idx].productId ? productById.get(n[idx].productId) : undefined;
                          const wasLocked = batchOptions.some((b) => b.key === n[idx].selectedExistingBatchKey);
                          n[idx] = {
                            ...n[idx],
                            batchCode: value,
                            selectedExistingBatchKey: CUSTOM_OPTION_VALUE,
                            unitPrice:
                              (wasLocked || !n[idx].unitPrice.trim()) && p ? formatMoneyPlain(p.costPrice) : n[idx].unitPrice,
                            tradePrice:
                              (wasLocked || !n[idx].tradePrice.trim()) && p
                                ? formatMoneyPlain(p.sellingPrice)
                                : n[idx].tradePrice,
                            retailPrice:
                              (wasLocked || !n[idx].retailPrice.trim()) && p
                                ? formatMoneyPlain(p.retailPrice)
                                : n[idx].retailPrice,
                            expiryDate: wasLocked ? '' : n[idx].expiryDate,
                          };
                          return n;
                        })
                      }
                      placeholder="Select existing or type new batch…"
                      createOptionLabel={(query) => `Add "${query}" as new batch`}
                      disabled={!line.productId}
                      aria-label="Batch code"
                    />
                  </label>
                  <label className="sm:col-span-3">
                    <span className="text-xs text-slate-500">Qty received</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums"
                      value={line.quantity}
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
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label>
                    <span className="text-xs text-slate-500">Unit cost</span>
                    <input
                      className={`mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm ${batchDerivedLockInputClass}`}
                      value={line.unitPrice}
                      disabled={lockBatchDerivedFields}
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
                  <label>
                    <span className="text-xs text-slate-500">Trade price (batch)</span>
                    <input
                      className={`mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm ${batchDerivedLockInputClass}`}
                      value={line.tradePrice}
                      disabled={lockBatchDerivedFields}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], tradePrice: formatMoneyInput(e.target.value) };
                          return n;
                        })
                      }
                      onBlur={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = {
                            ...n[idx],
                            tradePrice: formatMoneyPlain(normalizeMoneyInput(e.target.value)),
                          };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs text-slate-500">Retail price (batch)</span>
                    <input
                      className={`mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm ${batchDerivedLockInputClass}`}
                      value={line.retailPrice}
                      disabled={lockBatchDerivedFields}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], retailPrice: formatMoneyInput(e.target.value) };
                          return n;
                        })
                      }
                      onBlur={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = {
                            ...n[idx],
                            retailPrice: formatMoneyPlain(normalizeMoneyInput(e.target.value)),
                          };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs text-slate-500">
                      Expiry{expiryRequired ? <span className="text-amber-700 dark:text-amber-400"> *</span> : ' (optional)'}
                    </span>
                    <DatePickerInput
                      className={`mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm ${batchDerivedLockInputClass}`}
                      value={line.expiryDate}
                      required={expiryRequired}
                      disabled={lockBatchDerivedFields}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], expiryDate: e.target.value };
                          return n;
                        })
                      }
                    />
                  </label>
                  </div>
                  {selectedExistingBatch && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Existing batch selected. Expiry and price fields are locked to current batch values.
                    </p>
                  )}
                </div>
              );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => {
                  setPanelOpen(false);
                  setEditingId(null);
                  setSearchParams({});
                  setError(null);
                }}
              >
                Cancel
              </button>
              {canWrite && (
                <button
                  type="button"
                  disabled={saveGrn.isPending || (!!editingId && editDetail.isLoading)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => saveGrn.mutate()}
                >
                  {editingId ? 'Update draft GRN' : 'Save draft GRN'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
