import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { logout } from '../store/slices/authSlice';
import { setTheme } from '../store/slices/appSlice';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { apiFetch } from '../api/client';

export function Header() {
  const user = useAppSelector((s) => s.auth.user);
  const theme = useAppSelector((s) => s.app.theme);
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
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3" />
      <div className="flex items-center gap-3">
        <div
          className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
          role="group"
          aria-label="Color theme"
        >
          <button
            type="button"
            onClick={() => dispatch(setTheme('light'))}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              theme === 'light'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() => dispatch(setTheme('dark'))}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              theme === 'dark'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Dark
          </button>
        </div>
        <span
          className="relative inline-flex text-lg text-slate-600 dark:text-slate-400"
          title={unread ? `${unread} unread notifications` : 'No unread notifications'}
        >
          &#128276;
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-indigo-600 px-1 text-center text-[10px] font-semibold leading-tight text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </span>
        <span className="text-sm text-slate-600 dark:text-slate-300">{user?.name || user?.email}</span>
        <button
          onClick={handleLogout}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
