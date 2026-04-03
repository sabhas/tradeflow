import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useAppSelector } from '../hooks/useAppSelector';
import { hasPermission } from '../lib/permissions';

const ENTITY_TYPES = ['Product', 'Customer', 'Supplier', 'Invoice', 'JournalEntry'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

interface RecycleRow {
  id: string;
  label: string;
  deletedAt: string;
}

interface ListResponse {
  data: RecycleRow[];
  meta: { total: number; limit: number; offset: number; entity: EntityType };
}

const PAGE_SIZE = 50;

export function RecycleBinPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRestore = hasPermission(permissions, 'recycle_bin:restore');
  const [entity, setEntity] = useState<EntityType>('Product');
  const [page, setPage] = useState(0);
  const qc = useQueryClient();

  const offset = page * PAGE_SIZE;

  const listParams = useMemo(() => {
    const q = new URLSearchParams();
    q.set('entity', entity);
    q.set('limit', String(PAGE_SIZE));
    q.set('offset', String(offset));
    return q.toString();
  }, [entity, offset]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['recycle-bin', entity, offset],
    queryFn: () => apiFetch<ListResponse>(`/recycle-bin?${listParams}`),
  });

  const restore = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: { id: string; restored: boolean } }>(
        `/recycle-bin/${entity}/${id}/restore`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recycle-bin'] });
    },
  });

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Recycle bin</h1>
      <p className="mt-1 text-slate-600">
        Soft-deleted records can be restored here. Purge / retention policies are not enabled yet.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Entity type</span>
          <select
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value as EntityType);
              setPage(0);
            }}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Loading…</div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Deleted</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Label</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Id</th>
                {canRestore && (
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-700">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {new Date(r.deletedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-800">{r.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.id}</td>
                  {canRestore && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={restore.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Restore this ${entity}?\n\n${r.label}\n\nThis will make it visible in normal lists again.`
                            )
                          ) {
                            return;
                          }
                          restore.mutate(r.id);
                        }}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        Restore
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length === 0 && !isLoading && (
          <div className="py-12 text-center text-slate-500">No deleted items for this type</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
        <span>
          {total === 0 ? '0 items' : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          {isFetching && !isLoading ? ' · updating…' : ''}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {restore.isError && (
        <p className="mt-4 text-sm text-red-600">
          {(restore.error as Error)?.message || 'Restore failed'}
        </p>
      )}
    </div>
  );
}
