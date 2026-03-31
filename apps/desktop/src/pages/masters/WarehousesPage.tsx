import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface Row {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
}

export function WarehousesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.warehouses:read');
  const canWrite = hasPermission(permissions, 'masters.warehouses:write');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead,
    queryFn: () => apiFetchData<Row[]>('/warehouses'),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name, code, isDefault };
      if (editing) {
        await apiFetch(`/warehouses/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/warehouses', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setOpen(false);
    },
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Warehouses</h1>
          <p className="mt-1 text-slate-600">At least one warehouse is created automatically if none exist.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setEditing(null);
              setName('');
              setCode('');
              setIsDefault(false);
              setOpen(true);
            }}
          >
            Add warehouse
          </button>
        )}
      </div>
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Code</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Default</th>
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
                <td className="px-4 py-3 font-mono">{r.code}</td>
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">{r.isDefault ? 'Yes' : 'No'}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => {
                        setEditing(r);
                        setName(r.name);
                        setCode(r.code);
                        setIsDefault(r.isDefault);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MastersModal title={editing ? 'Edit warehouse' : 'New warehouse'} open={open} onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">Code</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="wh-default"
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <label htmlFor="wh-default" className="text-sm text-slate-700">
              Default warehouse
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
