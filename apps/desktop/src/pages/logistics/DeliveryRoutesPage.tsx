import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { LogisticsSubNav } from '../../components/LogisticsSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface RouteRow {
  id: string;
  name: string;
  code: string;
  description?: string;
}

interface StopRow {
  id?: string;
  sequenceOrder: number;
  customerId?: string | null;
  addressLine?: string | null;
}

interface CustomerOpt {
  id: string;
  name: string;
}

export function DeliveryRoutesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'logistics.routes:read');
  const canWrite = hasPermission(permissions, 'logistics.routes:write');
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [stops, setStops] = useState<StopRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['delivery-routes'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: RouteRow[] }>('/delivery-routes').then((r) => r.data),
  });

  const customers = useQuery({
    queryKey: ['customers', 'logistics-stops'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: CustomerOpt[] }>('/customers?limit=500').then((r) => r.data),
  });

  const detail = useQuery({
    queryKey: ['delivery-route', editing?.id],
    enabled: !!editing?.id && panelOpen,
    queryFn: () =>
      apiFetch<{ data: RouteRow & { stops?: StopRow[] } }>(`/delivery-routes/${editing!.id}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!detail.data) return;
    setName(detail.data.name);
    setCode(detail.data.code);
    setDescription(detail.data.description ?? '');
    const s = (detail.data.stops || []).slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    setStops(s.map((x) => ({ ...x })));
  }, [detail.data]);

  const save = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!name.trim() || !code.trim()) throw new Error('Name and code required');
      if (editing) {
        await apiFetch(`/delivery-routes/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim(),
            description: description.trim() || null,
            stops: stops.map((s, i) => ({
              sequenceOrder: s.sequenceOrder ?? i,
              customerId: s.customerId || null,
              addressLine: s.addressLine || null,
            })),
          }),
        });
      } else {
        await apiFetch('/delivery-routes', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim(),
            description: description.trim() || null,
          }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-routes'] });
      setPanelOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/delivery-routes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-routes'] }),
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Delivery routes</h1>
          <p className="mt-1 text-slate-600">Route master and stop sequence</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setEditing(null);
              setName('');
              setCode('');
              setDescription('');
              setStops([]);
              setError(null);
              setPanelOpen(true);
            }}
          >
            New route
          </button>
        )}
      </div>
      <LogisticsSubNav />
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Code</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-3">{r.name}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => {
                        setEditing(r);
                        setError(null);
                        setPanelOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`Delete route “${r.name}”?`)) del.mutate(r.id);
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

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Edit route' : 'New route'}</h2>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-600">Name</span>
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Code</span>
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Description</span>
                <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </div>
            {editing && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-800">Stops</h3>
                  <button
                    type="button"
                    className="text-sm text-indigo-600 hover:underline"
                    onClick={() =>
                      setStops((prev) => [...prev, { sequenceOrder: prev.length, customerId: null, addressLine: '' }])
                    }
                  >
                    Add stop
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {stops.map((s, idx) => (
                    <div key={idx} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
                      <label className="text-xs">
                        Seq
                        <input
                          type="number"
                          className="mt-0.5 w-16 rounded border border-slate-300 px-2 py-1"
                          value={s.sequenceOrder}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setStops((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], sequenceOrder: Number.isFinite(v) ? v : 0 };
                              return next;
                            });
                          }}
                        />
                      </label>
                      <label className="min-w-[140px] flex-1 text-xs">
                        Customer
                        <select
                          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                          value={s.customerId || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setStops((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], customerId: v || null };
                              return next;
                            });
                          }}
                        >
                          <option value="">—</option>
                          {(customers.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="min-w-[160px] flex-1 text-xs">
                        Address (if no customer)
                        <input
                          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                          value={s.addressLine || ''}
                          onChange={(e) =>
                            setStops((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], addressLine: e.target.value };
                              return next;
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => setStops((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setPanelOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
