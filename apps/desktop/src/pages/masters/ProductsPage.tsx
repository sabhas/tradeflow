import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch, apiFetchData, downloadAuthenticatedFile } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { useAppSelector } from '../../hooks/useAppSelector';
import { hasPermission } from '../../lib/permissions';

interface ProductRow {
  id: string;
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
    const firstCat = categories.data?.[0]?.id ?? '';
    const firstUnit = units.data?.[0]?.id ?? '';
    const pl = (priceLevels.data || []).map((p) => ({
      priceLevelId: p.id,
      price: '0',
    }));
    setForm({
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
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
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
          <h1 className="text-2xl font-semibold text-slate-800">Products</h1>
          <p className="mt-1 text-slate-600">SKU, pricing, and optional batch or expiry tracking</p>
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
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
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
          <label className="block text-xs font-medium text-slate-600">Category</label>
          <select
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All</option>
            {(categories.data || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="block text-xs font-medium text-slate-600">Search</label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Name, SKU, or barcode"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Selling</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Batch</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Expiry</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium text-slate-700">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {products.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {!products.isLoading &&
              rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono text-slate-800">{p.sku}</td>
                  <td className="px-4 py-3 text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-700">{p.sellingPrice}</td>
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
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">SKU</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Barcode</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                required
              >
                {(categories.data || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Unit</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.unitId}
                onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
                required
              >
                {(units.data || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Cost price</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Selling price (base)</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.sellingPrice}
                onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
              />
            </div>
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
            <div>
              <label className="block text-sm font-medium text-slate-700">Min stock</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.minStock}
                onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Reorder level</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.reorderLevel}
                onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Stock costing override</label>
              <p className="mt-0.5 text-xs text-slate-500">
                Empty uses company default. Expiry-tracked products always allocate by FEFO (earliest expiry first).
              </p>
              <select
                className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            <h3 className="text-sm font-semibold text-slate-800">Price levels</h3>
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
