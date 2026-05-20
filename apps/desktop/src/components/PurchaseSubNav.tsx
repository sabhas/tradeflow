import { NavLink } from 'react-router-dom';

const links = [
  { to: '/purchases/orders', label: 'Purchase orders' },
  { to: '/purchases/grns', label: 'Goods receipt (GRN)' },
  { to: '/purchases/returns', label: 'Purchase returns' },
  { to: '/purchases/invoices', label: 'Supplier invoices' },
  { to: '/purchases/payments', label: 'Payments' },
  { to: '/purchases/reports', label: 'Statement & aging' },
] as const;

export function PurchaseSubNav() {
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
          {l.label}
        </NavLink>
      ))}
    </div>
  );
}
