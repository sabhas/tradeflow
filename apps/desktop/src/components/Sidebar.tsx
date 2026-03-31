import { NavLink } from 'react-router-dom';
import { useAppSelector } from '../hooks/useAppSelector';
import { toggleSidebar } from '../store/slices/appSlice';
import { useAppDispatch } from '../hooks/useAppDispatch';


const menuItems = [
  { path: '/', label: 'Dashboard', icon: '📊', permission: null },
  { path: '/audit-logs', label: 'Audit Logs', icon: '📋', permission: 'audit:read' },
];

export function Sidebar() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const open = useAppSelector((s) => s.app.sidebarOpen);
  const dispatch = useAppDispatch();

  const filtered = menuItems.filter((item) => {
    if (!item.permission) return true;
    return permissions.includes(item.permission);
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
      <nav className="mt-4 space-y-1 px-2">
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
            {open && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
