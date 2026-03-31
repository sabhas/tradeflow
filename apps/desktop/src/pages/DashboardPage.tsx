import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { logout } from '../store/slices/authSlice';
import { apiFetch } from '../api/client';

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { data: me, isError, error } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<{ user: unknown }>('/auth/me'),
    retry: false,
  });

  useEffect(() => {
    if (isError && error) {
      const msg = (error as Error).message?.toLowerCase() || '';
      if (msg.includes('401') || msg.includes('unauthorized')) {
        dispatch(logout());
        navigate('/login');
      }
    }
  }, [isError, error, dispatch, navigate]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Welcome, {me?.user ? (me.user as { name: string }).name : user?.name}.
      </p>
      <div className="mt-6 rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-medium text-slate-700">Quick start</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your TradeFlow distribution app is ready. Navigate using the sidebar.
        </p>
      </div>
    </div>
  );
}
