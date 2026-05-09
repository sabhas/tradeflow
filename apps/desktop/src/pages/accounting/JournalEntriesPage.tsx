import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { AccountingSubNav } from '../../components/AccountingSubNav';
import { Combobox } from '../../components/Combobox';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { parseAmount } from '../../lib/numberFormat';

type AccountOpt = { id: string; code: string; name: string; type: string };
type JournalLine = { id?: string; accountId: string; debit: string; credit: string };
type JournalRow = {
  id: string;
  entryDate: string;
  reference: string | null;
  description: string | null;
  status: string;
  sourceType: string | null;
  lines?: Array<{
    id?: string;
    accountId: string;
    debit: string;
    credit: string;
    account?: { code: string; name: string };
  }>;
};

function accountLabel(line: NonNullable<JournalRow['lines']>[number]) {
  if (line.account) return `${line.account.code} ${line.account.name}`;
  return line.accountId;
}

export function JournalEntriesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'accounting:read');
  const canWrite = hasPermission(permissions, 'accounting:write');
  const qc = useQueryClient();
  const { formatMoney, formatMoneyInput, normalizeMoneyInput } = useMoneyFormat();

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
  const [formOpen, setFormOpen] = useState(false);

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

  const accountOptions = useMemo(
    () => [
      ...(accounts.data ?? []).map((a) => ({
        value: a.id,
        label: `${a.code} ${a.name}`,
      })),
    ],
    [accounts.data]
  );

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

  const closeJournalForm = () => {
    setFormOpen(false);
    resetForm();
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
    setFormOpen(true);
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
      closeJournalForm();
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
      closeJournalForm();
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
      closeJournalForm();
    },
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  const addLine = () => setLines((ls) => [...ls, { accountId: '', debit: '0', credit: '0' }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  let debitTot = 0;
  let creditTot = 0;
  for (const l of lines) {
    debitTot += parseAmount(l.debit);
    creditTot += parseAmount(l.credit);
  }
  const balanced = Math.abs(debitTot - creditTot) < 0.0001;

  return (
    <div>
      <AccountingSubNav />

      <section className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-slate-800 dark:text-slate-100">Journal register</h2>
          </div>
          {canWrite && (
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              onClick={() => {
                resetForm();
                setFormOpen(true);
              }}
            >
              New journal entry
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Status</span>
            <select
              className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">From</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">To</span>
            <input
              type="date"
              className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="whitespace-nowrap px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Date</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Reference</th>
                <th className="max-w-[12rem] px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Description</th>
                <th className="min-w-[18rem] px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Lines</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Status</th>
                <th className="whitespace-nowrap px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Source</th>
                {canWrite && (
                  <th className="whitespace-nowrap px-4 py-2 font-medium text-slate-700 dark:text-slate-300">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr>
                  <td
                    className="px-4 py-8 text-slate-500"
                    colSpan={canWrite ? 7 : 6}
                  >
                    Loading journal entries…
                  </td>
                </tr>
              ) : list.isError ? (
                <tr>
                  <td className="px-4 py-8 text-red-600" colSpan={canWrite ? 7 : 6}>
                    {(list.error as Error).message}
                  </td>
                </tr>
              ) : (list.data ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-slate-500" colSpan={canWrite ? 7 : 6}>
                    No journal entries for these filters.
                  </td>
                </tr>
              ) : (
                (list.data ?? []).map((j) => (
                  <tr key={j.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="whitespace-nowrap px-4 py-2 align-top">{j.entryDate}</td>
                    <td className="max-w-[10rem] whitespace-pre-wrap break-words px-4 py-2 align-top font-mono text-slate-700 dark:text-slate-300">
                      {j.reference || '—'}
                    </td>
                    <td
                      className="max-w-[14rem] px-4 py-2 align-top text-slate-600 dark:text-slate-400"
                      title={j.description || undefined}
                    >
                      {j.description ? (
                        <span className="line-clamp-2">{j.description}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="min-w-[18rem] max-w-xl px-4 py-2 align-top">
                      {(j.lines ?? []).length > 0 ? (
                        <ul className="space-y-1.5 text-xs">
                          {(j.lines ?? []).map((line) => (
                            <li
                              key={line.id ?? `${line.accountId}-${line.debit}-${line.credit}`}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                            >
                              <span className="min-w-0 font-medium text-slate-800 dark:text-slate-200">
                                {accountLabel(line)}
                              </span>
                              <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                                {parseAmount(line.debit) > 0 && (
                                  <span className="text-emerald-700 dark:text-emerald-400">
                                    Dr {formatMoney(line.debit)}
                                  </span>
                                )}
                                {parseAmount(line.credit) > 0 && (
                                  <span className="text-sky-800 dark:text-sky-300">
                                    Cr {formatMoney(line.credit)}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 align-top">
                      <span
                        className={
                          j.status === 'posted'
                            ? 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                            : 'rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                        }
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 align-top text-slate-600 dark:text-slate-400">
                      {j.sourceType || 'manual'}
                    </td>
                    {canWrite && (
                      <td className="whitespace-nowrap px-4 py-2 align-top">
                        <div className="flex flex-wrap gap-2">
                          {j.status === 'draft' && !j.sourceType && (
                            <>
                              <button
                                type="button"
                                className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                                onClick={() => loadDraft(j.id)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                                onClick={() => postMut.mutate(j.id)}
                              >
                                Post
                              </button>
                              <button
                                type="button"
                                className="text-sm text-red-600 hover:underline dark:text-red-400"
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
                              className="text-sm text-slate-700 hover:underline dark:text-slate-300"
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canWrite && (
        <MastersModal
          title={editingId ? 'Edit draft' : 'New journal (draft)'}
          open={formOpen}
          onClose={closeJournalForm}
          wide
        >
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add or change a draft. Posted entries are edited only via reversal from the register.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">Entry date</span>
              <input
                type="date"
                className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">Reference</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-3">
              <span className="text-slate-700 dark:text-slate-300">Description</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-2">Account</th>
                  <th className="py-2 pr-2">Debit</th>
                  <th className="py-2 pr-2">Credit</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-2">
                      <Combobox
                        className="w-full max-w-xs"
                        value={l.accountId}
                        onChange={(v) => {
                          setLines((ls) =>
                            ls.map((x, j) => (j === i ? { ...x, accountId: v } : x))
                          );
                        }}
                        options={accountOptions}
                        placeholder="Search account…"
                        disabled={accounts.isLoading}
                        aria-label="Account"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-28 rounded-md border border-slate-300 px-2 py-1.5 font-mono dark:border-slate-600 dark:bg-slate-900"
                        value={formatMoneyInput(l.debit)}
                        onChange={(e) => {
                          const v = normalizeMoneyInput(e.target.value);
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, debit: v } : x)));
                        }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-28 rounded-md border border-slate-300 px-2 py-1.5 font-mono dark:border-slate-600 dark:bg-slate-900"
                        value={formatMoneyInput(l.credit)}
                        onChange={(e) => {
                          const v = normalizeMoneyInput(e.target.value);
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, credit: v } : x)));
                        }}
                      />
                    </td>
                    <td className="py-2">
                      {lines.length > 2 && (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline dark:text-red-400"
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
          <p
            className={`mt-2 text-sm ${balanced ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}
          >
            Debits: {formatMoney(debitTot)} · Credits: {formatMoney(creditTot)}
            {!balanced && ' · Must balance before save/post'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={addLine}
            >
              Add line
            </button>
            {editingId ? (
              <>
                <button
                  type="button"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                  disabled={patchMut.isPending || !balanced}
                  onClick={() => patchMut.mutate()}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={closeJournalForm}
                >
                  Cancel
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
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {((createMut.error || patchMut.error) as Error).message}
            </p>
          )}
        </MastersModal>
      )}

      {(postMut.isError || reverseMut.isError) && (
        <p className="mt-2 text-sm text-red-600">
          {((postMut.error || reverseMut.error) as Error).message}
        </p>
      )}
    </div>
  );
}
