import { Link } from 'react-router-dom';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

const cards: Array<{
  to: string;
  title: string;
  description: string;
  permission: string;
}> = [
  {
    to: '/import/products',
    title: 'Products',
    description: 'Bulk import from Excel or CSV using category and unit codes.',
    permission: 'masters.products:write',
  },
  {
    to: '/import/customers',
    title: 'Customers',
    description: 'Import customers; match payment terms and tax profiles by name.',
    permission: 'masters.customers:write',
  },
  {
    to: '/import/opening-balances',
    title: 'Opening balances',
    description: 'Inventory opening per warehouse (and optional balanced journal sheet).',
    permission: 'inventory:write',
  },
];

export function ImportHubPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const visible = cards.filter((c) => hasPermission(permissions, c.permission));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Import data</h1>
      <p className="mt-1 text-slate-600">
        Download a template, fill rows, then upload. Errors are reported by row.
      </p>

      {visible.length === 0 ? (
        <p className="mt-8 text-slate-600">You do not have permission to run imports.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <li key={c.to}>
              <Link
                to={c.to}
                className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:border-indigo-200 hover:ring-indigo-100"
              >
                <span className="text-lg font-medium text-slate-900">{c.title}</span>
                <span className="mt-2 flex-1 text-sm text-slate-600">{c.description}</span>
                <span className="mt-4 text-sm font-medium text-indigo-600">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
