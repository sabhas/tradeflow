import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadAuthenticatedFile, getApiBase } from '../../api/client';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface ImportResponse {
  successCount: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

export function ImportProductsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canWrite = hasPermission(permissions, 'masters.products:write');
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (f: File) => {
      const token = localStorage.getItem('tradeflow_token');
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${getApiBase()}/import/products`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || json.message || `Import failed (${res.status})`);
      }
      return json as ImportResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      setErr(null);
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => {
      setResult(null);
      setErr(e.message);
    },
  });

  if (!canWrite) {
    return <p className="text-slate-600">You need products write permission to import.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link to="/import" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Import hub
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-slate-800">Import products</h1>
      <p className="mt-1 text-slate-600">
        Columns: category (code or name), sku, name, unit (code), optional barcode, costPrice, sellingPrice,
        batchTracked, expiryTracked.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() => downloadAuthenticatedFile('/import/products/template?format=xlsx', 'products-template.xlsx')}
        >
          Template (.xlsx)
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() => downloadAuthenticatedFile('/import/products/template?format=csv', 'products-template.csv')}
        >
          Template (.csv)
        </button>
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-6">
        <label className="block text-sm font-medium text-slate-700">
          File (Excel or CSV, UTF-8)
          <input
            type="file"
            accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="mt-2 block w-full text-sm text-slate-600"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          disabled={!file || mutation.isPending}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-indigo-700"
          onClick={() => file && mutation.mutate(file)}
        >
          {mutation.isPending ? 'Uploading…' : 'Import'}
        </button>
      </div>

      {err && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      )}

      {result && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-800">
            Imported <strong>{result.successCount}</strong> row(s).
            {result.errors.length > 0 && (
              <>
                {' '}
                <strong>{result.errors.length}</strong> issue(s) below.
              </>
            )}
          </p>
          {result.errors.length > 0 && (
            <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Row</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Field</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 tabular-nums">{e.row}</td>
                      <td className="px-3 py-2">{e.field ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-800">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
