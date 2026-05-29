import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { toggleSidebar } from '../store/slices/appSlice';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { hasPermission } from '../lib/permissions';

type LinkMenuItem = {
  type: 'link';
  path: string;
  label: string;
  icon: string;
  permission: string | null;
  anyOf?: string[];
};

type GroupMenuItem = {
  type: 'group';
  label: string;
  icon: string;
  items: LinkMenuItem[];
};

type MenuItem = LinkMenuItem | GroupMenuItem;

const menuItems: MenuItem[] = [
  { type: 'link', path: '/', label: 'Dashboard', icon: '📊', permission: null },
  { type: 'link', path: '/sales/quotations', label: 'Sales', icon: '🧾', permission: 'sales:read' },
  {
    type: 'link',
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
  { type: 'link', path: '/inventory/stock', label: 'Inventory', icon: '🗃️', permission: 'inventory:read' },
  { type: 'link', path: '/accounting/coa', label: 'Accounting', icon: '📒', permission: 'accounting:read' },
  {
    type: 'link',
    path: '/reports',
    label: 'Reports',
    icon: '📑',
    permission: null,
    anyOf: ['sales:read', 'purchases.reports:read', 'accounting:read', 'inventory:read'],
  },
  {
    type: 'link',
    path: '/import',
    label: 'Import',
    icon: '📥',
    permission: null,
    anyOf: ['masters.products:write', 'masters.customers:write', 'inventory:write'],
  },
  {
    type: 'group',
    label: 'Definations',
    icon: '🗂️',
    items: [
      { type: 'link', path: '/masters/product-categories', label: 'Categories', icon: '🌳', permission: 'masters.products:read' },
      { type: 'link', path: '/masters/products', label: 'Products', icon: '📦', permission: 'masters.products:read' },
      { type: 'link', path: '/masters/units', label: 'Units', icon: '📏', permission: 'masters.products:read' },
      { type: 'link', path: '/masters/price-levels', label: 'Price levels', icon: '💰', permission: 'masters.products:read' },
      { type: 'link', path: '/masters/bonus-rules', label: 'Bonus rules', icon: '🎁', permission: 'masters.products:read' },
      { type: 'link', path: '/masters/customers', label: 'Customers', icon: '👤', permission: 'masters.customers:read' },
      { type: 'link', path: '/masters/customer-types', label: 'Customer types', icon: '🏷️', permission: 'masters.customers:read' },
      { type: 'link', path: '/masters/towns-areas', label: 'Towns & areas', icon: '📍', permission: 'masters.customers:read' },
      { type: 'link', path: '/masters/suppliers', label: 'Suppliers', icon: '🏭', permission: 'masters.suppliers:read' },
      { type: 'link', path: '/masters/warehouses', label: 'Warehouses', icon: '🏢', permission: 'masters.warehouses:read' },
      { type: 'link', path: '/masters/salespersons', label: 'Salespersons', icon: '🧑‍💼', permission: 'masters.salespersons:read' },
      { type: 'link', path: '/masters/tax-profiles', label: 'Tax profiles', icon: '🧾', permission: 'masters.tax:read' },
      { type: 'link', path: '/masters/payment-terms', label: 'Payment terms', icon: '📅', permission: 'masters.payment_terms:read' },
    ],
  },
  { type: 'link', path: '/settings', label: 'Settings', icon: '⚙️', permission: 'settings:read' },
  { type: 'link', path: '/audit-logs', label: 'Audit Logs', icon: '📋', permission: 'audit:read' },
  { type: 'link', path: '/recycle-bin', label: 'Recycle bin', icon: '♻️', permission: 'recycle_bin:read' },
];

export function Sidebar() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const open = useAppSelector((s) => s.app.sidebarOpen);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const hasAccess = (item: LinkMenuItem) => {
    if (item.anyOf?.length) return item.anyOf.some((c) => hasPermission(permissions, c));
    if (!item.permission) return true;
    return hasPermission(permissions, item.permission);
  };

  const filtered = useMemo(
    () =>
      menuItems
        .map((item) => {
          if (item.type === 'group') {
            const visibleItems = item.items.filter(hasAccess);
            if (!visibleItems.length) return null;
            return { ...item, items: visibleItems };
          }
          return hasAccess(item) ? item : null;
        })
        .filter((item): item is MenuItem => item !== null),
    [permissions],
  );

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next: Record<string, boolean> = {};
      filtered.forEach((item) => {
        if (item.type !== 'group') return;
        next[item.label] = prev[item.label] ?? true;
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      if (nextKeys.every((key) => prev[key] === next[key])) return prev;
      return next;
    });
  }, [filtered]);

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
        {filtered.map((item) => {
          if (item.type === 'group') {
            const groupActive = item.items.some((child) => location.pathname === child.path);
            const isExpanded = expandedGroups[item.label] ?? true;
            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((prev) => {
                      const currentlyExpanded = prev[item.label] ?? true;
                      const next: Record<string, boolean> = {};
                      filtered.forEach((entry) => {
                        if (entry.type !== 'group') return;
                        next[entry.label] = false;
                      });
                      next[item.label] = !currentlyExpanded;
                      return next;
                    })
                  }
                  aria-expanded={isExpanded}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                    groupActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {open && (
                    <>
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="ml-auto text-xs">{isExpanded ? '▾' : '▸'}</span>
                    </>
                  )}
                </button>
                {open &&
                  isExpanded &&
                  item.items.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      end={child.path === '/'}
                      className={({ isActive }) =>
                        `ml-7 flex items-center gap-2 rounded-lg px-3 py-2 ${
                          isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`
                      }
                    >
                      <span className="text-base">{child.icon}</span>
                      <span className="text-sm">{child.label}</span>
                    </NavLink>
                  ))}
              </div>
            );
          }

          return (
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
          );
        })}
      </nav>
    </aside>
  );
}
