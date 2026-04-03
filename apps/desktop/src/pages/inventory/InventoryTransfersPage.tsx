import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { InventorySubNav } from '../../components/InventorySubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface TransferRow {
  id: string;
  transferDate: string;
  status: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  fromWarehouse?: { name: string; code: string };
  toWarehouse?: { name: string; code: string };
}

type Line = { productId: string; quantity: string };

export function InventoryTransfersPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'inventory:read');
  const canWrite = hasPermission(permissions, 'inventory:write');
  const qc = useQueryClient();

  const [panelOpen, setPanelOpen] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '1' }]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['stock-transfers'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: TransferRow[] }>('/stock-transfers').then((r) => r.data),
  });

  const warehouses = useQuery({
    queryKey: ['warehouses'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; name: string; code: string }> }>('/warehouses').then((r) => r.data),
  });

  const products = useQuery({
    queryKey: ['products', 'transfer-dd'],
    enabled: canRead && panelOpen,
    queryFn: () => apiFetch<{ data: Array<{ id: string; sku: string; name: string }> }>('/products?limit=500').then((r) => r.data),
  });

  useEffect(() => {
    if (!panelOpen || fromWarehouseId || !warehouses.data?.length) return;
    setFromWarehouseId(warehouses.data[0].id);
  }, [panelOpen, fromWarehouseId, warehouses.data]);

  useEffect(() => {
    if (!panelOpen || toWarehouseId || !warehouses.data || warehouses.data.length < 2) return;
    const second = warehouses.data.find((w) => w.id !== fromWarehouseId) ?? warehouses.data[1];
    setToWarehouseId(second.id);
  }, [panelOpen, toWarehouseId, warehouses.data, fromWarehouseId]);

  const createTransfer = useMutation({
    mutationFn: async () => {
      setError(null);
      const cleaned = lines.filter((l) => l.productId && parseFloat(l.quantity) > 0);
      if (!fromWarehouseId || !toWarehouseId) throw new Error('Select both warehouses');
      if (fromWarehouseId === toWarehouseId) throw new Error('Warehouses must differ');
      if (cleaned.length === 0) throw new Error('Add at least one line');
      await apiFetch('/stock-transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromWarehouseId,
          toWarehouseId,
          transferDate,
          notes: notes.trim() || null,
          lines: cleaned.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setPanelOpen(false);
      setLines([{ productId: '', quantity: '1' }]);
      setNotes('');
    },
    onError: (e: Error) => setError(e.message || 'Failed'),
  });

  const postTransfer = useMutation({
    mutationFn: (id: string) => apiFetch(`/stock-transfers/${id}/post`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Stock transfers</h1>
      <p className="mt-1 text-slate-600">
        Move stock between warehouses using FIFO/LIFO/FEFO layer costs (expiry-tracked products use FEFO).
      </p>
      <InventorySubNav />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      {canWrite && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {panelOpen ? 'Cancel' : 'New transfer'}
          </button>
        </div>
      )}

      {panelOpen && canWrite && (
        <div className="mb-8 max-w-3xl space-y-4 rounded-lg bg-white p-6 shadow ring-1 ring-slate-200">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">From warehouse</span>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
              >
                <option value="">—</option>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">To warehouse</span>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
              >
                <option value="">—</option>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Transfer date</span>
              <input
                type="date"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-slate-600">Notes (optional)</span>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Lines</p>
            {lines.map((line, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2">
                <select
                  className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={line.productId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, productId: v } : x)));
                  }}
                >
                  <option value="">Product</option>
                  {(products.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                <input
                  className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                  }}
                />
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-indigo-600 hover:underline"
              onClick={() => setLines((prev) => [...prev, { productId: '', quantity: '1' }])}
            >
              + Add line
            </button>
          </div>

          <button
            type="button"
            disabled={createTransfer.isPending}
            onClick={() => createTransfer.mutate()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Save draft
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{t.transferDate}</td>
                <td className="px-3 py-2">{t.fromWarehouse?.name ?? t.fromWarehouseId}</td>
                <td className="px-3 py-2">{t.toWarehouse?.name ?? t.toWarehouseId}</td>
                <td className="px-3 py-2 capitalize">{t.status}</td>
                <td className="px-3 py-2">
                  {canWrite && t.status === 'draft' && (
                    <button
                      type="button"
                      disabled={postTransfer.isPending}
                      onClick={() => {
                        if (confirm('Post this transfer? Stock will move between warehouses.')) postTransfer.mutate(t.id);
                      }}
                      className="text-indigo-600 hover:underline"
                    >
                      Post
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(list.data ?? []).length === 0 && (
          <p className="px-3 py-6 text-center text-slate-500">No transfers yet.</p>
        )}
      </div>
    </div>
  );
}
