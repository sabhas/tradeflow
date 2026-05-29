import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface BonusRuleRow {
  id: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  minQuantity: string;
  bonusQuantity: string;
  isActive: boolean;
}

interface ProductOpt {
  id: string;
  sku: string;
  name: string;
}

export function BonusRulesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.products:read');
  const canWrite = hasPermission(permissions, 'masters.products:write');
  const qc = useQueryClient();

  const [filterProductId, setFilterProductId] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BonusRuleRow | null>(null);
  const [productId, setProductId] = useState('');
  const [minQuantity, setMinQuantity] = useState('10');
  const [bonusQuantity, setBonusQuantity] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ['products', 'bonus-rules'],
    enabled: canRead,
    queryFn: () =>
      apiFetchData<ProductOpt[]>('/products?limit=500').then((rows) =>
        rows.sort((a, b) => a.name.localeCompare(b.name))
      ),
  });

  const queryKey = ['bonus-rules', filterProductId];
  const { data, isLoading } = useQuery({
    queryKey,
    enabled: canRead,
    queryFn: () => {
      const params = new URLSearchParams({ limit: '200' });
      if (filterProductId) params.set('productId', filterProductId);
      return apiFetchData<BonusRuleRow[]>(`/bonus-rules?${params}`);
    },
  });

  const productOptions = useMemo(
    () => (products.data ?? []).map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` })),
    [products.data]
  );

  const resetForm = () => {
    setEditing(null);
    setProductId(filterProductId || '');
    setMinQuantity('10');
    setBonusQuantity('1');
    setIsActive(true);
    setError(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!productId) throw new Error('Select a product');
      const payload = {
        productId,
        minQuantity,
        bonusQuantity,
        isActive,
      };
      if (editing) {
        await apiFetch(`/bonus-rules/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/bonus-rules', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bonus-rules'] });
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/bonus-rules/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bonus-rules'] }),
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Bonus rules</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure buy-X-get-Y-free tiers per product for sales invoices.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
          >
            Add bonus rule
          </button>
        )}
      </div>

      <div className="mt-4 max-w-md">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Filter by product</label>
        <Combobox
          className="mt-1 w-full max-w-none"
          inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={filterProductId}
          onChange={setFilterProductId}
          options={[{ value: '', label: 'All products' }, ...productOptions]}
          placeholder="All products"
          disabled={products.isLoading}
          aria-label="Filter product"
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">Buy min qty</th>
              <th className="px-4 py-3 text-right font-medium">Bonus qty</th>
              <th className="px-4 py-3 text-left font-medium">Active</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading && (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && (data ?? []).length === 0 && (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                  No bonus rules yet.
                </td>
              </tr>
            )}
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.productName ?? r.productId}</div>
                  {r.productSku ? <div className="text-xs text-slate-500">{r.productSku}</div> : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.minQuantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.bonusQuantity}</td>
                <td className="px-4 py-3">{r.isActive ? 'Yes' : 'No'}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="text-indigo-600 hover:underline"
                        onClick={() => {
                          setEditing(r);
                          setProductId(r.productId);
                          setMinQuantity(r.minQuantity);
                          setBonusQuantity(r.bonusQuantity);
                          setIsActive(r.isActive);
                          setError(null);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          if (window.confirm('Delete this bonus rule?')) remove.mutate(r.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MastersModal title={editing ? 'Edit bonus rule' : 'New bonus rule'} open={open} onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Product</label>
            <Combobox
              className="mt-1 w-full max-w-none"
              inputClassName="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={productId}
              onChange={setProductId}
              options={productOptions}
              placeholder="Search product…"
              disabled={products.isLoading || !!editing}
              aria-label="Product"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Buy min quantity</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bonus quantity</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={bonusQuantity}
                onChange={(e) => setBonusQuantity(e.target.value)}
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white" disabled={save.isPending}>
              Save
            </button>
          </div>
        </form>
      </MastersModal>
    </div>
  );
}
