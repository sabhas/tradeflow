import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface AreaRow {
  id: string;
  name: string;
}

interface TownRow {
  id: string;
  name: string;
  areaId?: string | null;
  area?: { id: string; name: string } | null;
}

export function TownsAndAreasPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.customers:read');
  const canWrite = hasPermission(permissions, 'masters.customers:write');
  const qc = useQueryClient();

  const areas = useQuery({
    queryKey: ['areas'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: AreaRow[] }>('/areas').then((r) => r.data),
  });

  const [townAreaFilter, setTownAreaFilter] = useState('');
  const towns = useQuery({
    queryKey: ['towns', townAreaFilter || 'all'],
    enabled: canRead,
    queryFn: () => {
      const q = townAreaFilter ? `?areaId=${encodeURIComponent(townAreaFilter)}` : '';
      return apiFetch<{ data: TownRow[] }>(`/towns${q}`).then((r) => r.data);
    },
  });

  const [townOpen, setTownOpen] = useState(false);
  const [editingTown, setEditingTown] = useState<TownRow | null>(null);
  const [townName, setTownName] = useState('');
  const [townAreaId, setTownAreaId] = useState('');

  const saveTown = useMutation({
    mutationFn: async () => {
      const payload = { name: townName, areaId: townAreaId };
      if (editingTown) {
        await apiFetch(`/towns/${editingTown.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/towns', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['towns'] });
      qc.invalidateQueries({ queryKey: ['areas'] });
      setTownOpen(false);
    },
  });

  const delTown = useMutation({
    mutationFn: (id: string) => apiFetch(`/towns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['towns'] });
      qc.invalidateQueries({ queryKey: ['areas'] });
    },
  });

  const [areaOpen, setAreaOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaRow | null>(null);
  const [areaName, setAreaName] = useState('');

  const saveArea = useMutation({
    mutationFn: async () => {
      if (editingArea) {
        await apiFetch(`/areas/${editingArea.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: areaName }),
        });
      } else {
        await apiFetch('/areas', { method: 'POST', body: JSON.stringify({ name: areaName }) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['areas'] });
      setAreaOpen(false);
    },
  });

  const delArea = useMutation({
    mutationFn: (id: string) => apiFetch(`/areas/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div className="space-y-10">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Towns &amp; areas</h1>
            <p className="mt-1 text-slate-600">
              Define area as parent, then map towns under each area.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              onClick={() => {
                setEditingArea(null);
                setAreaName('');
                setAreaOpen(true);
              }}
            >
              Add area
            </button>
          )}
        </div>
        <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Area</th>
                {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {!areas.data?.length && !areas.isLoading && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-slate-500">
                    No areas yet. Add an area first.
                  </td>
                </tr>
              )}
              {(areas.data || []).map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-indigo-600 hover:underline"
                        onClick={() => {
                          setEditingArea(a);
                          setAreaName(a.name);
                          setAreaOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-red-600 hover:underline"
                        onClick={() => {
                          if (window.confirm(`Delete area “${a.name}”?`)) delArea.mutate(a.id);
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
      </div>

      <div>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Towns</h2>
            <p className="mt-1 text-slate-600">Each town belongs to one area.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Filter by area</label>
              <select
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={townAreaFilter}
                onChange={(e) => setTownAreaFilter(e.target.value)}
              >
                <option value="">All areas</option>
                {(areas.data || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {canWrite && (
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  setEditingTown(null);
                  setTownName('');
                  setTownAreaId(townAreaFilter || (areas.data?.[0]?.id ?? ''));
                  setTownOpen(true);
                }}
              >
                Add town
              </button>
            )}
          </div>
        </div>
        <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Town</th>
                <th className="px-4 py-3 text-left font-medium">Area</th>
                {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {towns.isLoading && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              )}
              {!towns.isLoading && !towns.data?.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-slate-500">
                    No towns for this filter.
                  </td>
                </tr>
              )}
              {(towns.data || []).map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-700">{t.area?.name ?? '—'}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-indigo-600 hover:underline"
                        onClick={() => {
                          setEditingTown(t);
                          setTownName(t.name);
                          setTownAreaId(t.areaId ?? '');
                          setTownOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-red-600 hover:underline"
                        onClick={() => {
                          if (window.confirm(`Delete town “${t.name}”?`)) delTown.mutate(t.id);
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
      </div>

      <MastersModal title={editingArea ? 'Edit area' : 'New area'} open={areaOpen} onClose={() => setAreaOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveArea.mutate();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setAreaOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white">
              Save
            </button>
          </div>
        </form>
      </MastersModal>

      <MastersModal title={editingTown ? 'Edit town' : 'New town'} open={townOpen} onClose={() => setTownOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!townAreaId) {
              alert('Select an area.');
              return;
            }
            saveTown.mutate();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">Area</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={townAreaId}
              onChange={(e) => setTownAreaId(e.target.value)}
              required
            >
              <option value="">— Select —</option>
              {(areas.data || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Town name</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={townName}
              onChange={(e) => setTownName(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setTownOpen(false)}>
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
