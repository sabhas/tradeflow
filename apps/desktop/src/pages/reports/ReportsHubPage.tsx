import { Link } from 'react-router-dom';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

type Card = { to: string; title: string; description: string; visible: boolean };

export function ReportsHubPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);

  const cards: Card[] = [
    {
      to: '/reports/operational',
      title: 'Operational',
      description: 'Daily sales, stock movement, and fast-moving products.',
      visible:
        hasPermission(permissions, 'sales:read') || hasPermission(permissions, 'inventory:read'),
    },
    {
      to: '/reports/aging',
      title: 'Receivables & payables aging',
      description: 'Open balances by aging bucket.',
      visible:
        hasPermission(permissions, 'sales:read') ||
        hasPermission(permissions, 'purchases.reports:read'),
    },
    {
      to: '/reports/tax',
      title: 'Tax',
      description: 'Tax collected, paid, and period summary.',
      visible:
        hasPermission(permissions, 'sales:read') ||
        hasPermission(permissions, 'purchases.reports:read'),
    },
    {
      to: '/accounting/reports',
      title: 'Financial statements',
      description: 'Trial balance, profit and loss, balance sheet, and expense analysis.',
      visible: hasPermission(permissions, 'accounting:read'),
    },
  ];

  const visible = cards.filter((c) => c.visible);

  if (visible.length === 0) {
    return <p className="text-slate-600">You do not have access to any reports.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((c) => (
        <Link
          key={c.to}
          to={c.to}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-slate-800">{c.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{c.description}</p>
        </Link>
      ))}
    </div>
  );
}
