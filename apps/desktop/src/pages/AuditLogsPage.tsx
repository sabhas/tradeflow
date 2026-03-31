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

export function AuditLogsPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiFetch<AuditLog[]>('/audit-logs'),
  });

  if (isLoading) return <div className="text-slate-600">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Audit Logs</h1>
      <p className="mt-1 text-slate-600">Recent activity across the system</p>
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Time</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">User</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Action</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Entity</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {(logs || []).map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm">{log.userId}</td>
                <td className="px-4 py-3 text-sm">{log.action}</td>
                <td className="px-4 py-3 text-sm">{log.entity}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{log.entityId || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!logs || logs.length === 0) && (
          <div className="py-12 text-center text-slate-500">No audit entries yet</div>
        )}
      </div>
    </div>
  );
}
