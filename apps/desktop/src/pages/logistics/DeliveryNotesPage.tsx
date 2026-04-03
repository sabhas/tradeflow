import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../api/client';
import { LogisticsSubNav } from '../../components/LogisticsSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface NoteRow {
  id: string;
  invoiceId?: string;
  salesOrderId?: string;
  status: string;
  deliveryDate?: string;
  deliveryRunId?: string | null;
}

export function DeliveryNotesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'logistics.deliveries:read');
  const canWrite = hasPermission(permissions, 'logistics.deliveries:write');
  const canPod = canWrite || hasPermission(permissions, 'logistics.pod:write');
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [source, setSource] = useState<'invoice' | 'order'>('invoice');
  const [invoiceId, setInvoiceId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [podNote, setPodNote] = useState<NoteRow | null>(null);
  const [podType, setPodType] = useState<'photo' | 'signature'>('photo');
  const [podRef, setPodRef] = useState('');

  const list = useQuery({
    queryKey: ['delivery-notes', statusFilter],
    enabled: canRead,
    queryFn: () => {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}&limit=200` : '?limit=200';
      return apiFetch<{ data: NoteRow[] }>(`/delivery-notes${q}`).then((r) => r.data);
    },
  });

  const invoices = useQuery({
    queryKey: ['invoices', 'dn-dd'],
    enabled: canRead && createOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; invoiceDate: string; status: string }> }>('/invoices?limit=200').then((r) => r.data),
  });

  const orders = useQuery({
    queryKey: ['sales-orders', 'dn-dd'],
    enabled: canRead && createOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; orderDate: string; status: string }> }>('/sales-orders?limit=200').then((r) => r.data),
  });

  const createDn = useMutation({
    mutationFn: async () => {
      if (source === 'invoice') {
        if (!invoiceId) throw new Error('Select invoice');
        await apiFetch('/delivery-notes', {
          method: 'POST',
          body: JSON.stringify({ invoiceId }),
        });
      } else {
        if (!orderId) throw new Error('Select order');
        await apiFetch('/delivery-notes', {
          method: 'POST',
          body: JSON.stringify({ salesOrderId: orderId }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      setCreateOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiFetch(`/delivery-notes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-notes'] }),
    onError: (e: Error) => setError(e.message),
  });

  const submitPod = useMutation({
    mutationFn: async () => {
      if (!podNote || !podRef.trim()) throw new Error('Add signature / image data');
      await apiFetch(`/delivery-notes/${podNote.id}/pod`, {
        method: 'POST',
        body: JSON.stringify({ type: podType, reference: podRef.trim(), notes: null }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      setPodNote(null);
      setPodRef('');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Delivery notes</h1>
          <p className="mt-1 text-slate-600">Create from invoice or order, dispatch, and capture POD</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            New delivery note
          </button>
        )}
      </div>
      <LogisticsSubNav />
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      <div className="mt-4 flex items-center gap-2">
        <label className="text-sm text-slate-600">
          Status
          <select
            className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
          </select>
        </label>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Run</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((n) => (
              <tr key={n.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  {n.invoiceId ? `Invoice ${n.invoiceId.slice(0, 8)}` : `Order ${n.salesOrderId?.slice(0, 8)}`}
                </td>
                <td className="px-4 py-3 capitalize">{n.status}</td>
                <td className="px-4 py-3 font-mono text-xs">{n.deliveryRunId ? n.deliveryRunId.slice(0, 8) : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {canWrite && n.status === 'pending' && (
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => patchStatus.mutate({ id: n.id, status: 'dispatched' })}
                    >
                      Dispatch
                    </button>
                  )}
                  {canPod && n.status !== 'delivered' && (
                    <button
                      type="button"
                      className="ml-3 text-green-700 hover:underline"
                      onClick={() => {
                        setPodNote(n);
                        setPodRef('');
                        setError(null);
                      }}
                    >
                      POD
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && canWrite && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">New delivery note</h2>
            <div className="mt-4 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={source === 'invoice'} onChange={() => setSource('invoice')} />
                From invoice
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={source === 'order'} onChange={() => setSource('order')} />
                From sales order
              </label>
            </div>
            {source === 'invoice' ? (
              <label className="mt-4 block text-sm">
                <span className="text-slate-600">Invoice</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                >
                  <option value="">—</option>
                  {(invoices.data ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceDate} · {i.status} · {i.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="mt-4 block text-sm">
                <span className="text-slate-600">Sales order</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                >
                  <option value="">—</option>
                  {(orders.data ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderDate} · {o.status} · {o.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white"
                onClick={() => {
                  setError(null);
                  createDn.mutate();
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {podNote && canPod && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Proof of delivery</h2>
            <p className="mt-1 text-xs text-slate-500">Paste a data URL (image) or short signature text; marks note delivered.</p>
            <div className="mt-4 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={podType === 'photo'} onChange={() => setPodType('photo')} />
                Photo
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={podType === 'signature'} onChange={() => setPodType('signature')} />
                Signature
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="text-slate-600">Reference</span>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                rows={4}
                value={podRef}
                onChange={(e) => setPodRef(e.target.value)}
                placeholder="data:image/png;base64,... or signer name / notes"
              />
            </label>
            <div className="mt-2">
              <input
                type="file"
                accept="image/*"
                className="text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setPodRef(typeof r.result === 'string' ? r.result : '');
                  r.readAsDataURL(f);
                }}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setPodNote(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-green-700 px-4 py-2 text-sm text-white"
                onClick={() => {
                  setError(null);
                  submitPod.mutate();
                }}
              >
                Save POD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
