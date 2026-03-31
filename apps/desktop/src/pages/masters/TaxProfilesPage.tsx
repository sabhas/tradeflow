import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface Row {
  id: string;
  name: string;
  rate: string;
  isInclusive: boolean;
  region?: string | null;
}

export function TaxProfilesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.tax:read');
  const canWrite = hasPermission(permissions, 'masters.tax:write');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead,
    queryFn: () => apiFetchData<Row[]>('/tax-profiles'),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('0');
  const [isInclusive, setIsInclusive] = useState(false);
  const [region, setRegion] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name, rate, isInclusive, region: region || null };
      if (editing) {
        await apiFetch(`/tax-profiles/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/tax-profiles', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-profiles'] });
      setOpen(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/tax-profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-profiles'] }),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-800">Tax profiles</h1>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setEditing(null);
              setName('');
              setRate('0');
              setIsInclusive(false);
              setRegion('');
              setOpen(true);
            }}
          >
            Add profile
          </button>
        )}
      </div>
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Rate %</th>
              <th className="px-4 py-3 text-left font-medium">Inclusive</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {(data || []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">{r.rate}</td>
                <td className="px-4 py-3">{r.isInclusive ? 'Yes' : 'No'}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => {
                        setEditing(r);
                        setName(r.name);
                        setRate(r.rate);
                        setIsInclusive(r.isInclusive);
                        setRegion(r.region || '');
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`Delete tax profile “${r.name}”?`)) del.mutate(r.id);
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
      <MastersModal title={editing ? 'Edit tax profile' : 'New tax profile'} open={open} onClose={() => setOpen(false)}>
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
            <label className="block text-sm font-medium text-slate-700">Rate</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Region (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="tax-inc"
              type="checkbox"
              checked={isInclusive}
              onChange={(e) => setIsInclusive(e.target.checked)}
            />
            <label htmlFor="tax-inc" className="text-sm text-slate-700">
              Tax inclusive
            </label>
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
