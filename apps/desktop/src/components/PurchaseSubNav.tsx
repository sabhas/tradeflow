import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { hasPermission } from '../lib/permissions';
import { useAppSelector } from '../hooks/useAppSelector';

const links = [
  { to: '/purchases/orders', label: 'Purchase orders' },
  { to: '/purchases/grns', label: 'Goods receipt (GRN)' },
  { to: '/purchases/returns', label: 'Purchase returns' },
  { to: '/purchases/invoices', label: 'Supplier invoices', badgeKey: 'invoices' as const },
  { to: '/purchases/payments', label: 'Payments' },
  { to: '/purchases/reports', label: 'Statement & aging' },
] as const;

export function PurchaseSubNav() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canGrn = hasPermission(permissions, 'purchases.grn:read');

  const pending = useQuery({
    queryKey: ['grns', 'pending-invoice-count'],
    enabled: canGrn,
    queryFn: () => apiFetch<{ data: { count: number } }>('/grns/pending-invoice-count').then((r) => r.data.count),
    refetchInterval: 120_000,
  });

  const pendingCount = pending.data ?? 0;

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`
          }
        >
          <span className="inline-flex items-center gap-1.5">
            {l.label}
            {'badgeKey' in l && l.badgeKey === 'invoices' && pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </span>
        </NavLink>
      ))}
    </div>
  );
}
