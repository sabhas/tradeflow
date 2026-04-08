import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { logout } from '../store/slices/authSlice';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { apiFetch } from '../api/client';

export function Header() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const notif = useQuery({
    queryKey: ['notifications', 'header'],
    queryFn: () =>
      apiFetch<{ data: { id: string; title: string; readAt: string | null }[]; meta: { unread: number } }>(
        '/notifications?limit=8'
      ),
    refetchInterval: 60_000,
  });

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const unread = notif.data?.meta.unread ?? 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3" />
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
