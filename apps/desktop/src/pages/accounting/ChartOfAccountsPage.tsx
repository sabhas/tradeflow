import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { AccountingSubNav } from '../../components/AccountingSubNav';
import { Combobox } from '../../components/Combobox';
import { MastersModal } from '../../components/MastersModal';
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

type AccountTreeNode = AccountRow & { children?: AccountTreeNode[] };

type CoaTreeNode =
  | { kind: 'folder'; id: string; label: string; children: CoaTreeNode[] }
  | { kind: 'account'; account: AccountRow; children: CoaTreeNode[] };

type SettingsData = {
  defaultCashAccountId: string;
  defaultBankAccountId: string;
  periodLockedThrough?: string | null;
  defaultCashAccount: { id: string; code: string; name: string };
  defaultBankAccount: { id: string; code: string; name: string };
};

type PeriodLockWarnings = {
  count: number;
  totalAccruedUnsettled: string;
  grns: Array<{
    grnId: string;
    grnDate: string;
    supplierName: string;
    invoiceSettlement: string;
    accruedAmount: string;
  }>;
};

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

const TYPE_FOLDER_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
const TYPE_FOLDER_LABEL: Record<(typeof TYPE_FOLDER_ORDER)[number], string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Revenue',
  expense: 'Expense',
};

function mapApiAccount(a: AccountTreeNode): CoaTreeNode {
  return {
    kind: 'account',
    account: {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      parentId: a.parentId ?? null,
      isSystem: a.isSystem,
    },
    children: (a.children ?? []).map(mapApiAccount),
  };
}

function buildAccountFolders(roots: AccountTreeNode[]): CoaTreeNode[] {
  const grouped = new Map<string, AccountTreeNode[]>();
  for (const t of TYPE_FOLDER_ORDER) grouped.set(t, []);
  for (const r of roots) {
    grouped.get(r.type)?.push(r);
  }
  return TYPE_FOLDER_ORDER.map((t) => ({
    kind: 'folder',
    id: `vf-${t}`,
    label: TYPE_FOLDER_LABEL[t],
    children: (grouped.get(t) ?? []).map(mapApiAccount),
  }));
}

function collectAccountLeaves(node: CoaTreeNode): AccountRow[] {
  if (node.kind !== 'account') return [];
  if (node.children.length === 0) return [node.account];
  return node.children.flatMap(collectAccountLeaves);
}

function collectLeavesUnder(node: CoaTreeNode): AccountRow[] {
  if (node.kind === 'folder') {
    return node.children.flatMap((ch) => {
      if (ch.kind === 'account') return collectAccountLeaves(ch);
      return [];
    });
  }
  if (node.kind === 'account') return collectAccountLeaves(node);
  return [];
}

function findSelectableId(nodes: CoaTreeNode[]): string | null {
  for (const n of nodes) {
    if (n.kind === 'folder') {
      const nested = findSelectableId(n.children);
      if (nested) return nested;
      return n.id;
    }
    return n.account.id;
  }
  return null;
}

function findNode(nodes: CoaTreeNode[], id: string): CoaTreeNode | null {
  for (const n of nodes) {
    if (n.kind === 'folder' && n.id === id) return n;
    if (n.kind === 'account' && n.account.id === id) return n;
    if (n.kind === 'folder' || n.kind === 'account') {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function collectAllExpandableIds(nodes: CoaTreeNode[], into: Set<string>) {
  for (const n of nodes) {
    if (n.kind === 'folder') {
      if (n.children.length > 0) into.add(n.id);
      collectAllExpandableIds(n.children, into);
    } else if (n.kind === 'account') {
      if (n.children.length > 0) into.add(n.account.id);
      collectAllExpandableIds(n.children, into);
    }
  }
}

function filterCoaTree(nodes: CoaTreeNode[], query: string): CoaTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  function matchAccount(a: AccountRow): boolean {
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  }

  function walk(list: CoaTreeNode[]): CoaTreeNode[] {
    const out: CoaTreeNode[] = [];
    for (const n of list) {
      if (n.kind === 'folder') {
        const children = walk(n.children);
        if (n.label.toLowerCase().includes(q) || children.length > 0) {
          out.push({ ...n, children });
        }
      } else {
        const children = walk(n.children);
        if (matchAccount(n.account) || children.length > 0) {
          out.push({ ...n, children });
        }
      }
    }
    return out;
  }
  return walk(nodes);
}

function CoaTreeView({
  nodes,
  depth,
  expanded,
  toggleExpanded,
  selectedId,
  onSelect,
}: {
  nodes: CoaTreeNode[];
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const pad = depth * 14;
  return (
    <ul className="select-none text-sm" style={{ paddingLeft: pad }}>
      {nodes.map((node) => {
        const id = node.kind === 'folder' ? node.id : node.account.id;
        const label = node.kind === 'folder' ? node.label : node.account.name;
        const hasKids = node.children.length > 0;
        const isOpen = expanded.has(id);
        const isSel = selectedId === id;

        return (
          <li key={id} className="py-px">
            <div className="flex items-stretch gap-0.5">
              {hasKids ? (
                <button
                  type="button"
                  className="flex w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200/80"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                  onClick={() => toggleExpanded(id)}
                >
                  <span className="text-[10px]" aria-hidden>
                    {isOpen ? '▼' : '▶'}
                  </span>
                </button>
              ) : (
                <span className="inline-block w-7 shrink-0" />
              )}
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-baseline rounded-md px-2 py-1.5 text-left ${
                  isSel
                    ? 'bg-indigo-100 text-indigo-950 ring-1 ring-indigo-300/60 dark:bg-indigo-950/80 dark:text-indigo-100 dark:ring-indigo-500/40'
                    : 'text-slate-800 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
                }`}
                onClick={() => onSelect(id)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
              </button>
            </div>
            {hasKids && isOpen && (
              <CoaTreeView
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                toggleExpanded={toggleExpanded}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ChartOfAccountsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'accounting:read');
  const canWrite = hasPermission(permissions, 'accounting:write');
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [showDefaults, setShowDefaults] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'expense' as (typeof ACCOUNT_TYPES)[number],
    parentId: '' as string,
  });
  const [cashId, setCashId] = useState('');
  const [bankId, setBankId] = useState('');
  const [periodLockedThrough, setPeriodLockedThrough] = useState('');
  const [showPeriodLock, setShowPeriodLock] = useState(false);
  const [periodLockConfirmOpen, setPeriodLockConfirmOpen] = useState(false);

  const accounts = useQuery({
    queryKey: ['accounts', 'tree'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: AccountTreeNode[] }>('/accounts?format=tree').then((r) => r.data),
  });

  const settings = useQuery({
    queryKey: ['settings', 'accounting'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: SettingsData }>('/settings/accounting').then((r) => r.data),
  });

  const accountFolders = useMemo(() => buildAccountFolders(accounts.data ?? []), [accounts.data]);

  const filteredTree = useMemo(() => filterCoaTree(accountFolders, search), [accountFolders, search]);

  useEffect(() => {
    if (filteredTree.length === 0) return;
    const first = findSelectableId(filteredTree);
    setSelectedId((prev) => (prev && findNode(filteredTree, prev) ? prev : first));
  }, [filteredTree]);

  useEffect(() => {
    if (search.trim()) return;
    setExpanded(new Set());
  }, [search]);

  useEffect(() => {
    if (filteredTree.length === 0) return;
    setExpanded((prev) => {
      if (search.trim()) {
        const next = new Set(prev);
        collectAllExpandableIds(filteredTree, next);
        return next;
      } else {
        return prev;
      }
    });
  }, [filteredTree, search]);

  useEffect(() => {
    if (!settings.data) return;
    setCashId((prev) => prev || settings.data!.defaultCashAccountId);
    setBankId((prev) => prev || settings.data!.defaultBankAccountId);
    setPeriodLockedThrough(settings.data.periodLockedThrough ?? '');
  }, [settings.data]);

  const periodLockWarnings = useQuery({
    queryKey: ['period-lock-warnings', periodLockedThrough],
    enabled: canRead && showPeriodLock && periodLockedThrough.length === 10,
    queryFn: () =>
      apiFetch<{ data: PeriodLockWarnings }>(
        `/settings/accounting/period-lock-warnings?lockedThrough=${encodeURIComponent(periodLockedThrough)}`
      ).then((r) => r.data),
  });

  const selectedNode = useMemo(
    () => (selectedId ? findNode(filteredTree, selectedId) : null),
    [filteredTree, selectedId]
  );

  const tableRows = useMemo(() => {
    if (!selectedId || !selectedNode) return [];
    const leaves = collectLeavesUnder(selectedNode);
    return leaves.map((a) => ({ id: a.id, name: a.name }));
  }, [selectedId, selectedNode]);

  const leafCountUnderSelection = tableRows.length;

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      collectAllExpandableIds(filteredTree, next);
      return next;
    });
  }, [filteredTree]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const saveSettings = useMutation({
    mutationFn: () =>
      apiFetch('/settings/accounting', {
        method: 'PATCH',
        body: JSON.stringify({ defaultCashAccountId: cashId, defaultBankAccountId: bankId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'accounting'] }),
  });

  const savePeriodLock = useMutation({
    mutationFn: () =>
      apiFetch('/settings/accounting', {
        method: 'PATCH',
        body: JSON.stringify({
          periodLockedThrough: periodLockedThrough.trim() || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'accounting'] });
      setPeriodLockConfirmOpen(false);
    },
  });

  const requestSavePeriodLock = () => {
    if (!periodLockedThrough.trim()) {
      savePeriodLock.mutate();
      return;
    }
    const w = periodLockWarnings.data;
    if (w && w.count > 0) {
      setPeriodLockConfirmOpen(true);
      return;
    }
    savePeriodLock.mutate();
  };

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

  const flatAccounts = useMemo(() => {
    const walk = (nodes: AccountTreeNode[]): AccountRow[] =>
      nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);
    return walk(accounts.data ?? []);
  }, [accounts.data]);

  const assetAccounts = flatAccounts.filter((a) => a.type === 'asset');

  const parentAccountOptions = useMemo(
    () => [
      { value: '', label: 'None — top level under type' },
      ...flatAccounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [flatAccounts]
  );
  const assetAccountOptions = useMemo(
    () => assetAccounts.map((a) => ({ value: a.id, label: a.name })),
    [assetAccounts]
  );

  const openAddWithParent = () => {
    let parentId = '';
    let type = 'expense' as (typeof ACCOUNT_TYPES)[number];
    if (selectedNode?.kind === 'account') {
      parentId = selectedNode.account.id;
      type = selectedNode.account.type as (typeof ACCOUNT_TYPES)[number];
    } else if (selectedNode?.kind === 'folder' && selectedNode.id.startsWith('vf-')) {
      const t = selectedNode.id.replace('vf-', '');
      if (ACCOUNT_TYPES.includes(t as (typeof ACCOUNT_TYPES)[number])) {
        type = t as (typeof ACCOUNT_TYPES)[number];
      }
    }
    setForm({ code: '', name: '', type, parentId });
    setShowAdd(true);
  };

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] });
    qc.invalidateQueries({ queryKey: ['settings', 'accounting'] });
  };

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div className="space-y-6">
      <AccountingSubNav />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 max-w-md flex-1 flex-col gap-1">
          <label htmlFor="coa-search" className="sr-only">
            Search accounts
          </label>
          <input
            id="coa-search"
            type="search"
            placeholder="Search accounts…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={expandAll}
          >
            Expand all
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={collapseAll}
          >
            Collapse all
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={refreshAll}
          >
            Refresh
          </button>
          {canWrite && (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              onClick={openAddWithParent}
            >
              Add account
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[min(68vh,560px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none lg:flex-row">
        <div className="max-h-[40vh] w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950 lg:max-h-none lg:w-[min(100%,360px)] lg:border-b-0 lg:border-r">
          {accounts.isLoading && <p className="text-sm text-slate-600">Loading…</p>}
          {accounts.isError && (
            <p className="text-sm text-red-600">{(accounts.error as Error).message}</p>
          )}
          {!accounts.isLoading && filteredTree.length === 0 && (
            <p className="text-sm text-slate-600">
              {search.trim() ? 'No accounts match your search.' : 'No accounts yet.'}
            </p>
          )}
          {!accounts.isLoading && filteredTree.length > 0 && (
            <CoaTreeView
              nodes={filteredTree}
              depth={0}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
              Posting accounts
              <span className="ml-2 font-normal text-slate-500">({leafCountUnderSelection})</span>
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-0 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-slate-700">Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={1} className="px-4 py-10 text-center text-slate-500">
                      Select a group or account in the tree to list posting accounts below it.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{row.name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <MastersModal
        title="New account"
        open={showAdd && canWrite}
        onClose={() => setShowAdd(false)}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Code</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">Name</span>
            <input
              className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Type</span>
            <select
              className="rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
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
          <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-4">
            <span className="text-slate-600 dark:text-slate-400">Parent account (optional)</span>
            <Combobox
              className="w-full min-w-0 sm:min-w-[16rem]"
              value={form.parentId}
              onChange={(v) => setForm((f) => ({ ...f, parentId: v }))}
              options={parentAccountOptions}
              placeholder="Search parent account…"
              disabled={accounts.isLoading}
              aria-label="Parent account"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            disabled={createAcc.isPending || !form.code.trim() || !form.name.trim()}
            onClick={() => createAcc.mutate()}
          >
            Create
          </button>
          <button
            type="button"
            className="text-sm text-slate-600 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => setShowAdd(false)}
          >
            Cancel
          </button>
        </div>
        {createAcc.isError && (
          <p className="mt-2 text-sm text-red-600">{(createAcc.error as Error).message}</p>
        )}
      </MastersModal>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/80"
          onClick={() => setShowDefaults((v) => !v)}
          aria-expanded={showDefaults}
        >
          Cash and bank defaults
          <span className="text-slate-400 dark:text-slate-500">{showDefaults ? '▼' : '▶'}</span>
        </button>
        {showDefaults && settings.data && (
          <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Used when posting receipts and supplier payments (cash vs bank / transfer / card).
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Default cash</span>
                <Combobox
                  className="min-w-[14rem]"
                  value={cashId || settings.data.defaultCashAccountId}
                  onChange={setCashId}
                  options={assetAccountOptions}
                  placeholder="Search account…"
                  disabled={!canWrite || assetAccountOptions.length === 0}
                  aria-label="Default cash account"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-400">Default bank</span>
                <Combobox
                  className="min-w-[14rem]"
                  value={bankId || settings.data.defaultBankAccountId}
                  onChange={setBankId}
                  options={assetAccountOptions}
                  placeholder="Search account…"
                  disabled={!canWrite || assetAccountOptions.length === 0}
                  aria-label="Default bank account"
                />
              </label>
              {canWrite && (
                <button
                  type="button"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                  disabled={saveSettings.isPending || !cashId || !bankId}
                  onClick={() => saveSettings.mutate()}
                >
                  Save
                </button>
              )}
            </div>
            {saveSettings.isError && (
              <p className="mt-2 text-sm text-red-600">{(saveSettings.error as Error).message}</p>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/80"
          onClick={() => setShowPeriodLock((v) => !v)}
          aria-expanded={showPeriodLock}
        >
          Accounting period lock
          <span className="text-slate-400 dark:text-slate-500">{showPeriodLock ? '▼' : '▶'}</span>
        </button>
        {showPeriodLock && settings.data && (
          <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Documents on or before this date cannot be posted. Review GRNs without posted supplier invoices before
              extending the lock.
            </p>
            <label className="mt-4 block text-sm">
              <span className="text-slate-600 dark:text-slate-400">Locked through (inclusive)</span>
              <input
                type="date"
                className="mt-1 rounded-md border border-slate-300 px-3 py-2"
                value={periodLockedThrough}
                onChange={(e) => setPeriodLockedThrough(e.target.value)}
                disabled={!canWrite}
              />
            </label>
            {periodLockedThrough.length === 10 && periodLockWarnings.data && periodLockWarnings.data.count > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-medium">
                  {periodLockWarnings.data.count} posted GRN(s) through this date have no posted supplier invoice
                </p>
                <p className="mt-1">
                  Unsettled accrued purchases: {periodLockWarnings.data.totalAccruedUnsettled}. Accrued purchases may
                  be overstated until supplier invoices are posted.
                </p>
                <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto text-xs">
                  {periodLockWarnings.data.grns.slice(0, 8).map((g) => (
                    <li key={g.grnId}>
                      {g.grnDate} — {g.supplierName} ({g.invoiceSettlement.replace('_', ' ')})
                    </li>
                  ))}
                  {periodLockWarnings.data.grns.length > 8 && (
                    <li>…and {periodLockWarnings.data.grns.length - 8} more</li>
                  )}
                </ul>
              </div>
            )}
            {canWrite && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                  disabled={savePeriodLock.isPending}
                  onClick={requestSavePeriodLock}
                >
                  Save period lock
                </button>
                {periodLockedThrough && (
                  <button
                    type="button"
                    className="text-sm text-slate-600 hover:underline dark:text-slate-400"
                    onClick={() => {
                      setPeriodLockedThrough('');
                      savePeriodLock.mutate();
                    }}
                  >
                    Clear lock
                  </button>
                )}
              </div>
            )}
            {savePeriodLock.isError && (
              <p className="mt-2 text-sm text-red-600">{(savePeriodLock.error as Error).message}</p>
            )}
          </div>
        )}
      </section>

      {periodLockConfirmOpen && periodLockWarnings.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Confirm period lock</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {periodLockWarnings.data.count} GRN(s) through {periodLockedThrough} do not have a posted supplier invoice.
              Accrued purchases of {periodLockWarnings.data.totalAccruedUnsettled} may remain open. Continue anyway?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
                onClick={() => setPeriodLockConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
                disabled={savePeriodLock.isPending}
                onClick={() => savePeriodLock.mutate()}
              >
                Lock period anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
