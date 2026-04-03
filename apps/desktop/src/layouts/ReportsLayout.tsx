import { Outlet } from 'react-router-dom';
import { ReportsSubNav } from '../components/ReportsSubNav';

export function ReportsLayout() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Reporting &amp; analytics</h1>
      <p className="mt-1 text-slate-600">
        Operational, aging, and tax reports; financial statements live under Accounting.
      </p>
      <ReportsSubNav />
      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  );
}
