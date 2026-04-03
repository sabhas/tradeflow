import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { AccountingSubNav } from '../../components/AccountingSubNav';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

type AccountOpt = { id: string; code: string; name: string; type: string };
type JournalLine = { id?: string; accountId: string; debit: string; credit: string };
type JournalRow = {
  id: string;
  entryDate: string;
  reference: string | null;
  description: string | null;
  status: string;
  sourceType: string | null;
};

export function JournalEntriesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'accounting:read');
  const canWrite = hasPermission(permissions, 'accounting:write');
  const qc = useQueryClient();

  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { accountId: '', debit: '0', credit: '0' },
    { accountId: '', debit: '0', credit: '0' },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const listParams = useMemo(() => {
    const q = new URLSearchParams();
    q.set('limit', '100');
    if (status) q.set('status', status);
    if (dateFrom) q.set('dateFrom', dateFrom);
    if (dateTo) q.set('dateTo', dateTo);
    return q.toString();
  }, [status, dateFrom, dateTo]);

  const accounts = useQuery({
    queryKey: ['accounts', 'flat'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: AccountOpt[] }>('/accounts').then((r) => r.data),
  });

  const list = useQuery({
    queryKey: ['journal-entries', listParams],
    enabled: canRead,
    queryFn: () =>
      apiFetch<{ data: JournalRow[] }>(`/journal-entries?${listParams}`).then((r) => r.data),
  });

  const resetForm = () => {
    setEditingId(null);
    setEntryDate(new Date().toISOString().slice(0, 10));
    setReference('');
    setDescription('');
    setLines([
      { accountId: '', debit: '0', credit: '0' },
      { accountId: '', debit: '0', credit: '0' },
    ]);
  };

  const loadDraft = async (id: string) => {
    const row = await apiFetch<{ data: JournalRow & { lines: JournalLine[] } }>(`/journal-entries/${id}`).then(
      (r) => r.data
    );
    if (row.status !== 'draft' || row.sourceType) return;
    setEditingId(id);
    setEntryDate(row.entryDate);
    setReference(row.reference || '');
    setDescription(row.description || '');
    setLines(
      row.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      }))
    );
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch('/journal-entries', {
        method: 'POST',
        body: JSON.stringify({
          entryDate,
          reference: reference || null,
          description: description || null,
          lines: lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit || '0',
            credit: l.credit || '0',
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      resetForm();
    },
  });

  const patchMut = useMutation({
    mutationFn: () =>
      apiFetch(`/journal-entries/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          entryDate,
          reference: reference || null,
          description: description || null,
          lines: lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit || '0',
            credit: l.credit || '0',
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      resetForm();
    },
  });

  const postMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/journal-entries/${id}/post`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journal-entries'] }),
  });

  const reverseMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/journal-entries/${id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journal-entries'] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/journal-entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      resetForm();
    },
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  const addLine = () => setLines((ls) => [...ls, { accountId: '', debit: '0', credit: '0' }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  let debitTot = 0;
  let creditTot = 0;
  for (const l of lines) {
    debitTot += parseFloat(l.debit || '0');
    creditTot += parseFloat(l.credit || '0');
  }
  const balanced = Math.abs(debitTot - creditTot) < 0.0001;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Journal entries</h1>
      <p className="mt-1 text-slate-600">Manual journals (draft → post). Source documents stay read-only here.</p>
      <AccountingSubNav />

      <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Status</span>
          <select
            className="rounded-md border border-slate-300 px-2 py-1.5"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">From</span>
          <input
            type="date"
            className="rounded-md border border-slate-300 px-2 py-1.5"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">To</span>
          <input
            type="date"
            className="rounded-md border border-slate-300 px-2 py-1.5"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
      </div>

      {canWrite && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">
            {editingId ? 'Edit draft' : 'New journal (draft)'}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>Entry date</span>
              <input
                type="date"
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Reference</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-3">
              <span>Description</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-2">Account</th>
                  <th className="py-2 pr-2">Debit</th>
                  <th className="py-2 pr-2">Credit</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <select
                        className="w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5"
                        value={l.accountId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, accountId: v } : x)));
                        }}
                      >
                        <option value="">—</option>
                        {(accounts.data ?? []).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-28 rounded-md border border-slate-300 px-2 py-1.5 font-mono"
                        value={l.debit}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, debit: v } : x)));
                        }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-28 rounded-md border border-slate-300 px-2 py-1.5 font-mono"
                        value={l.credit}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, credit: v } : x)));
                        }}
                      />
                    </td>
                    <td className="py-2">
                      {lines.length > 2 && (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeLine(i)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`mt-2 text-sm ${balanced ? 'text-emerald-700' : 'text-amber-700'}`}>
            Debits: {debitTot.toFixed(4)} · Credits: {creditTot.toFixed(4)}
            {!balanced && ' · Must balance before save/post'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={addLine}
            >
              Add line
            </button>
            {editingId ? (
              <>
                <button
                  type="button"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                  disabled={patchMut.isPending || !balanced}
                  onClick={() => patchMut.mutate()}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  onClick={resetForm}
                >
                  Cancel edit
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                disabled={createMut.isPending || !balanced}
                onClick={() => createMut.mutate()}
              >
                Save as draft
              </button>
            )}
          </div>
          {(createMut.isError || patchMut.isError) && (
            <p className="mt-2 text-sm text-red-600">
              {((createMut.error || patchMut.error) as Error).message}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-2 font-medium text-slate-700">Date</th>
              <th className="px-4 py-2 font-medium text-slate-700">Reference</th>
              <th className="px-4 py-2 font-medium text-slate-700">Status</th>
              <th className="px-4 py-2 font-medium text-slate-700">Source</th>
              {canWrite && <th className="px-4 py-2 font-medium text-slate-700">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((j) => (
              <tr key={j.id} className="border-b border-slate-100">
                <td className="px-4 py-2">{j.entryDate}</td>
                <td className="px-4 py-2 font-mono text-slate-700">{j.reference || '—'}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      j.status === 'posted'
                        ? 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-800'
                        : 'rounded bg-amber-100 px-2 py-0.5 text-amber-900'
                    }
                  >
                    {j.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{j.sourceType || 'manual'}</td>
                {canWrite && (
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      {j.status === 'draft' && !j.sourceType && (
                        <>
                          <button
                            type="button"
                            className="text-sm text-indigo-600 hover:underline"
                            onClick={() => loadDraft(j.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-sm text-emerald-700 hover:underline"
                            onClick={() => postMut.mutate(j.id)}
                          >
                            Post
                          </button>
                          <button
                            type="button"
                            className="text-sm text-red-600 hover:underline"
                            onClick={() => {
                              if (confirm('Delete this draft?')) delMut.mutate(j.id);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {j.status === 'posted' && (
                        <button
                          type="button"
                          className="text-sm text-slate-700 hover:underline"
                          onClick={() => {
                            if (confirm('Create a reversing journal entry (today’s date)?')) {
                              reverseMut.mutate(j.id);
                            }
                          }}
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(postMut.isError || reverseMut.isError) && (
        <p className="mt-2 text-sm text-red-600">
          {((postMut.error || reverseMut.error) as Error).message}
        </p>
      )}
    </div>
  );
}
