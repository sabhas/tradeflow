import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { AccountingSubNav } from '../../components/AccountingSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  isSystem: boolean;
};

type SettingsData = {
  defaultCashAccountId: string;
  defaultBankAccountId: string;
  defaultCashAccount: { id: string; code: string; name: string };
  defaultBankAccount: { id: string; code: string; name: string };
};

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

export function ChartOfAccountsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'accounting:read');
  const canWrite = hasPermission(permissions, 'accounting:write');
  const qc = useQueryClient();

  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'expense' as (typeof ACCOUNT_TYPES)[number],
    parentId: '' as string,
  });
  const [cashId, setCashId] = useState('');
  const [bankId, setBankId] = useState('');

  const accounts = useQuery({
    queryKey: ['accounts', 'flat'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: AccountRow[] }>('/accounts').then((r) => r.data),
  });

  const settings = useQuery({
    queryKey: ['settings', 'accounting'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: SettingsData }>('/settings/accounting').then((r) => r.data),
  });

  useEffect(() => {
    if (!settings.data) return;
    setCashId((prev) => prev || settings.data!.defaultCashAccountId);
    setBankId((prev) => prev || settings.data!.defaultBankAccountId);
  }, [settings.data]);

  const saveSettings = useMutation({
    mutationFn: () =>
      apiFetch('/settings/accounting', {
        method: 'PATCH',
        body: JSON.stringify({ defaultCashAccountId: cashId, defaultBankAccountId: bankId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'accounting'] }),
  });

  const createAcc = useMutation({
    mutationFn: () =>
      apiFetch('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          type: form.type,
          parentId: form.parentId || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setShowAdd(false);
      setForm({ code: '', name: '', type: 'expense', parentId: '' });
    },
  });

  const patchAcc = useMutation({
    mutationFn: (p: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/accounts/${p.id}`, { method: 'PATCH', body: JSON.stringify(p.body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setEditId(null);
    },
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  const assetAccounts = (accounts.data ?? []).filter((a) => a.type === 'asset');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Chart of accounts</h1>
      <p className="mt-1 text-slate-600">Manage accounts and default cash/bank for receipts and payments</p>
      <AccountingSubNav />

      {settings.data && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Cash &amp; bank (posting)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Receipts and supplier payments use these based on payment method (cash vs bank/transfer/card).
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Default cash account</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={cashId || settings.data.defaultCashAccountId}
                onChange={(e) => setCashId(e.target.value)}
                disabled={!canWrite}
              >
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Default bank account</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={bankId || settings.data.defaultBankAccountId}
                onChange={(e) => setBankId(e.target.value)}
                disabled={!canWrite}
              >
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </label>
            {canWrite && (
              <button
                type="button"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={saveSettings.isPending || !cashId || !bankId}
                onClick={() => saveSettings.mutate()}
              >
                Save defaults
              </button>
            )}
          </div>
          {saveSettings.isError && (
            <p className="mt-2 text-sm text-red-600">{(saveSettings.error as Error).message}</p>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-slate-800">All accounts</h2>
        {canWrite && (
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? 'Cancel' : 'Add account'}
          </button>
        )}
      </div>

      {showAdd && canWrite && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>Code</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Name</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Type</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as (typeof ACCOUNT_TYPES)[number] }))
                }
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={createAcc.isPending || !form.code.trim() || !form.name.trim()}
            onClick={() => createAcc.mutate()}
          >
            Create
          </button>
          {createAcc.isError && (
            <p className="mt-2 text-sm text-red-600">{(createAcc.error as Error).message}</p>
          )}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-2 font-medium text-slate-700">Code</th>
              <th className="px-4 py-2 font-medium text-slate-700">Name</th>
              <th className="px-4 py-2 font-medium text-slate-700">Type</th>
              <th className="px-4 py-2 font-medium text-slate-700">System</th>
              {canWrite && <th className="px-4 py-2 font-medium text-slate-700">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(accounts.data ?? []).map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-mono text-slate-800">{a.code}</td>
                <td className="px-4 py-2 text-slate-800">
                  {editId === a.id ? (
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1"
                      defaultValue={a.name}
                      id={`name-${a.id}`}
                    />
                  ) : (
                    a.name
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">{a.type}</td>
                <td className="px-4 py-2 text-slate-600">{a.isSystem ? 'Yes' : '—'}</td>
                {canWrite && (
                  <td className="px-4 py-2">
                    {a.isSystem ? (
                      '—'
                    ) : editId === a.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-sm text-indigo-600 hover:underline"
                          onClick={() => {
                            const el = document.getElementById(`name-${a.id}`) as HTMLInputElement | null;
                            const name = el?.value?.trim() || a.name;
                            patchAcc.mutate({ id: a.id, body: { name } });
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="text-sm text-slate-600 hover:underline"
                          onClick={() => setEditId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-sm text-indigo-600 hover:underline"
                        onClick={() => setEditId(a.id)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {patchAcc.isError && (
        <p className="mt-2 text-sm text-red-600">{(patchAcc.error as Error).message}</p>
      )}
    </div>
  );
}
