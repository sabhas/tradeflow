import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch, apiFetchData, downloadAuthenticatedFile } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { MastersModal } from '../../components/MastersModal';
import { useAppSelector } from '../../hooks/useAppSelector';
import { hasPermission } from '../../lib/permissions';

interface ProductRow {
  id: string;
  supplierId: string;
  supplier?: { id: string; name: string };
  sku: string;
  barcode?: string | null;
  name: string;
  categoryId: string;
  unitId: string;
  costPrice: string;
  sellingPrice: string;
  batchTracked: boolean;
  expiryTracked: boolean;
  costingMethod?: string | null;
  minStock?: string | null;
  reorderLevel?: string | null;
  manufacturerCode?: string | null;
  shortName?: string | null;
  genericName?: string | null;
  packing?: string | null;
  hsCode?: string | null;
  retailPrice: string;
  cutPrice: string;
  purchaseDiscountPct?: string | null;
  salesDiscountPct?: string | null;
  purchaseSalesTaxPct?: string | null;
  purchaseWithholdingTaxPct?: string | null;
  purchaseFurtherTaxPct?: string | null;
  salesSalesTaxPct?: string | null;
  salesWithholdingTaxPct?: string | null;
  salesFurtherTaxPct?: string | null;
  saleType?: string | null;
  saleRatePct?: string | null;
  sroSchedule?: string | null;
  sroItemSerial?: string | null;
  isHerbal: boolean;
  isNarcotic: boolean;
  isFridged: boolean;
  isSurgical: boolean;
  staxBeforeDiscount: boolean;
  staxOnRetail: boolean;
  staxOnBonusSale: boolean;
  staxOnBonusPurchase: boolean;
  tradePriceAllBatches: boolean;
  autoPriceFromRetail: boolean;
  printNetPriceOnInvoice: boolean;
  isActive: boolean;
  prices?: { priceLevelId: string; price: string }[];
}

interface CategoryOpt {
  id: string;
  name: string;
  code: string;
}

interface UnitOpt {
  id: string;
  code: string;
  name: string;
}

interface PriceLevelOpt {
  id: string;
  name: string;
}

const emptyProductProfileFields = {
  manufacturerCode: '',
  shortName: '',
  genericName: '',
  packing: '',
  hsCode: '',
  retailPrice: '0',
  cutPrice: '0',
  purchaseDiscountPct: '',
  salesDiscountPct: '',
  purchaseSalesTaxPct: '',
  purchaseWithholdingTaxPct: '',
  purchaseFurtherTaxPct: '',
  salesSalesTaxPct: '',
  salesWithholdingTaxPct: '',
  salesFurtherTaxPct: '',
  saleType: '',
  saleRatePct: '',
  sroSchedule: '',
  sroItemSerial: '',
  isHerbal: false,
  isNarcotic: false,
  isFridged: false,
  isSurgical: false,
  staxBeforeDiscount: false,
  staxOnRetail: false,
  staxOnBonusSale: false,
  staxOnBonusPurchase: false,
  tradePriceAllBatches: false,
  autoPriceFromRetail: false,
  printNetPriceOnInvoice: false,
  isActive: true,
};

export function ProductsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.products:read');
  const canWrite = hasPermission(permissions, 'masters.products:write');
  const qc = useQueryClient();

  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  const [form, setForm] = useState({
    supplierId: '',
    categoryId: '',
    sku: '',
    barcode: '',
    name: '',
    unitId: '',
    costPrice: '0',
    sellingPrice: '0',
    batchTracked: false,
    expiryTracked: false,
    costingMethod: '' as '' | 'fifo' | 'lifo',
    minStock: '',
    reorderLevel: '',
    priceRows: [] as { priceLevelId: string; price: string }[],
    ...emptyProductProfileFields,
  });

  const categories = useQuery({
    queryKey: ['product-categories', 'flat'],
    enabled: canRead,
    queryFn: () => apiFetchData<CategoryOpt[]>('/product-categories'),
  });

  const units = useQuery({
    queryKey: ['units'],
    enabled: canRead,
    queryFn: () => apiFetchData<UnitOpt[]>('/units'),
  });

  const priceLevels = useQuery({
    queryKey: ['price-levels'],
    enabled: canRead,
    queryFn: () => apiFetchData<PriceLevelOpt[]>('/price-levels'),
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'products-dd'],
    enabled: canRead && canWrite,
    queryFn: () =>
      apiFetch<{ data: Array<{ id: string; name: string }> }>('/suppliers?limit=500').then((r) => r.data),
  });

  const categoryFilterOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...(categories.data || []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories.data]
  );
  const supplierFormOptions = useMemo(() => {
    const list = suppliers.data ?? [];
    if (list.length === 0) {
      return [{ value: '', label: 'No suppliers — create one under Masters first' }];
    }
    return list.map((s) => ({ value: s.id, label: s.name }));
  }, [suppliers.data]);
  const categoryFormOptions = useMemo(
    () => (categories.data || []).map((c) => ({ value: c.id, label: c.name })),
    [categories.data]
  );
  const unitFormOptions = useMemo(
    () => (units.data || []).map((u) => ({ value: u.id, label: `${u.name} (${u.code})` })),
    [units.data]
  );

  const listParams = useMemo(() => {
    const q = new URLSearchParams();
    if (categoryId) q.set('categoryId', categoryId);
    if (search.trim()) q.set('search', search.trim());
    q.set('limit', '100');
    return q.toString();
  }, [categoryId, search]);

  const exportQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (categoryId) q.set('categoryId', categoryId);
    if (search.trim()) q.set('search', search.trim());
    return q.toString();
  }, [categoryId, search]);

  const products = useQuery({
    queryKey: ['products', listParams],
    enabled: canRead,
    queryFn: async () => {
      const res = await apiFetch<{ data: ProductRow[]; meta?: { total: number } }>(
        `/products?${listParams}`
      );
      return res;
    },
  });

  const openCreate = () => {
    setEditing(null);
    const firstSupplier = suppliers.data?.[0]?.id ?? '';
    const firstCat = categories.data?.[0]?.id ?? '';
    const firstUnit = units.data?.[0]?.id ?? '';
    const pl = (priceLevels.data || []).map((p) => ({
      priceLevelId: p.id,
      price: '0',
    }));
    setForm({
      supplierId: firstSupplier,
      categoryId: firstCat,
      sku: '',
      barcode: '',
      name: '',
      unitId: firstUnit,
      costPrice: '0',
      sellingPrice: '0',
      batchTracked: false,
      expiryTracked: false,
      costingMethod: '',
      minStock: '',
      reorderLevel: '',
      priceRows: pl,
      ...emptyProductProfileFields,
    });
    setModalOpen(true);
  };

  const openEdit = async (p: ProductRow) => {
    const full = await apiFetchData<ProductRow>(`/products/${p.id}`);
    setEditing(full);
    const existing = new Map((full.prices || []).map((x) => [x.priceLevelId, x.price]));
    const priceRows = (priceLevels.data || []).map((pl) => ({
      priceLevelId: pl.id,
      price: existing.get(pl.id) ?? '0',
    }));
    setForm({
      supplierId: full.supplierId,
      categoryId: full.categoryId,
      sku: full.sku,
      barcode: full.barcode || '',
      name: full.name,
      unitId: full.unitId,
      costPrice: full.costPrice,
      sellingPrice: full.sellingPrice,
      batchTracked: full.batchTracked,
      expiryTracked: full.expiryTracked,
      costingMethod: (full.costingMethod as 'fifo' | 'lifo' | null | undefined) || '',
      minStock: full.minStock || '',
      reorderLevel: full.reorderLevel || '',
      priceRows,
      manufacturerCode: full.manufacturerCode || '',
      shortName: full.shortName || '',
      genericName: full.genericName || '',
      packing: full.packing || '',
      hsCode: full.hsCode || '',
      retailPrice: full.retailPrice ?? '0',
      cutPrice: full.cutPrice ?? '0',
      purchaseDiscountPct: full.purchaseDiscountPct || '',
      salesDiscountPct: full.salesDiscountPct || '',
      purchaseSalesTaxPct: full.purchaseSalesTaxPct || '',
      purchaseWithholdingTaxPct: full.purchaseWithholdingTaxPct || '',
      purchaseFurtherTaxPct: full.purchaseFurtherTaxPct || '',
      salesSalesTaxPct: full.salesSalesTaxPct || '',
      salesWithholdingTaxPct: full.salesWithholdingTaxPct || '',
      salesFurtherTaxPct: full.salesFurtherTaxPct || '',
      saleType: full.saleType || '',
      saleRatePct: full.saleRatePct || '',
      sroSchedule: full.sroSchedule || '',
      sroItemSerial: full.sroItemSerial || '',
      isHerbal: full.isHerbal ?? false,
      isNarcotic: full.isNarcotic ?? false,
      isFridged: full.isFridged ?? false,
      isSurgical: full.isSurgical ?? false,
      staxBeforeDiscount: full.staxBeforeDiscount ?? false,
      staxOnRetail: full.staxOnRetail ?? false,
      staxOnBonusSale: full.staxOnBonusSale ?? false,
      staxOnBonusPurchase: full.staxOnBonusPurchase ?? false,
      tradePriceAllBatches: full.tradePriceAllBatches ?? false,
      autoPriceFromRetail: full.autoPriceFromRetail ?? false,
      printNetPriceOnInvoice: full.printNetPriceOnInvoice ?? false,
      isActive: full.isActive ?? true,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const decOrNull = (s: string) => (s.trim() === '' ? null : s.trim());
      const strOrNull = (s: string) => {
        const t = s.trim();
        return t === '' ? null : t;
      };
      const payload = {
        supplierId: form.supplierId,
        categoryId: form.categoryId,
        sku: form.sku,
        barcode: form.barcode || null,
        name: form.name,
        unitId: form.unitId,
        costPrice: form.costPrice,
        sellingPrice: form.sellingPrice,
        batchTracked: form.batchTracked,
        expiryTracked: form.expiryTracked,
        costingMethod: form.costingMethod || null,
        minStock: form.minStock || null,
        reorderLevel: form.reorderLevel || null,
        manufacturerCode: strOrNull(form.manufacturerCode),
        shortName: strOrNull(form.shortName),
        genericName: strOrNull(form.genericName),
        packing: strOrNull(form.packing),
        hsCode: strOrNull(form.hsCode),
        retailPrice: form.retailPrice,
        cutPrice: form.cutPrice,
        purchaseDiscountPct: decOrNull(form.purchaseDiscountPct),
        salesDiscountPct: decOrNull(form.salesDiscountPct),
        purchaseSalesTaxPct: decOrNull(form.purchaseSalesTaxPct),
        purchaseWithholdingTaxPct: decOrNull(form.purchaseWithholdingTaxPct),
        purchaseFurtherTaxPct: decOrNull(form.purchaseFurtherTaxPct),
        salesSalesTaxPct: decOrNull(form.salesSalesTaxPct),
        salesWithholdingTaxPct: decOrNull(form.salesWithholdingTaxPct),
        salesFurtherTaxPct: decOrNull(form.salesFurtherTaxPct),
        saleType: strOrNull(form.saleType),
        saleRatePct: decOrNull(form.saleRatePct),
        sroSchedule: strOrNull(form.sroSchedule),
        sroItemSerial: strOrNull(form.sroItemSerial),
        isHerbal: form.isHerbal,
        isNarcotic: form.isNarcotic,
        isFridged: form.isFridged,
        isSurgical: form.isSurgical,
        staxBeforeDiscount: form.staxBeforeDiscount,
        staxOnRetail: form.staxOnRetail,
        staxOnBonusSale: form.staxOnBonusSale,
        staxOnBonusPurchase: form.staxOnBonusPurchase,
        tradePriceAllBatches: form.tradePriceAllBatches,
        autoPriceFromRetail: form.autoPriceFromRetail,
        printNetPriceOnInvoice: form.printNetPriceOnInvoice,
        isActive: form.isActive,
        prices: form.priceRows.map((r) => ({
          priceLevelId: r.priceLevelId,
          price: r.price,
        })),
      };
      if (editing) {
        await apiFetch(`/products/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  if (!canRead) {
    return <p className="text-slate-600">You do not have permission to view products.</p>;
  }

  const rows = products.data?.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Products</h1>

        </div>
        <div className="flex flex-wrap gap-2">
          {canRead && (
            <button
              type="button"
              onClick={() =>
                downloadAuthenticatedFile(
                  `/export/products${exportQuery ? `?${exportQuery}` : ''}`,
                  'products-export.xlsx'
                ).catch((e: Error) => alert(e.message))
              }
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Export Excel
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Add product
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Category</label>
          <Combobox
            className="mt-1 w-full max-w-xs"
            inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={categoryId}
            onChange={setCategoryId}
            options={categoryFilterOptions}
            placeholder="All categories…"
            disabled={categories.isLoading}
            aria-label="Filter by category"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Name, SKU, barcode, generic, packing…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Supplier</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Packing</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Active</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Selling</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Batch</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-300">Expiry</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {products.isLoading && (
              <tr>
                <td colSpan={canWrite ? 9 : 8} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {!products.isLoading &&
              rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-100">{p.sku}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    {p.name}
                    {p.isNarcotic ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">N</span>
                    ) : null}
                    {p.isFridged ? (
                      <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">Cold</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.packing ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.isActive !== false ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.sellingPrice}</td>
                  <td className="px-4 py-3">{p.batchTracked ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">{p.expiryTracked ? 'Yes' : 'No'}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-indigo-600 hover:underline"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-red-600 hover:underline"
                        onClick={() => {
                          if (window.confirm(`Delete product “${p.name}”?`)) {
                            deleteMutation.mutate(p.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
        {!products.isLoading && rows.length === 0 && (
          <div className="py-12 text-center text-slate-500">No products match your filters.</div>
        )}
      </div>

      <MastersModal
        title={editing ? 'Edit product' : 'New product'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        wide
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">General</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Supplier / manufacturer</label>
                  <Combobox
                    className="mt-1 w-full max-w-none"
                    inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.supplierId}
                    onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
                    options={supplierFormOptions}
                    placeholder="Search supplier…"
                    disabled={(suppliers.data ?? []).length === 0 || suppliers.isLoading}
                    aria-label="Supplier"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SKU</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Manufacturer code</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.manufacturerCode}
                    onChange={(e) => setForm((f) => ({ ...f, manufacturerCode: e.target.value }))}
                    placeholder="Vendor / factory code"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Barcode</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.barcode}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Short name</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.shortName}
                    onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
                  <Combobox
                    className="mt-1 w-full max-w-none"
                    inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.categoryId}
                    onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                    options={categoryFormOptions}
                    placeholder="Search category…"
                    disabled={!categoryFormOptions.length || categories.isLoading}
                    aria-label="Category"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Generic name</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.genericName}
                    onChange={(e) => setForm((f) => ({ ...f, genericName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Unit</label>
                  <Combobox
                    className="mt-1 w-full max-w-none"
                    inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.unitId}
                    onChange={(v) => setForm((f) => ({ ...f, unitId: v }))}
                    options={unitFormOptions}
                    placeholder="Search unit…"
                    disabled={!unitFormOptions.length || units.isLoading}
                    aria-label="Unit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Packing</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.packing}
                    onChange={(e) => setForm((f) => ({ ...f, packing: e.target.value }))}
                    placeholder="e.g. 10's, 60ml"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">HS code</label>
                  <input
                    className="mt-1 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.hsCode}
                    onChange={(e) => setForm((f) => ({ ...f, hsCode: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pricing & inventory</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cost price</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.costPrice}
                    onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Selling price (trade / base)</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.sellingPrice}
                    onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Retail price</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.retailPrice}
                    onChange={(e) => setForm((f) => ({ ...f, retailPrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cut price</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.cutPrice}
                    onChange={(e) => setForm((f) => ({ ...f, cutPrice: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="batch"
                      type="checkbox"
                      checked={form.batchTracked}
                      onChange={(e) => setForm((f) => ({ ...f, batchTracked: e.target.checked }))}
                    />
                    <label htmlFor="batch" className="text-sm text-slate-700">
                      Batch tracked
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="expiry"
                      type="checkbox"
                      checked={form.expiryTracked}
                      onChange={(e) => setForm((f) => ({ ...f, expiryTracked: e.target.checked }))}
                    />
                    <label htmlFor="expiry" className="text-sm text-slate-700">
                      Expiry tracked
                    </label>
                  </div>
                </div>
                <div />
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Min stock</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.minStock}
                    onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Reorder level</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.reorderLevel}
                    onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Discount & tax rates (%)</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Defaults for purchasing and sales; document-level tax may still apply from your tax engine.
              </p>
              <div className="mt-3 flex flex-col gap-4 lg:flex-row">
                <div className="flex-1 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Purchase</div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-slate-600">Discount</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.purchaseDiscountPct}
                        onChange={(e) => setForm((f) => ({ ...f, purchaseDiscountPct: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600">Sales tax</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.purchaseSalesTaxPct}
                        onChange={(e) => setForm((f) => ({ ...f, purchaseSalesTaxPct: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600">Withholding</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.purchaseWithholdingTaxPct}
                        onChange={(e) => setForm((f) => ({ ...f, purchaseWithholdingTaxPct: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600">Further tax</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.purchaseFurtherTaxPct}
                        onChange={(e) => setForm((f) => ({ ...f, purchaseFurtherTaxPct: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex-1 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Sales</div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-slate-600">Discount</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.salesDiscountPct}
                        onChange={(e) => setForm((f) => ({ ...f, salesDiscountPct: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600">Sales tax</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.salesSalesTaxPct}
                        onChange={(e) => setForm((f) => ({ ...f, salesSalesTaxPct: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600">Withholding</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.salesWithholdingTaxPct}
                        onChange={(e) => setForm((f) => ({ ...f, salesWithholdingTaxPct: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600">Further tax</label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={form.salesFurtherTaxPct}
                        onChange={(e) => setForm((f) => ({ ...f, salesFurtherTaxPct: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Regulatory / FBR reference</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sale type</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.saleType}
                    onChange={(e) => setForm((f) => ({ ...f, saleType: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sale rate (%)</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.saleRatePct}
                    onChange={(e) => setForm((f) => ({ ...f, saleRatePct: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SRO schedule</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.sroSchedule}
                    onChange={(e) => setForm((f) => ({ ...f, sroSchedule: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SRO item serial</label>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.sroItemSerial}
                    onChange={(e) => setForm((f) => ({ ...f, sroItemSerial: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Classification & behaviour</h3>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {(
                  [
                    ['isHerbal', 'Herbal', form.isHerbal],
                    ['isNarcotic', 'Narcotic', form.isNarcotic],
                    ['isFridged', 'Cold chain (fridge)', form.isFridged],
                    ['isSurgical', 'Surgical', form.isSurgical],
                  ] as const
                ).map(([key, label, checked]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      id={key}
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    />
                    <label htmlFor={key} className="text-sm text-slate-700">
                      {label}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3">
                {(
                  [
                    ['staxBeforeDiscount', 'Sales tax before discount', form.staxBeforeDiscount],
                    ['staxOnRetail', 'Sales tax on retail', form.staxOnRetail],
                    ['staxOnBonusSale', 'ST on bonus (sale)', form.staxOnBonusSale],
                    ['staxOnBonusPurchase', 'ST on bonus (purchase)', form.staxOnBonusPurchase],
                  ] as const
                ).map(([key, label, checked]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      id={key}
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    />
                    <label htmlFor={key} className="text-sm text-slate-700">
                      {label}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3">
                {(
                  [
                    ['tradePriceAllBatches', 'Trade price applies to all open batches', form.tradePriceAllBatches],
                    ['autoPriceFromRetail', 'Auto price from retail', form.autoPriceFromRetail],
                    ['printNetPriceOnInvoice', 'Print net price on invoices', form.printNetPriceOnInvoice],
                    ['isActive', 'Active (off = hidden from sales & purchase pickers)', form.isActive],
                  ] as const
                ).map(([key, label, checked]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      id={key}
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    />
                    <label htmlFor={key} className="text-sm text-slate-700">
                      {label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Stock costing</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Empty uses company default. Expiry-tracked products always allocate by FEFO (earliest expiry first).
              </p>
              <select
                className="mt-2 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.costingMethod}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    costingMethod: e.target.value as '' | 'fifo' | 'lifo',
                  }))
                }
              >
                <option value="">Company default</option>
                <option value="fifo">FIFO</option>
                <option value="lifo">LIFO</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Price levels</h3>
            <div className="mt-2 space-y-2">
              {form.priceRows.map((row, idx) => {
                const pl = (priceLevels.data || []).find((p) => p.id === row.priceLevelId);
                return (
                  <div key={row.priceLevelId} className="flex items-center gap-2">
                    <span className="w-32 text-sm text-slate-600">{pl?.name ?? 'Level'}</span>
                    <input
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={row.price}
                      onChange={(e) => {
                        const next = [...form.priceRows];
                        next[idx] = { ...next[idx], price: e.target.value };
                        setForm((f) => ({ ...f, priceRows: next }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </MastersModal>
    </div>
  );
}
