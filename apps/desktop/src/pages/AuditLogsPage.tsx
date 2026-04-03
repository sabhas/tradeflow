import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

interface AuditListResponse {
  data: AuditLog[];
  meta: { total: number; limit: number; offset: number };
}

const PAGE_SIZE = 50;

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) {
    return <span className="text-slate-400">—</span>;
  }
  const text = JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">{text}</pre>
  );
}

export function AuditLogsPage() {
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const offset = page * PAGE_SIZE;

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    q.set('limit', String(PAGE_SIZE));
    q.set('offset', String(offset));
    if (entity.trim()) q.set('entity', entity.trim());
    if (entityId.trim()) q.set('entityId', entityId.trim());
    if (userId.trim()) q.set('userId', userId.trim());
    if (dateFrom) q.set('dateFrom', dateFrom);
    if (dateTo) q.set('dateTo', dateTo);
    return q.toString();
  }, [entity, entityId, userId, dateFrom, dateTo, offset]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-logs', queryString],
    queryFn: () => apiFetch<AuditListResponse>(`/audit-logs?${queryString}`),
  });

  const logs = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Audit logs</h1>
      <p className="mt-1 text-slate-600">Append-only history of create, update, and delete operations.</p>

      <div className="mt-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Entity</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
            placeholder="e.g. Product"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Entity id</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 shadow-sm"
            placeholder="UUID"
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">User id</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 shadow-sm"
            placeholder="UUID"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">From (ISO date/time)</span>
          <input
            type="datetime-local"
            className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">To (ISO date/time)</span>
          <input
            type="datetime-local"
            className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Loading…</div>
        ) : (
          <table className="min-w-full table-fixed">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-10 px-2 py-3" />
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Time</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Action</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Entity</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((log) => {
                const open = expanded.has(log.id);
                return (
                  <Fragment key={log.id}>
                    <tr>
                      <td className="px-2 py-2 align-top">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => toggleRow(log.id)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        >
                          {open ? '▼' : '▶'}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top text-sm text-slate-600">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-slate-700">{log.userId}</td>
                      <td className="px-4 py-3 align-top text-sm">{log.action}</td>
                      <td className="px-4 py-3 align-top text-sm">{log.entity}</td>
                      <td className="px-4 py-3 align-top font-mono text-xs text-slate-500">
                        {log.entityId || '—'}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/90">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <div className="mb-1 text-xs font-medium uppercase text-slate-500">Old value</div>
                              <JsonBlock value={log.oldValue} />
                            </div>
                            <div>
                              <div className="mb-1 text-xs font-medium uppercase text-slate-500">New value</div>
                              <JsonBlock value={log.newValue} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {logs.length === 0 && !isLoading && (
          <div className="py-12 text-center text-slate-500">No audit entries match your filters</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
        <span>
          {total === 0 ? '0 entries' : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
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
    </div>
  );
}
