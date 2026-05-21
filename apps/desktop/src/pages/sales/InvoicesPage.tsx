import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  apiFetchData,
  downloadAuthenticatedFile,
  openAuthenticatedPrintPost,
  openAuthenticatedRoute,
} from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { DatePickerInput } from '../../components/DatePickerInput';
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
  batchTracked?: boolean;
  expiryTracked?: boolean;
}
interface TaxOpt {
  id: string;
  name: string;
}
interface InvRow {
  id: string;
  customerId: string;
  customerName: string | null;
  invoiceDate: string;
  dueDate: string;
  status: string;
  paymentType: string;
  documentKind?: string;
  total: string;
}

const PAGE_SIZE = 50;

type Line = {
  productId: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  taxProfileId: string;
  originalInvoiceLineId: string;
  batchCode: string;
  expiryDate: string;
  maxReturnQty?: number;
};

const emptyLine = (): Line => ({
  productId: '',
  quantity: 1,
  unitPrice: '0',
  discountAmount: '0',
  taxProfileId: '',
  originalInvoiceLineId: '',
  batchCode: '',
  expiryDate: '',
});

export function InvoicesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'sales:read');
  const canWrite = hasPermission(permissions, 'sales:create') || hasPermission(permissions, 'sales:update');
  const canPost = hasPermission(permissions, 'sales:post');
  const canPickTemplate = hasPermission(permissions, 'settings:read');
  const qc = useQueryClient();
  const { formatMoney, formatMoneyInput } = useMoneyFormat();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [paymentType, setPaymentType] = useState<'credit' | 'cash' | ''>('credit');
  const [warehouseId, setWarehouseId] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [notes, setNotes] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState('0');
  const [invoiceTemplateId, setInvoiceTemplateId] = useState('');
  const [documentKind, setDocumentKind] = useState<'invoice' | 'credit_note'>('invoice');
  const [originalInvoiceId, setOriginalInvoiceId] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);

  const filterQueryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filterDateFrom) p.set('dateFrom', filterDateFrom);
    if (filterDateTo) p.set('dateTo', filterDateTo);
    if (filterStatus) p.set('status', filterStatus);
    if (filterCustomerId) p.set('customerId', filterCustomerId);
    return p.toString();
  }, [filterDateFrom, filterDateTo, filterStatus, filterCustomerId]);

  useEffect(() => {
    setPage(0);
  }, [filterQueryString]);

  const offset = page * PAGE_SIZE;
  const list = useQuery({
    queryKey: ['invoices', filterQueryString, page],
    enabled: canRead,
    queryFn: () => {
      const params = new URLSearchParams(filterQueryString);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      return apiFetch<{ data: InvRow[]; meta: { total: number; limit: number; offset: number } }>(
        `/invoices?${params.toString()}`
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
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.includes(r.id)), [rows, selectedIds]);
  const selectedDraftRows = useMemo(() => selectedRows.filter((r) => r.status === 'draft'), [selectedRows]);
  const selectedPostedRows = useMemo(() => selectedRows.filter((r) => r.status === 'posted'), [selectedRows]);

  const filterCustomers = useQuery({
    queryKey: ['customers', 'inv-filter'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: CustomerOpt[] }>('/customers?limit=500').then((r) => r.data),
  });
  const filterCustomerOptions = useMemo(
    () => [
      { value: '', label: 'All customers' },
      ...(filterCustomers.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [filterCustomers.data]
  );

  const detail = useQuery({
    queryKey: ['invoice', editingId],
    enabled: !!editingId && panelOpen,
    queryFn: () =>
      apiFetch<{
        data: InvRow & {
          dueDate: string;
          warehouseId: string;
          documentKind?: string;
          originalInvoiceId?: string | null;
          lines: Array<{
            id: string;
            productId: string;
            quantity: string;
            unitPrice: string;
            discountAmount: string;
            taxProfileId?: string | null;
            originalInvoiceLineId?: string | null;
            batchCode?: string | null;
            expiryDate?: string | null;
          }>;
          notes?: string;
          discountAmount: string;
          salespersonId?: string | null;
          invoiceTemplateId?: string | null;
        };
      }>(`/invoices/${editingId}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!detail.data || !editingId) return;
    const d = detail.data;
    setCustomerId(d.customerId);
    setInvoiceDate(d.invoiceDate);
    setDueDate(d.dueDate);
    setPaymentType(d.paymentType as 'credit' | 'cash');
    setWarehouseId(d.warehouseId);
    setSalespersonId(d.salespersonId ?? '');
    setNotes(d.notes ?? '');
    setHeaderDiscount(d.discountAmount);
    setInvoiceTemplateId(d.invoiceTemplateId ?? '');
    setDocumentKind((d.documentKind as 'invoice' | 'credit_note') ?? 'invoice');
    setOriginalInvoiceId(d.originalInvoiceId ?? '');
    setLines(
      (d.lines || []).length
        ? d.lines.map((l) => ({
            productId: l.productId,
            quantity: parseFloat(l.quantity),
            unitPrice: l.unitPrice,
            discountAmount: l.discountAmount,
            taxProfileId: l.taxProfileId ?? '',
            originalInvoiceLineId:
              (d.documentKind ?? 'invoice') === 'credit_note' ? l.originalInvoiceLineId ?? '' : '',
            batchCode: l.batchCode ?? '',
            expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : '',
            maxReturnQty:
              (d.documentKind ?? 'invoice') === 'credit_note' ? parseFloat(l.quantity) : undefined,
          }))
        : [emptyLine()]
    );
  }, [detail.data, editingId]);

  const postedForCredit = useQuery({
    queryKey: ['invoices', 'credit-source', customerId],
    enabled: !!customerId && panelOpen && !editingId && documentKind === 'credit_note',
    queryFn: () => {
      const q = new URLSearchParams({
        customerId,
        status: 'posted',
        documentKind: 'invoice',
        limit: '100',
      });
      return apiFetch<{ data: InvRow[] }>(`/invoices?${q}`).then((r) => r.data);
    },
  });

  const applyCreditSourceInvoice = async (invoiceId: string) => {
    if (!invoiceId) {
      setOriginalInvoiceId('');
      setLines([emptyLine()]);
      return;
    }
    const { data } = await apiFetch<{
      data: {
        warehouseId: string;
        lines: Array<{
          id: string;
          productId: string;
          quantity: string;
          unitPrice: string;
          discountAmount: string;
          taxProfileId?: string | null;
          batchCode?: string | null;
          expiryDate?: string | null;
        }>;
      };
    }>(`/invoices/${invoiceId}`);
    setOriginalInvoiceId(invoiceId);
    setWarehouseId(data.warehouseId);
    setLines(
      data.lines.map((l) => ({
        productId: l.productId,
        quantity: parseFloat(l.quantity),
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        taxProfileId: l.taxProfileId ?? '',
        originalInvoiceLineId: l.id,
        batchCode: l.batchCode ?? '',
        expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : '',
        maxReturnQty: parseFloat(l.quantity),
      }))
    );
  };

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

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetchData<Array<{ id: string; name: string; isDefault?: boolean }>>('/warehouses'),
  });

  useEffect(() => {
    if (!panelOpen || editingId) return;
    if (warehouseId || !warehouses.data?.length) return;
    const defaultWarehouse = warehouses.data.find((w) => w.isDefault);
    setWarehouseId(defaultWarehouse?.id ?? warehouses.data[0].id);
  }, [panelOpen, editingId, warehouseId, warehouses.data]);

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetchData<TaxOpt[]>('/tax-profiles'),
  });

  const salespersons = useQuery({
    queryKey: ['salespersons', 'inv-panel'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/salespersons').then((r) => r.data),
  });

  const invoiceTemplates = useQuery({
    queryKey: ['invoice-templates'],
    enabled: canRead && panelOpen && canPickTemplate,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/invoice-templates').then((r) => r.data),
  });

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
  const invoiceTemplateOptions = useMemo(
    () => [
      ...(invoiceTemplates.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ],
    [invoiceTemplates.data]
  );
  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
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

  const barcodeLookup = useMutation({
    mutationFn: async (code: string) => {
      const data = await apiFetch<{ data: ProductOpt }>(`/products/lookup/barcode/${encodeURIComponent(code)}`).then(
        (r) => r.data
      );
      return data;
    },
    onSuccess: (data) => {
      setLines((prev) => {
        const last = prev[prev.length - 1];
        if (prev.length && !last.productId) {
          const next = [...prev];
          next[next.length - 1] = {
            productId: data.id,
            quantity: 1,
            unitPrice: data.sellingPrice,
            discountAmount: '0',
            taxProfileId: '',
            originalInvoiceLineId: '',
            batchCode: '',
            expiryDate: '',
          };
          return next;
        }
        return [
          ...prev,
          {
            productId: data.id,
            quantity: 1,
            unitPrice: data.sellingPrice,
            discountAmount: '0',
            taxProfileId: '',
            originalInvoiceLineId: '',
            batchCode: '',
            expiryDate: '',
          },
        ];
      });
      setBarcode('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId);
      if (!customerId) throw new Error('Select a customer');
      if (!warehouseId) throw new Error('Select a warehouse');
      if (!paymentType) throw new Error('Select a payment type');
      if (cleaned.length === 0) throw new Error('Add at least one line');
      if (documentKind === 'credit_note') {
        if (!originalInvoiceId) throw new Error('Select the posted invoice you are crediting');
        if (cleaned.some((l) => !l.originalInvoiceLineId)) {
          throw new Error('Each line must be linked to an original invoice line');
        }
        for (const l of cleaned.filter((line) => line.quantity > 0)) {
          if (l.maxReturnQty != null && l.quantity > l.maxReturnQty + 1e-6) {
            const name = productById.get(l.productId)?.name ?? 'Product';
            throw new Error(`Return quantity for "${name}" cannot exceed ${l.maxReturnQty} sold on the invoice`);
          }
        }
      }
      const payload: Record<string, unknown> = {
        customerId,
        invoiceDate,
        dueDate: dueDate || null,
        paymentType,
        warehouseId,
        salespersonId: salespersonId || null,
        notes: notes || null,
        discountAmount: headerDiscount,
        lines: cleaned.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice.trim() ? l.unitPrice : undefined,
          discountAmount: l.discountAmount || '0',
          taxProfileId: l.taxProfileId || null,
          originalInvoiceLineId:
            documentKind === 'credit_note' && l.originalInvoiceLineId ? l.originalInvoiceLineId : null,
          batchCode:
            documentKind === 'credit_note' && l.batchCode.trim() ? l.batchCode.trim() : null,
          expiryDate:
            documentKind === 'credit_note' && l.expiryDate.trim() ? l.expiryDate.trim() : null,
        })),
      };
      if (canPickTemplate) {
        payload.invoiceTemplateId = invoiceTemplateId || null;
      }
      if (documentKind === 'credit_note') {
        payload.documentKind = 'credit_note';
        payload.originalInvoiceId = originalInvoiceId;
      }
      if (editingId) {
        await apiFetch(`/invoices/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/invoices', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setPanelOpen(false);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const postInv = useMutation({
    mutationFn: (id: string) => apiFetch(`/invoices/${id}/post`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const bulkMutate = useMutation({
    mutationFn: async ({ action, ids }: { action: 'post' | 'delete'; ids: string[] }) => {
      const failures: string[] = [];
      let completed = 0;
      for (const id of ids) {
        try {
          if (action === 'post') {
            await apiFetch(`/invoices/${id}/post`, { method: 'POST', body: '{}' });
          } else {
            await apiFetch(`/invoices/${id}`, { method: 'DELETE' });
          }
          completed += 1;
        } catch {
          failures.push(id);
        }
      }
      return { completed, failures };
    },
    onSuccess: ({ completed, failures }, vars) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedIds((prev) => prev.filter((id) => failures.includes(id)));
      if (failures.length) {
        setBulkActionError(
          `${vars.action === 'post' ? 'Posting' : 'Deleting'} completed for ${completed}/${vars.ids.length} invoices. ${
            failures.length
          } failed and stayed selected.`
        );
      } else {
        setBulkActionError(null);
      }
    },
    onError: (e: Error) => setBulkActionError(e.message),
  });

  const printOne = (id: string) =>
    openAuthenticatedRoute(`/invoices/${id}/pdf`).catch((e: Error) => setError(e.message));

  const printSelected = () => {
    if (selectedIds.length === 0) return;
    setError(null);
    openAuthenticatedPrintPost('/invoices/print-batch', { mode: 'ids', ids: selectedIds }).catch(
      (e: Error) => setError(e.message)
    );
  };

  const runBulkPost = () => {
    if (selectedDraftRows.length === 0) return;
    setError(null);
    setBulkActionError(null);
    bulkMutate.mutate({ action: 'post', ids: selectedDraftRows.map((r) => r.id) });
  };

  const runBulkDelete = () => {
    if (selectedDraftRows.length === 0) return;
    const okDelete = window.confirm(
      `Delete ${selectedDraftRows.length} selected draft invoice${
        selectedDraftRows.length === 1 ? '' : 's'
      }? This action cannot be undone.`
    );
    if (!okDelete) return;
    setError(null);
    setBulkActionError(null);
    bulkMutate.mutate({ action: 'delete', ids: selectedDraftRows.map((r) => r.id) });
  };

  const bulkPrintBtnClass =
    'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-45 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800';
  const bulkPostBtnClass =
    'rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-indigo-600/80 transition-colors hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-45 dark:bg-indigo-500 dark:ring-indigo-400/30 dark:hover:bg-indigo-400';
  const bulkDeleteBtnClass =
    'rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-45 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40';
  const subtleActionBtnClass =
    'inline-flex rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800';

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const togglePageSelected = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !rows.some((r) => r.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...rows.map((r) => r.id)])));
    }
  };
  const clearFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterStatus('');
    setFilterCustomerId('');
  };
  const hasFilters =
    !!filterDateFrom || !!filterDateTo || !!filterStatus || !!filterCustomerId;

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Invoices</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRead && (
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={() =>
                downloadAuthenticatedFile('/export/invoices', 'invoices-export.xlsx').catch((e: Error) =>
                  alert(e.message)
                )
              }
            >
              Export Excel
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              onClick={() => {
                setEditingId(null);
                setDocumentKind('invoice');
                setOriginalInvoiceId('');
                setCustomerId('');
                setInvoiceDate(new Date().toISOString().slice(0, 10));
                setDueDate('');
                setPaymentType('credit');
                setWarehouseId('');
                setNotes('');
                setHeaderDiscount('0');
                setSalespersonId('');
                setInvoiceTemplateId('');
                setLines([emptyLine()]);
                setError(null);
                setPanelOpen(true);
              }}
            >
              New invoice
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-indigo-950/40"
              onClick={() => {
                setEditingId(null);
                setDocumentKind('credit_note');
                setOriginalInvoiceId('');
                setCustomerId('');
                setInvoiceDate(new Date().toISOString().slice(0, 10));
                setDueDate('');
                setPaymentType('credit');
                setWarehouseId('');
                setNotes('');
                setHeaderDiscount('0');
                setSalespersonId('');
                setInvoiceTemplateId('');
                setLines([emptyLine()]);
                setError(null);
                setPanelOpen(true);
              }}
            >
              New credit note
            </button>
          )}
        </div>
      </div>
      <SalesSubNav />

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      {bulkActionError && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {bulkActionError}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">From</span>
            <DatePickerInput
              className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500 dark:text-slate-400">To</span>
            <DatePickerInput
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
              <option value="posted">Posted</option>
            </select>
          </label>
          <label className="block min-w-[14rem] flex-1 text-sm">
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {selectedIds.length > 0
              ? `${selectedIds.length} selected`
              : `${total} invoice${total === 1 ? '' : 's'}`}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={bulkPrintBtnClass}
              disabled={selectedIds.length === 0}
              onClick={printSelected}
              title="Open one print dialog with all selected invoices"
            >
              Print selected ({selectedIds.length})
            </button>
            {canPost && (
              <button
                type="button"
                className={bulkPostBtnClass}
                disabled={selectedDraftRows.length === 0 || bulkMutate.isPending}
                onClick={runBulkPost}
                title={
                  selectedPostedRows.length
                    ? `Only draft invoices can be posted. ${selectedPostedRows.length} posted invoice${
                        selectedPostedRows.length === 1 ? ' is' : 's are'
                      } ignored.`
                    : 'Post all selected draft invoices'
                }
              >
                Post selected drafts ({selectedDraftRows.length})
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                className={bulkDeleteBtnClass}
                disabled={selectedDraftRows.length === 0 || bulkMutate.isPending}
                onClick={runBulkDelete}
                title={
                  selectedPostedRows.length
                    ? `Only draft invoices can be deleted. ${selectedPostedRows.length} posted invoice${
                        selectedPostedRows.length === 1 ? ' is' : 's are'
                      } ignored.`
                    : 'Delete all selected draft invoices'
                }
              >
                Delete selected drafts ({selectedDraftRows.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
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
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Customer</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Pay</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
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
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select invoice from ${r.invoiceDate}`}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={checked}
                      onChange={() => toggleRowSelected(r.id)}
                    />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.invoiceDate}</td>
                  <td className="px-4 py-3">{r.customerName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {r.documentKind === 'credit_note' ? 'Credit note' : 'Invoice'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        r.status === 'posted'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.paymentType}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.total)}</td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && r.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          className={`${subtleActionBtnClass} text-indigo-600`}
                          onClick={() => {
                            setEditingId(r.id);
                            setError(null);
                            setPanelOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`ml-1 ${subtleActionBtnClass} text-red-600`}
                          onClick={() => del.mutate(r.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {canPost && r.status === 'draft' && (
                      <button
                        type="button"
                        className={`ml-1 ${subtleActionBtnClass} text-green-700`}
                        onClick={() => postInv.mutate(r.id)}
                      >
                        Post
                      </button>
                    )}
                    <button
                      type="button"
                      className={`ml-1 ${subtleActionBtnClass} text-slate-600`}
                      onClick={() => printOne(r.id)}
                    >
                      Print
                    </button>
                  </td>
                </tr>
              );
            })}
            {!list.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  {hasFilters ? 'No invoices match the current filters.' : 'No invoices yet.'}
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
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingId
                  ? documentKind === 'credit_note'
                    ? 'Edit credit note'
                    : 'Edit invoice'
                  : documentKind === 'credit_note'
                    ? 'New credit note'
                    : 'New invoice'}
              </h2>
              <div className="flex items-center gap-2">
                {editingId && (
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => printOne(editingId)}
                  >
                    Print
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  onClick={() => setPanelOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>

            {documentKind === 'invoice' && (
            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
              <label className="text-sm">
                <span className="text-slate-600 dark:text-slate-400">Barcode / scan</span>
                <input
                  className="mt-0.5 w-48 rounded-md border border-slate-300 px-2 py-1.5"
                  value={barcode}
                  placeholder="Scan or type + Enter"
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && barcode.trim()) {
                      e.preventDefault();
                      barcodeLookup.mutate(barcode.trim());
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={!barcode.trim() || barcodeLookup.isPending}
                onClick={() => barcodeLookup.mutate(barcode.trim())}
              >
                Add product
              </button>
            </div>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Customer</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={customerId}
                  onChange={(v) => {
                    setCustomerId(v);
                    if (documentKind === 'credit_note' && !editingId) {
                      setOriginalInvoiceId('');
                      setLines([emptyLine()]);
                      setWarehouseId('');
                    }
                  }}
                  options={customerOptions}
                  placeholder="Search customer…"
                  disabled={customers.isLoading}
                  aria-label="Customer"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Warehouse (posting)</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouseOptions}
                  placeholder="Search warehouse…"
                  disabled={warehouses.isLoading || (documentKind === 'credit_note' && !!originalInvoiceId)}
                  aria-label="Warehouse"
                />
              </label>
              {!editingId && documentKind === 'credit_note' && (
                <label className="block text-sm sm:col-span-2">
                  <span className="text-slate-600 dark:text-slate-400">Posted invoice to credit</span>
                  <Combobox
                    className="mt-1 w-full max-w-none"
                    inputClassName="rounded-md border border-slate-300 px-3 py-2"
                    value={originalInvoiceId}
                    onChange={(v) => {
                      void applyCreditSourceInvoice(v).catch((e: Error) => setError(e.message));
                    }}
                    options={[
                      ...(postedForCredit.data ?? []).map((inv) => ({
                        value: inv.id,
                        label: `${inv.invoiceDate} · ${formatMoney(inv.total)}`,
                      })),
                    ]}
                    placeholder="Pick invoice…"
                    disabled={!customerId || postedForCredit.isLoading}
                    aria-label="Source invoice for credit note"
                  />
                </label>
              )}
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Salesperson</span>
                <Combobox
                  className="mt-1 w-full max-w-none"
                  inputClassName="rounded-md border border-slate-300 px-3 py-2"
                  value={salespersonId}
                  onChange={setSalespersonId}
                  options={salespersonOptions}
                  placeholder="Search salesperson…"
                  disabled={salespersons.isLoading}
                  aria-label="Salesperson"
                />
              </label>
              {canPickTemplate && (
                <label className="block text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Invoice template</span>
                  <Combobox
                    className="mt-1 w-full max-w-none"
                    inputClassName="rounded-md border border-slate-300 px-3 py-2"
                    value={invoiceTemplateId}
                    onChange={setInvoiceTemplateId}
                    options={invoiceTemplateOptions}
                    placeholder="Search template…"
                    disabled={invoiceTemplates.isLoading}
                    aria-label="Invoice template"
                  />
                </label>
              )}
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Invoice date</span>
                <DatePickerInput
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Due date (optional)</span>
                <DatePickerInput
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Payment</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as 'credit' | 'cash' | '')}
                >
                  <option value="">— Select —</option>
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">Invoice discount</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={headerDiscount}
                  onChange={(e) => setHeaderDiscount(formatMoneyInput(e.target.value))}
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
              />
            </label>

            <div className="mt-4">
              <div className="flex justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Lines</span>
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={documentKind === 'credit_note'}
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                >
                  + Add line
                </button>
              </div>
              {documentKind === 'invoice' && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Batch-tracked products are split by batch when you post (FEFO/FIFO).
                </p>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {lines.map((line, idx) => {
                const product = line.productId ? productById.get(line.productId) : undefined;
                const showBatchInfo =
                  documentKind === 'credit_note' &&
                  (line.batchCode || line.expiryDate || product?.batchTracked || product?.expiryTracked);

                return (
                <div key={idx} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="grid gap-2 sm:grid-cols-12 sm:items-end">
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
                            unitPrice: p ? p.sellingPrice : next[idx].unitPrice,
                          };
                          return next;
                        });
                      }}
                      options={productLineOptions}
                      placeholder="Search product…"
                      disabled={products.isLoading || documentKind === 'credit_note'}
                      aria-label="Product"
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">
                      {documentKind === 'credit_note' ? 'Return qty' : 'Qty'}
                      {line.maxReturnQty != null ? (
                        <span className="text-slate-400"> (max {line.maxReturnQty})</span>
                      ) : null}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      max={line.maxReturnQty}
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
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Price</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], unitPrice: formatMoneyInput(e.target.value) };
                          return n;
                        })
                      }
                    />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-xs text-slate-500">Line disc.</span>
                    <input
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      value={line.discountAmount}
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
                      disabled={taxProfiles.isLoading}
                      aria-label="Line tax profile"
                    />
                  </label>
                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                  </div>
                  {showBatchInfo && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Sold on invoice:{' '}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {line.batchCode.trim() ? line.batchCode : 'Unspecified'}
                        {line.expiryDate ? ` · exp ${line.expiryDate}` : ''}
                      </span>
                    </p>
                  )}
                  {documentKind !== 'credit_note' && (
                    <div>
                      <LineStockInfo
                        productId={line.productId}
                        warehouseId={warehouseId}
                        requestedQuantity={line.quantity}
                      />
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setPanelOpen(false)}
              >
                Cancel
              </button>
              {canWrite && (
                <button
                  type="button"
                  disabled={save.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => save.mutate()}
                >
                  Save draft
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
