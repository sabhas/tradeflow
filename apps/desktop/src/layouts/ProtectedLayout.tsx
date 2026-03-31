import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { useAppSelector } from '../hooks/useAppSelector';

export function ProtectedLayout() {
  const sidebarOpen = useAppSelector((s) => s.app.sidebarOpen);

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className={`flex flex-col flex-1 min-w-0 transition-all ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
