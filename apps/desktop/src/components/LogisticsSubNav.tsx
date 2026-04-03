import { NavLink } from 'react-router-dom';

const links = [
  { to: '/logistics/routes', label: 'Routes' },
  { to: '/logistics/runs', label: 'Delivery runs' },
  { to: '/logistics/delivery-notes', label: 'Delivery notes' },
  { to: '/logistics/reports', label: 'Reports' },
] as const;

export function LogisticsSubNav() {
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
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
