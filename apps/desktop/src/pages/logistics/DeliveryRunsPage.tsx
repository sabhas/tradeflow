import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, openAuthenticatedRoute } from '../../api/client';
import { LogisticsSubNav } from '../../components/LogisticsSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface RunRow {
  id: string;
  runDate: string;
  routeId: string;
  routeName?: string;
  routeCode?: string;
  vehicleInfo?: string;
  status: string;
  deliveryNoteIds?: string[];
}

interface NoteRow {
  id: string;
  status: string;
  invoiceId?: string;
  salesOrderId?: string;
  deliveryRunId?: string | null;
}

export function DeliveryRunsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'logistics.deliveries:read');
  const canWrite = hasPermission(permissions, 'logistics.deliveries:write');
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [assignRun, setAssignRun] = useState<RunRow | null>(null);
  const [runDate, setRunDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [routeId, setRouteId] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [driverId, setDriverId] = useState('');
  const [cold, setCold] = useState(false);
  const [controlled, setControlled] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());

  const runs = useQuery({
    queryKey: ['delivery-runs'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: RunRow[] }>('/delivery-runs').then((r) => r.data),
  });

  const routes = useQuery({
    queryKey: ['delivery-routes', 'dd'],
    enabled: canRead && (panelOpen || !!assignRun),
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string; code: string }> }>('/delivery-routes').then((r) => r.data),
  });

  const salespersons = useQuery({
    queryKey: ['salespersons', 'dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string }> }>('/salespersons').then((r) => r.data),
  });

  const notes = useQuery({
    queryKey: ['delivery-notes', 'all'],
    enabled: canRead && (panelOpen || !!assignRun),
    queryFn: () => apiFetch<{ data: NoteRow[] }>('/delivery-notes?limit=500').then((r) => r.data),
  });

  const createRun = useMutation({
    mutationFn: async () => {
      if (!routeId) throw new Error('Select a route');
      await apiFetch('/delivery-runs', {
        method: 'POST',
        body: JSON.stringify({
          runDate,
          routeId,
          vehicleInfo: vehicleInfo || null,
          driverSalespersonId: driverId || null,
          coldChainRequired: cold,
          controlledDeliveryRequired: controlled,
          deliveryNoteIds: [...selectedNotes],
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-runs'] });
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      setPanelOpen(false);
      setSelectedNotes(new Set());
    },
    onError: (e: Error) => setError(e.message),
  });

  const patchRun = useMutation({
    mutationFn: async () => {
      if (!assignRun) return;
      await apiFetch(`/delivery-runs/${assignRun.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ deliveryNoteIds: [...selectedNotes] }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-runs'] });
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      setAssignRun(null);
      setSelectedNotes(new Set());
    },
    onError: (e: Error) => setError(e.message),
  });

  const unassigned = (notes.data ?? []).filter((n) => !n.deliveryRunId && n.status !== 'delivered');

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Delivery runs</h1>
      <p className="mt-1 text-slate-600">Assign delivery notes and print run sheets</p>
      <LogisticsSubNav />
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      {canWrite && (
        <button
          type="button"
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          onClick={() => {
            setError(null);
            setRunDate(new Date().toISOString().slice(0, 10));
            setRouteId(routes.data?.[0]?.id ?? '');
            setVehicleInfo('');
            setDriverId('');
            setCold(false);
            setControlled(false);
            setSelectedNotes(new Set());
            setPanelOpen(true);
          }}
        >
          New run
        </button>
      )}
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Route</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Notes</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(runs.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{r.runDate}</td>
                <td className="px-4 py-3">{r.routeName ?? r.routeId.slice(0, 8)}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
                <td className="px-4 py-3">{r.deliveryNoteIds?.length ?? 0}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-slate-600 hover:underline"
                    onClick={() => openAuthenticatedRoute(`/delivery-runs/${r.id}/sheet`).catch((e) => setError(e.message))}
                  >
                    Print sheet
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      className="ml-3 text-indigo-600 hover:underline"
                      onClick={() => {
                        setAssignRun(r);
                        setSelectedNotes(new Set(r.deliveryNoteIds ?? []));
                        setError(null);
                      }}
                    >
                      Assign notes
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {panelOpen && canWrite && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">New delivery run</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-600">Date</span>
                <input type="date" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={runDate} onChange={(e) => setRunDate(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Route</span>
                <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                  <option value="">—</option>
                  {(routes.data ?? []).map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.code} — {rt.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Vehicle</span>
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Driver (salesperson)</span>
                <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                  <option value="">—</option>
                  {(salespersons.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cold} onChange={(e) => setCold(e.target.checked)} />
                Cold chain
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={controlled} onChange={(e) => setControlled(e.target.checked)} />
                Controlled delivery
              </label>
              <div>
                <p className="text-sm font-medium text-slate-700">Unassigned delivery notes</p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
                  {unassigned.length === 0 && <p className="text-xs text-slate-500">None</p>}
                  {unassigned.map((n) => (
                    <label key={n.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedNotes.has(n.id)}
                        onChange={(e) => {
                          setSelectedNotes((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(n.id);
                            else next.delete(n.id);
                            return next;
                          });
                        }}
                      />
                      {n.invoiceId ? `Inv ${n.invoiceId.slice(0, 8)}` : `SO ${n.salesOrderId?.slice(0, 8)}`} · {n.status}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setPanelOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white"
                onClick={() => {
                  setError(null);
                  createRun.mutate();
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {assignRun && canWrite && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Assign notes to run</h2>
            <p className="mt-1 text-xs text-slate-500">{assignRun.runDate}</p>
            <div className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
              {(notes.data ?? []).map((n) => {
                if (n.status === 'delivered') return null;
                const onThis = assignRun.deliveryNoteIds?.includes(n.id);
                const free = !n.deliveryRunId || onThis;
                if (!free) return null;
                return (
                  <label key={n.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedNotes.has(n.id)}
                      onChange={(e) => {
                        setSelectedNotes((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(n.id);
                          else next.delete(n.id);
                          return next;
                        });
                      }}
                    />
                    {n.invoiceId ? `Inv ${n.invoiceId.slice(0, 8)}` : `SO ${n.salesOrderId?.slice(0, 8)}`} · {n.status}
                  </label>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setAssignRun(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white"
                onClick={() => {
                  setError(null);
                  patchRun.mutate();
                }}
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
