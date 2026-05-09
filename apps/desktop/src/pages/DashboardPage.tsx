import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Pie,
  PieChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useMoneyFormat } from '../hooks/useMoneyFormat';
import { logout, setSession } from '../store/slices/authSlice';
import { apiFetch } from '../api/client';
import { hasPermission } from '../lib/permissions';
import { getChartTheme } from '../components/charts/chartTheme';

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const permissions = useAppSelector((s) => s.auth.permissions);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { formatMoney } = useMoneyFormat();

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
  const chartTheme = getChartTheme();
  const agingData = d
    ? [
        {
          name: 'Current',
          value: Number(d.agingReceivables.arCurrent || 0),
          key: 'arCurrent',
          fill: chartTheme.palette[0],
        },
        {
          name: '1-30',
          value: Number(d.agingReceivables.ar1_30 || 0),
          key: 'ar1_30',
          fill: chartTheme.palette[1],
        },
        {
          name: '31-60',
          value: Number(d.agingReceivables.ar31_60 || 0),
          key: 'ar31_60',
          fill: chartTheme.palette[2],
        },
        {
          name: '61-90',
          value: Number(d.agingReceivables.ar61_90 || 0),
          key: 'ar61_90',
          fill: chartTheme.palette[3],
        },
        {
          name: '90+',
          value: Number(d.agingReceivables.ar90p || 0),
          key: 'ar90p',
          fill: chartTheme.palette[4],
        },
      ]
    : [];
  const apArCompare = d
    ? [
        { label: 'AR', value: Number(d.arOpen || 0), fill: '#6366f1' },
        { label: 'AP', value: Number(d.apOpen || 0), fill: '#10b981' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
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
                <div className="rounded-lg border border-slate-200 border-l-4 border-l-indigo-500 bg-white p-4 shadow-sm dark:border-slate-800 dark:border-l-indigo-400 dark:bg-slate-900 dark:shadow-none">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sales (today)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(d?.salesToday)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 border-l-4 border-l-indigo-500 bg-white p-4 shadow-sm dark:border-slate-800 dark:border-l-indigo-400 dark:bg-slate-900 dark:shadow-none">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sales (MTD)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(d?.salesMtd)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">From {d?.monthStart}</p>
                </div>
                <div className="rounded-lg border border-slate-200 border-l-4 border-l-sky-500 bg-white p-4 shadow-sm dark:border-slate-800 dark:border-l-sky-400 dark:bg-slate-900 dark:shadow-none">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoices posted today</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {d?.invoicesPostedToday ?? 0}
                  </p>
                </div>
              </>
            ) : null}
            {!partial?.purchases ? (
              <>
                <div className="rounded-lg border border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm dark:border-slate-800 dark:border-l-emerald-400 dark:bg-slate-900 dark:shadow-none">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Purchases (today)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(d?.purchasesToday)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm dark:border-slate-800 dark:border-l-emerald-400 dark:bg-slate-900 dark:shadow-none">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Purchases (MTD)</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(d?.purchasesMtd)}
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {!partial?.sales ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Receivables</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Open AR (credit invoices):{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(d?.arOpen)}
                  </span>
                </p>
                <p className="mt-4 text-xs font-medium uppercase text-slate-500">Aging (as of {d?.asOfDate})</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={agingData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: chartTheme.tooltipBg,
                            borderColor: chartTheme.tooltipBorder,
                            borderRadius: 8,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {agingData.map((entry, index) => (
                      <div key={entry.key} className="rounded-md bg-slate-50 p-2 dark:bg-slate-800/60">
                        <div className="flex items-center gap-2 text-slate-500">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: chartTheme.palette[index % chartTheme.palette.length] }}
                          />
                          {entry.name}
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-100">{formatMoney(entry.value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {!partial?.purchases ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Payables</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Open AP:{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(d?.apOpen)}</span>
                </p>
                <div className="mt-4 h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apArCompare}>
                      <XAxis dataKey="label" stroke={chartTheme.axis} />
                      <YAxis stroke={chartTheme.axis} tickFormatter={(v) => formatMoney(v)} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartTheme.tooltipBg,
                          borderColor: chartTheme.tooltipBorder,
                          borderRadius: 8,
                        }}
                      />
                      <Bar
                        dataKey="value"
                        shape={(props) => (
                          <Rectangle
                            {...props}
                            fill={props.payload?.fill ?? chartTheme.palette[0]}
                            radius={[6, 6, 0, 0]}
                          />
                        )}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <h2 className="font-medium text-slate-800 dark:text-slate-100">Reports</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-indigo-700 dark:text-indigo-300">
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
