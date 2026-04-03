import { NavLink } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { toggleSidebar } from '../store/slices/appSlice';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { hasPermission } from '../lib/permissions';

const menuItems: Array<{
  path: string;
  label: string;
  icon: string;
  permission: string | null;
  anyOf?: string[];
}> = [
  { path: '/', label: 'Dashboard', icon: '📊', permission: null },
  { path: '/audit-logs', label: 'Audit Logs', icon: '📋', permission: 'audit:read' },
  { path: '/masters/product-categories', label: 'Categories', icon: '🌳', permission: 'masters.products:read' },
  { path: '/masters/products', label: 'Products', icon: '📦', permission: 'masters.products:read' },
  { path: '/masters/units', label: 'Units', icon: '📏', permission: 'masters.products:read' },
  { path: '/masters/price-levels', label: 'Price levels', icon: '💰', permission: 'masters.products:read' },
  { path: '/masters/customers', label: 'Customers', icon: '👤', permission: 'masters.customers:read' },
  { path: '/masters/suppliers', label: 'Suppliers', icon: '🏭', permission: 'masters.suppliers:read' },
  { path: '/masters/warehouses', label: 'Warehouses', icon: '🏢', permission: 'masters.warehouses:read' },
  { path: '/masters/salespersons', label: 'Salespersons', icon: '🧑‍💼', permission: 'masters.salespersons:read' },
  { path: '/masters/tax-profiles', label: 'Tax profiles', icon: '🧾', permission: 'masters.tax:read' },
  { path: '/masters/payment-terms', label: 'Payment terms', icon: '📅', permission: 'masters.payment_terms:read' },
  { path: '/inventory/stock', label: 'Inventory', icon: '🗃️', permission: 'inventory:read' },
  { path: '/sales/quotations', label: 'Sales', icon: '🧾', permission: 'sales:read' },
  {
    path: '/purchases/orders',
    label: 'Purchases',
    icon: '📥',
    permission: null,
    anyOf: [
      'purchases.orders:read',
      'purchases.grn:read',
      'purchases.supplier_invoices:read',
      'purchases.payments:read',
      'purchases.reports:read',
    ],
  },
  { path: '/accounting/coa', label: 'Accounting', icon: '📒', permission: 'accounting:read' },
  {
    path: '/reports/tax',
    label: 'Tax reports',
    icon: '📑',
    permission: null,
    anyOf: ['sales:read', 'purchases.reports:read'],
  },
  {
    path: '/logistics/routes',
    label: 'Logistics',
    icon: '🚚',
    permission: null,
    anyOf: [
      'logistics.routes:read',
      'logistics.deliveries:read',
      'reports.logistics:read',
    ],
  },
];

export function Sidebar() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const open = useAppSelector((s) => s.app.sidebarOpen);
  const dispatch = useAppDispatch();

  const filtered = menuItems.filter((item) => {
    if (item.anyOf?.length) return item.anyOf.some((c) => hasPermission(permissions, c));
    if (!item.permission) return true;
    return hasPermission(permissions, item.permission);
  });

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-full bg-slate-900 text-white transition-all ${
        open ? 'w-64' : 'w-16'
      }`}
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-700 px-4">
        {open && <span className="font-semibold">TradeFlow</span>}
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="rounded p-1 hover:bg-slate-700"
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
      </div>
      <nav className="mt-4 space-y-1 overflow-y-auto px-2 pb-8" style={{ maxHeight: 'calc(100vh - 3.5rem)' }}>
        {filtered.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {open && <span className="text-sm">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
