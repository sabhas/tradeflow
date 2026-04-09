import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type AccountTreeNode = AccountRow & { children?: AccountTreeNode[] };

type CoaTreeNode =
  | { kind: 'folder'; id: string; label: string; children: CoaTreeNode[] }
  | { kind: 'account'; account: AccountRow; children: CoaTreeNode[] };

type SettingsData = {
  defaultCashAccountId: string;
  defaultBankAccountId: string;
  defaultCashAccount: { id: string; code: string; name: string };
  defaultBankAccount: { id: string; code: string; name: string };
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

function collectDefaultExpandedIds(nodes: CoaTreeNode[], into: Set<string>) {
  for (const n of nodes) {
    if (n.kind === 'folder') {
      into.add(n.id);
      collectDefaultExpandedIds(n.children, into);
    } else if (n.kind === 'account') {
      if (n.children.length > 0) into.add(n.account.id);
      collectDefaultExpandedIds(n.children, into);
    }
  }
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
        const code = node.kind === 'account' ? node.account.code : null;
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
                className={`flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-2 py-1.5 text-left ${
                  isSel
                    ? 'bg-indigo-100 text-indigo-950 ring-1 ring-indigo-300/60 dark:bg-indigo-950/80 dark:text-indigo-100 dark:ring-indigo-500/40'
                    : 'text-slate-800 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-slate-800/60'
                }`}
                onClick={() => onSelect(id)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                {code !== null && (
                  <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">{code}</span>
                )}
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
    if (filteredTree.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (search.trim()) {
        collectAllExpandableIds(filteredTree, next);
      } else {
        collectDefaultExpandedIds(filteredTree, next);
      }
      return next;
    });
  }, [filteredTree, search]);

  useEffect(() => {
    if (!settings.data) return;
    setCashId((prev) => prev || settings.data!.defaultCashAccountId);
    setBankId((prev) => prev || settings.data!.defaultBankAccountId);
  }, [settings.data]);

  const selectedNode = useMemo(
    () => (selectedId ? findNode(filteredTree, selectedId) : null),
    [filteredTree, selectedId]
  );

  const tableRows = useMemo(() => {
    if (!selectedId || !selectedNode) return [];
    const leaves = collectLeavesUnder(selectedNode);
    return leaves.map((a) => ({ id: a.id, code: a.code, name: a.name }));
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Chart of accounts</h1>
        <AccountingSubNav />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 max-w-md flex-1 flex-col gap-1">
          <label htmlFor="coa-search" className="sr-only">
            Search accounts
          </label>
          <input
            id="coa-search"
            type="search"
            placeholder="Search by code or name…"
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
                  <th className="px-4 py-2.5 font-medium text-slate-700">Code</th>
                  <th className="px-4 py-2.5 font-medium text-slate-700">Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-10 text-center text-slate-500">
                      Select a group or account in the tree to list posting accounts below it.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60">
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-800 dark:text-slate-100">
                        {row.code}
                      </td>
                      <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{row.name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAdd && canWrite && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">New account</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-400">Code</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">Name</span>
              <input
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600 dark:text-slate-400">Type</span>
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
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-4">
              <span className="text-slate-600 dark:text-slate-400">Parent account (optional)</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5"
                value={form.parentId}
                onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
              >
                <option value="">None — top level under type</option>
                {flatAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
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
        </section>
      )}

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
                <select
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm min-w-[14rem]"
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
                <span className="text-slate-600 dark:text-slate-400">Default bank</span>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm min-w-[14rem]"
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
    </div>
  );
}
