import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface Row {
  id: string;
  name: string;
  paymentTermsId?: string | null;
  taxProfileId?: string | null;
}

interface Opt {
  id: string;
  name: string;
}

export function SuppliersPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.suppliers:read');
  const canWrite = hasPermission(permissions, 'masters.suppliers:write');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: Row[] }>('/suppliers').then((r) => r.data),
  });

  const paymentTerms = useQuery({
    queryKey: ['payment-terms'],
    enabled: canRead,
    queryFn: () => apiFetchData<Opt[]>('/payment-terms'),
  });

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead,
    queryFn: () => apiFetchData<Opt[]>('/tax-profiles'),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [name, setName] = useState('');
  const [paymentTermsId, setPaymentTermsId] = useState('');
  const [taxProfileId, setTaxProfileId] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        paymentTermsId: paymentTermsId || null,
        taxProfileId: taxProfileId || null,
      };
      if (editing) {
        await apiFetch(`/suppliers/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/suppliers', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setOpen(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-800">Suppliers</h1>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setEditing(null);
              setName('');
              setPaymentTermsId('');
              setTaxProfileId('');
              setOpen(true);
            }}
          >
            Add supplier
          </button>
        )}
      </div>
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {(data || []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.name}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => {
                        setEditing(r);
                        setName(r.name);
                        setPaymentTermsId(r.paymentTermsId || '');
                        setTaxProfileId(r.taxProfileId || '');
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`Delete supplier “${r.name}”?`)) del.mutate(r.id);
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
      </div>
      <MastersModal title={editing ? 'Edit supplier' : 'New supplier'} open={open} onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Payment terms</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={paymentTermsId}
              onChange={(e) => setPaymentTermsId(e.target.value)}
            >
              <option value="">— None —</option>
              {(paymentTerms.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Tax profile</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={taxProfileId}
              onChange={(e) => setTaxProfileId(e.target.value)}
            >
              <option value="">— None —</option>
              {(taxProfiles.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white">
              Save
            </button>
          </div>
        </form>
      </MastersModal>
    </div>
  );
}
