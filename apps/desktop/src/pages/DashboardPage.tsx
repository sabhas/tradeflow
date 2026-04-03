import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { logout, setSession } from '../store/slices/authSlice';
import { apiFetch } from '../api/client';
import { hasPermission } from '../lib/permissions';

function fmtMoney(s: string) {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const permissions = useAppSelector((s) => s.auth.permissions);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const canKpi =
    hasPermission(permissions, 'sales:read') || hasPermission(permissions, 'purchases.reports:read');

  const { data: me, isError, error } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () =>
      apiFetch<{
        user: {
          id: string;
          email: string;
          name: string;
          branchId?: string;
          createdAt: string;
          updatedAt: string;
        };
        branches: Array<{ branchId: string; name: string; code: string; isDefault: boolean }>;
        permissions: string[];
      }>('/auth/me'),
    retry: false,
  });

  useEffect(() => {
    if (!me) return;
    dispatch(
      setSession({
        user: me.user,
        branches: me.branches,
        permissions: me.permissions,
      })
    );
  }, [me, dispatch]);

  const kpis = useQuery({
    queryKey: ['reports', 'dashboard-kpis'],
    queryFn: () =>
      apiFetch<{
        data: {
          asOfDate: string;
          monthStart: string;
          salesToday: string;
          salesMtd: string;
          purchasesToday: string;
          purchasesMtd: string;
          invoicesPostedToday: number;
          arOpen: string;
          apOpen: string;
          agingReceivables: {
            arCurrent: string;
            ar1_30: string;
            ar31_60: string;
            ar61_90: string;
            ar90p: string;
          };
        };
        meta: { partial?: { sales?: boolean; purchases?: boolean } };
      }>('/reports/dashboard/kpis'),
    enabled: canKpi,
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

  const d = kpis.data?.data;
  const partial = kpis.data?.meta?.partial;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Welcome, {me?.user ? (me.user as { name: string }).name : user?.name}.
        </p>
      </div>

      {!canKpi ? (
        <p className="text-sm text-slate-500">You do not have access to operational KPIs (sales or purchase reports).</p>
      ) : kpis.isError ? (
        <p className="text-sm text-red-600">{(kpis.error as Error)?.message || 'Could not load KPIs'}</p>
      ) : kpis.isLoading ? (
        <p className="text-sm text-slate-500">Loading KPIs…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {!partial?.sales ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sales (today)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{fmtMoney(d?.salesToday ?? '0')}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sales (MTD)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{fmtMoney(d?.salesMtd ?? '0')}</p>
                  <p className="mt-1 text-xs text-slate-500">From {d?.monthStart}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoices posted today</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{d?.invoicesPostedToday ?? 0}</p>
                </div>
              </>
            ) : null}
            {!partial?.purchases ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Purchases (today)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{fmtMoney(d?.purchasesToday ?? '0')}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Purchases (MTD)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{fmtMoney(d?.purchasesMtd ?? '0')}</p>
                </div>
              </>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {!partial?.sales ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-medium text-slate-800">Receivables</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Open AR (credit invoices):{' '}
                  <span className="font-semibold text-slate-900">{fmtMoney(d?.arOpen ?? '0')}</span>
                </p>
                <p className="mt-4 text-xs font-medium uppercase text-slate-500">Aging (as of {d?.asOfDate})</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <div>
                    <span className="text-slate-500">Current</span>
                    <div className="font-medium">{fmtMoney(d?.agingReceivables.arCurrent ?? '0')}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">1–30</span>
                    <div className="font-medium">{fmtMoney(d?.agingReceivables.ar1_30 ?? '0')}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">31–60</span>
                    <div className="font-medium">{fmtMoney(d?.agingReceivables.ar31_60 ?? '0')}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">61–90</span>
                    <div className="font-medium">{fmtMoney(d?.agingReceivables.ar61_90 ?? '0')}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">90+</span>
                    <div className="font-medium">{fmtMoney(d?.agingReceivables.ar90p ?? '0')}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {!partial?.purchases ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-medium text-slate-800">Payables</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Open AP: <span className="font-semibold text-slate-900">{fmtMoney(d?.apOpen ?? '0')}</span>
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-medium text-slate-800">Reports</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-indigo-700">
          <li>
            <Link to="/reports/operational" className="hover:underline">
              Operational reports
            </Link>{' '}
            (daily sales, fast movers)
          </li>
          <li>
            <Link to="/reports/aging" className="hover:underline">
              Aging
            </Link>
          </li>
          <li>
            <Link to="/accounting/reports" className="hover:underline">
              Financial reports
            </Link>{' '}
            (P&amp;L, cash flow API under accounting)
          </li>
        </ul>
      </div>
    </div>
  );
}
