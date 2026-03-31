import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { useAppSelector } from '../../hooks/useAppSelector';
import { hasPermission } from '../../lib/permissions';

interface CategoryNode {
  id: string;
  parentId?: string | null;
  name: string;
  code: string;
  branchId?: string | null;
  children?: CategoryNode[];
}

function CategoryTree({
  nodes,
  depth,
  onEdit,
  onDelete,
  canWrite,
}: {
  nodes: CategoryNode[];
  depth: number;
  onEdit: (n: CategoryNode) => void;
  onDelete: (n: CategoryNode) => void;
  canWrite: boolean;
}) {
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'ml-6 mt-1 space-y-1 border-l border-slate-200 pl-3'}>
      {nodes.map((n) => (
        <li key={n.id}>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
            <span className="font-medium text-slate-900">{n.name}</span>
            <span className="text-sm text-slate-500">{n.code}</span>
            {canWrite && (
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="text-sm text-indigo-600 hover:underline"
                  onClick={() => onEdit(n)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => onDelete(n)}
                >
                  Delete
                </button>
              </span>
            )}
          </div>
          {n.children && n.children.length > 0 && (
            <CategoryTree
              nodes={n.children}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              canWrite={canWrite}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProductCategoriesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.products:read');
  const canWrite = hasPermission(permissions, 'masters.products:write');
  const qc = useQueryClient();

  const { data: tree, isLoading } = useQuery({
    queryKey: ['product-categories', 'tree'],
    enabled: canRead,
    queryFn: () => apiFetchData<CategoryNode[]>('/product-categories?tree=true'),
  });

  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<CategoryNode | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState<string>('');

  const flatForParent = useQuery({
    queryKey: ['product-categories', 'flat'],
    enabled: canRead && modal !== null,
    queryFn: () => apiFetchData<CategoryNode[]>('/product-categories'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (modal === 'edit' && editing) {
        await apiFetch(`/product-categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            code,
            parentId: parentId || null,
          }),
        });
        return;
      }
      await apiFetch('/product-categories', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code,
          parentId: parentId || null,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      setModal(null);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/product-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-categories'] }),
  });

  if (!canRead) {
    return <p className="text-slate-600">You do not have permission to view product categories.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Product categories</h1>
          <p className="mt-1 text-slate-600">Hierarchical categories for your catalog</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setName('');
              setCode('');
              setParentId('');
              setModal('create');
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add category
          </button>
        )}
      </div>

      <div className="mt-6 rounded-lg bg-slate-50 p-4">
        {isLoading && <p className="text-slate-600">Loading...</p>}
        {!isLoading && tree && tree.length === 0 && (
          <p className="text-slate-600">No categories yet. Add one to get started.</p>
        )}
        {!isLoading && tree && tree.length > 0 && (
          <CategoryTree
            nodes={tree}
            depth={0}
            canWrite={canWrite}
            onEdit={(n) => {
              setEditing(n);
              setName(n.name);
              setCode(n.code);
              setParentId(n.parentId || '');
              setModal('edit');
            }}
            onDelete={(n) => {
              if (window.confirm(`Delete category “${n.name}”?`)) {
                deleteMutation.mutate(n.id);
              }
            }}
          />
        )}
      </div>

      <MastersModal
        title={modal === 'edit' ? 'Edit category' : 'New category'}
        open={modal !== null}
        onClose={() => {
          setModal(null);
          setEditing(null);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Code</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Parent (optional)</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— None —</option>
              {(flatForParent.data || [])
                .filter((c) => c.id !== editing?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </MastersModal>
    </div>
  );
}
