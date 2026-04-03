import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

type GeneralSettings = {
  id: string;
  companyName: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  taxRegistrationNumber: string | null;
  logoUrl: string | null;
  financialYearStartMonth: number;
  financialYearLabelOverride: string | null;
  currentFinancialYearLabel: string;
  currencyCode: string;
  moneyDecimals: number;
  quantityDecimals: number;
  roundingMode: string;
  defaultInvoiceTemplateId: string | null;
  updatedAt: string;
};

type InvoiceTemplateRow = {
  id: string;
  name: string;
  config: {
    showLogo?: boolean;
    showLegalName?: boolean;
    showTaxNumber?: boolean;
    showPaymentTerms?: boolean;
    showNotes?: boolean;
  };
};

const TABS = [
  { id: 'company', label: 'Company' },
  { id: 'fy', label: 'Financial year' },
  { id: 'currency', label: 'Currency & rounding' },
  { id: 'templates', label: 'Invoice templates' },
] as const;

const MONTHS = [
  { v: 1, label: 'January' },
  { v: 2, label: 'February' },
  { v: 3, label: 'March' },
  { v: 4, label: 'April' },
  { v: 5, label: 'May' },
  { v: 6, label: 'June' },
  { v: 7, label: 'July' },
  { v: 8, label: 'August' },
  { v: 9, label: 'September' },
  { v: 10, label: 'October' },
  { v: 11, label: 'November' },
  { v: 12, label: 'December' },
];

const ROUNDING = [
  { v: 'half_up', label: 'Half up' },
  { v: 'half_down', label: 'Half down' },
  { v: 'down', label: 'Down (toward zero)' },
  { v: 'up', label: 'Up (away from zero)' },
];

export function SettingsPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'settings:read');
  const canWrite = hasPermission(permissions, 'settings:write');
  const qc = useQueryClient();

  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('company');
  const [form, setForm] = useState<Partial<GeneralSettings>>({});

  const settings = useQuery({
    queryKey: ['settings', 'general'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: GeneralSettings }>('/settings').then((r) => r.data),
  });

  const templates = useQuery({
    queryKey: ['invoice-templates'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: InvoiceTemplateRow[] }>('/invoice-templates').then((r) => r.data),
  });

  useEffect(() => {
    if (!settings.data) return;
    setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'general'] }),
  });

  const [newTplName, setNewTplName] = useState('');
  const [newTplCfg, setNewTplCfg] = useState({
    showLogo: true,
    showLegalName: true,
    showTaxNumber: true,
    showPaymentTerms: true,
    showNotes: true,
  });

  const createTpl = useMutation({
    mutationFn: () =>
      apiFetch('/invoice-templates', {
        method: 'POST',
        body: JSON.stringify({ name: newTplName.trim(), config: newTplCfg }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-templates'] });
      setNewTplName('');
    },
  });

  const updateTpl = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/invoice-templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice-templates'] }),
  });

  if (!canRead) {
    return <p className="text-slate-600">You do not have permission to view settings.</p>;
  }

  if (settings.isLoading || !settings.data) {
    return <p className="text-slate-600">Loading settings…</p>;
  }

  const data = { ...settings.data, ...form };

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Company profile</h2>
          <p className="text-sm text-slate-600">
            Shown on printed invoices and reports. Logo can be a public image URL.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">Company name</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.companyName ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Legal name</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.legalName ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Address line 1</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.addressLine1 ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Address line 2</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.addressLine2 ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">City</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.city ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">State / region</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.state ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Postal code</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.postalCode ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Country</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.country ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Phone</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.phone ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Email</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Tax registration (VAT / GST / etc.)</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.taxRegistrationNumber ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, taxRegistrationNumber: e.target.value || null }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Logo URL</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.logoUrl ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value || null }))}
                disabled={!canWrite}
                placeholder="https://..."
              />
            </label>
          </div>
          {canWrite && (
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  companyName: data.companyName,
                  legalName: data.legalName,
                  addressLine1: data.addressLine1,
                  addressLine2: data.addressLine2,
                  city: data.city,
                  state: data.state,
                  postalCode: data.postalCode,
                  country: data.country,
                  phone: data.phone,
                  email: data.email,
                  taxRegistrationNumber: data.taxRegistrationNumber,
                  logoUrl: data.logoUrl,
                })
              }
            >
              {save.isPending ? 'Saving…' : 'Save company'}
            </button>
          )}
          {data.logoUrl ? (
            <div className="rounded border border-slate-200 p-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Preview</p>
              <div className="flex items-start gap-4 border-b border-slate-100 pb-4">
                <img src={data.logoUrl} alt="" className="max-h-16 max-w-[200px] object-contain" />
                <div>
                  <p className="font-semibold text-slate-900">{data.companyName}</p>
                  {data.legalName ? <p className="text-sm text-slate-600">{data.legalName}</p> : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {tab === 'fy' && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Financial year</h2>
          <p className="text-sm text-slate-600">
            Used for period labels (e.g. “This financial year” in reports). Current label:{' '}
            <strong>{data.currentFinancialYearLabel}</strong>
          </p>
          <label className="block max-w-xs text-sm">
            <span className="text-slate-600">First month of financial year</span>
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={data.financialYearStartMonth}
              onChange={(e) =>
                setForm((f) => ({ ...f, financialYearStartMonth: Number(e.target.value) }))
              }
              disabled={!canWrite}
            >
              {MONTHS.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block max-w-md text-sm">
            <span className="text-slate-600">Override label (optional)</span>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={data.financialYearLabelOverride ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, financialYearLabelOverride: e.target.value || null }))}
              disabled={!canWrite}
              placeholder="Leave blank to compute automatically"
            />
          </label>
          {canWrite && (
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  financialYearStartMonth: data.financialYearStartMonth,
                  financialYearLabelOverride: data.financialYearLabelOverride,
                })
              }
            >
              {save.isPending ? 'Saving…' : 'Save financial year'}
            </button>
          )}
        </section>
      )}

      {tab === 'currency' && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Currency & rounding</h2>
          <p className="text-sm text-slate-600">
            Affects sales document totals, tax lines, and how amounts appear on invoices.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">Default currency (ISO code)</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 uppercase"
                maxLength={3}
                value={data.currencyCode ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase() }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Rounding mode</span>
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.roundingMode}
                onChange={(e) => setForm((f) => ({ ...f, roundingMode: e.target.value }))}
                disabled={!canWrite}
              >
                {ROUNDING.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Money decimal places</span>
              <input
                type="number"
                min={0}
                max={6}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.moneyDecimals}
                onChange={(e) => setForm((f) => ({ ...f, moneyDecimals: Number(e.target.value) }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Quantity decimal places</span>
              <input
                type="number"
                min={0}
                max={6}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={data.quantityDecimals}
                onChange={(e) => setForm((f) => ({ ...f, quantityDecimals: Number(e.target.value) }))}
                disabled={!canWrite}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Default invoice template</span>
              <select
                className="mt-1 w-full max-w-md rounded border border-slate-300 px-2 py-1.5"
                value={data.defaultInvoiceTemplateId ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    defaultInvoiceTemplateId: e.target.value || null,
                  }))
                }
                disabled={!canWrite || !templates.data}
              >
                <option value="">— None —</option>
                {(templates.data || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {canWrite && (
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  currencyCode: data.currencyCode,
                  roundingMode: data.roundingMode,
                  moneyDecimals: data.moneyDecimals,
                  quantityDecimals: data.quantityDecimals,
                  defaultInvoiceTemplateId: data.defaultInvoiceTemplateId,
                })
              }
            >
              {save.isPending ? 'Saving…' : 'Save currency & rounding'}
            </button>
          )}
        </section>
      )}

      {tab === 'templates' && (
        <section className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Invoice templates</h2>
          <p className="text-sm text-slate-600">
            Control which blocks appear on the printable invoice. Create additional templates (e.g. simplified)
            and pick one per invoice or set a default above.
          </p>
          {templates.isLoading ? (
            <p className="text-slate-600">Loading templates…</p>
          ) : (
            <ul className="space-y-4">
              {(templates.data || []).map((t) => (
                <li key={t.id} className="rounded border border-slate-100 p-4">
                  <div className="font-medium text-slate-900">{t.name}</div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    {(
                      [
                        ['showLogo', 'Logo'],
                        ['showLegalName', 'Legal name'],
                        ['showTaxNumber', 'Tax number'],
                        ['showPaymentTerms', 'Payment terms'],
                        ['showNotes', 'Notes'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={t.config[key] !== false}
                          onChange={(e) =>
                            updateTpl.mutate({
                              id: t.id,
                              body: { config: { ...t.config, [key]: e.target.checked } },
                            })
                          }
                          disabled={!canWrite}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-medium text-slate-800">New template</h3>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Name
                  <input
                    className="ml-2 rounded border border-slate-300 px-2 py-1.5"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    placeholder="Simplified"
                  />
                </label>
                <button
                  type="button"
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                  disabled={!newTplName.trim() || createTpl.isPending}
                  onClick={() => createTpl.mutate()}
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
