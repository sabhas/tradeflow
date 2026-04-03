import { NavLink } from 'react-router-dom';
import { hasPermission } from '../lib/permissions';
import { useAppSelector } from '../hooks/useAppSelector';

export function ReportsSubNav() {
  const permissions = useAppSelector((s) => s.auth.permissions);

  const links: Array<{ to: string; label: string; visible: boolean }> = [
    { to: '/reports', label: 'Overview', visible: true },
    {
      to: '/reports/operational',
      label: 'Operational',
      visible:
        hasPermission(permissions, 'sales:read') || hasPermission(permissions, 'inventory:read'),
    },
    {
      to: '/reports/aging',
      label: 'Aging',
      visible:
        hasPermission(permissions, 'sales:read') ||
        hasPermission(permissions, 'purchases.reports:read'),
    },
    {
      to: '/reports/tax',
      label: 'Tax',
      visible:
        hasPermission(permissions, 'sales:read') ||
        hasPermission(permissions, 'purchases.reports:read'),
    },
    {
      to: '/accounting/reports',
      label: 'Financial',
      visible: hasPermission(permissions, 'accounting:read'),
    },
  ];

  return (
    <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {links
        .filter((l) => l.visible)
        .map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/reports'}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm font-medium ${
                isActive ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
    </div>
  );
}
