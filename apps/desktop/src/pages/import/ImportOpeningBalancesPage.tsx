import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadAuthenticatedFile, getApiBase } from '../../api/client';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface ImportResponse {
  successCount: number;
  errors: Array<{ row: number; field?: string; message: string }>;
  inventoryRefIds?: string[];
  journalEntryIds?: string[];
}

export function ImportOpeningBalancesPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canInv = hasPermission(permissions, 'inventory:write');
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (f: File) => {
      const token = localStorage.getItem('tradeflow_token');
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${getApiBase()}/import/opening-balances`, {
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
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
    },
    onError: (e: Error) => {
      setResult(null);
      setErr(e.message);
    },
  });

  if (!canInv) {
    return <p className="text-slate-600">You need inventory write permission.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link to="/import" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Import hub
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-slate-800">Import opening balances</h1>
      <p className="mt-1 text-slate-600">
        Use the <strong>Inventory</strong> sheet: warehouseCode, movementDate (YYYY-MM-DD), productSku, quantity,
        unitCost. Optional <strong>Journal</strong> sheet for balanced lines (accountCode, debit, credit) — requires{' '}
        <code className="rounded bg-slate-100 px-1 text-xs">accounting:write</code>.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() =>
            downloadAuthenticatedFile('/import/opening-balances/template?format=xlsx', 'opening-balances-template.xlsx')
          }
        >
          Template (.xlsx)
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() =>
            downloadAuthenticatedFile('/import/opening-balances/template?format=csv', 'opening-inventory-template.csv')
          }
        >
          Inventory only (.csv)
        </button>
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-6">
        <label className="block text-sm font-medium text-slate-700">
          File (Excel with Inventory / Journal sheets, or CSV for inventory columns only)
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
        <div className="mt-6 space-y-3 text-sm text-slate-800">
          <p>
            Completed <strong>{result.successCount}</strong> batch(es) / entries.
          </p>
          {result.inventoryRefIds && result.inventoryRefIds.length > 0 && (
            <p>
              Inventory ref IDs:{' '}
              <span className="font-mono text-xs">{result.inventoryRefIds.join(', ')}</span>
            </p>
          )}
          {result.journalEntryIds && result.journalEntryIds.length > 0 && (
            <p>
              Journal entry IDs:{' '}
              <span className="font-mono text-xs">{result.journalEntryIds.join(', ')}</span>
            </p>
          )}
          {result.errors.length > 0 && (
            <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Row</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 tabular-nums">{e.row}</td>
                      <td className="px-3 py-2">{e.message}</td>
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
