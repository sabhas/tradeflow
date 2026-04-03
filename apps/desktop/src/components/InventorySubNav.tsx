import { NavLink } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { hasPermission } from '../lib/permissions';

const links: Array<{ to: string; label: string; permission: string }> = [
  { to: '/inventory/stock', label: 'Stock', permission: 'inventory:read' },
  { to: '/inventory/movements', label: 'Movements', permission: 'inventory:read' },
  { to: '/inventory/opening-balance', label: 'Opening balance', permission: 'inventory:write' },
  { to: '/inventory/adjustment', label: 'Adjustment', permission: 'inventory:write' },
];

export function InventorySubNav() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const visible = links.filter((l) => hasPermission(permissions, l.permission));

  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {visible.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-sm font-medium ${
              isActive ? 'bg-indigo-100 text-indigo-900' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </div>
  );
}
