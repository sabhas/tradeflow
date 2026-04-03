import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { logout, setSession } from '../store/slices/authSlice';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { apiFetch } from '../api/client';

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    branchId?: string;
    createdAt: string;
    updatedAt: string;
  };
  permissions: string[];
  branches: Array<{ branchId: string; name: string; code: string; isDefault: boolean }>;
}

export function Header() {
  const user = useAppSelector((s) => s.auth.user);
  const branches = useAppSelector((s) => s.auth.branches);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const notif = useQuery({
    queryKey: ['notifications', 'header'],
    queryFn: () =>
      apiFetch<{ data: { id: string; title: string; readAt: string | null }[]; meta: { unread: number } }>(
        '/notifications?limit=8'
      ),
    refetchInterval: 60_000,
  });

  const switchBranch = useMutation({
    mutationFn: (branchId: string) =>
      apiFetch<MeResponse>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ branchId }),
      }),
    onSuccess: (data) => {
      dispatch(
        setSession({
          user: data.user,
          permissions: data.permissions,
          branches: data.branches,
        })
      );
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const unread = notif.data?.meta.unread ?? 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        {branches.length > 1 && user?.branchId ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="hidden sm:inline">Branch</span>
            <select
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800"
              value={user.branchId}
              disabled={switchBranch.isPending}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v !== user.branchId) switchBranch.mutate(v);
              }}
            >
              {branches.map((b) => (
                <option key={b.branchId} value={b.branchId}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        <span
          className="relative inline-flex text-lg text-slate-600"
          title={unread ? `${unread} unread notifications` : 'No unread notifications'}
        >
          &#128276;
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-indigo-600 px-1 text-center text-[10px] font-semibold leading-tight text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </span>
        <span className="text-sm text-slate-600">{user?.name || user?.email}</span>
        <button
          onClick={handleLogout}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
