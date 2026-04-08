import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, apiFetchData, downloadAuthenticatedFile } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

type SalesTaxStatus = 'unregistered' | 'registered' | 'exempt';

interface Row {
  id: string;
  name: string;
  longName?: string | null;
  type: string;
  address?: string | null;
  townId?: string | null;
  areaId?: string | null;
  town?: { id: string; name: string } | null;
  area?: { id: string; name: string } | null;
  telephone?: string | null;
  mobile?: string | null;
  contactPerson?: string | null;
  ntn?: string | null;
  stn?: string | null;
  salesTaxStatus?: SalesTaxStatus;
  isFiler: boolean;
  licenseNo?: string | null;
  licenseExpiryDate?: string | null;
  creditLimit: string;
  paymentTermsId?: string | null;
  taxProfileId?: string | null;
}

interface Opt {
  id: string;
  name: string;
}

interface AreaOpt {
  id: string;
  name: string;
}

interface CustomerTypeOpt {
  id: string;
  name: string;
}

const inputCls = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

export function CustomersPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.customers:read');
  const canWrite = hasPermission(permissions, 'masters.customers:write');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: Row[] }>('/customers').then((r) => r.data),
  });

  const paymentTerms = useQuery({
    queryKey: ['payment-terms'],
    enabled: canRead,
    queryFn: () => apiFetchData<Opt[]>('/payment-terms'),
  });

  const taxProfiles = useQuery({
    queryKey: ['tax-profiles'],
    enabled: canRead,
    queryFn: () => apiFetchData<Opt[]>('/tax-profiles'),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [name, setName] = useState('');
  const [longName, setLongName] = useState('');
  const [type, setType] = useState('');
  const [address, setAddress] = useState('');
  const [townId, setTownId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [telephone, setTelephone] = useState('');
  const [mobile, setMobile] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [ntn, setNtn] = useState('');
  const [stn, setStn] = useState('');
  const [salesTaxStatus, setSalesTaxStatus] = useState<SalesTaxStatus>('unregistered');
  const [isFiler, setIsFiler] = useState(false);
  const [licenseNo, setLicenseNo] = useState('');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [paymentTermsId, setPaymentTermsId] = useState('');
  const [taxProfileId, setTaxProfileId] = useState('');

  const towns = useQuery({
    queryKey: ['towns', areaId || 'none'],
    enabled: canRead && !!areaId,
    queryFn: () =>
      apiFetch<{ data: Opt[] }>(`/towns?areaId=${encodeURIComponent(areaId)}`).then((r) => r.data),
  });

  const areas = useQuery({
    queryKey: ['areas'],
    enabled: canRead && open,
    queryFn: () => apiFetch<{ data: AreaOpt[] }>('/areas').then((r) => r.data),
  });

  const customerTypes = useQuery({
    queryKey: ['customer-types'],
    enabled: canRead,
    queryFn: () => apiFetchData<CustomerTypeOpt[]>('/customer-types'),
  });
  const hasCustomerTypes = (customerTypes.data?.length ?? 0) > 0;

  useEffect(() => {
    if (!open || !areaId) return;
    const list = towns.data ?? [];
    if (townId && !list.some((t) => t.id === townId)) {
      setTownId('');
    }
  }, [open, areaId, towns.data, townId]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name,
        longName: longName.trim() ? longName.trim() : null,
        type: type.trim(),
        address: address.trim(),
        townId: townId ? townId : null,
        areaId: areaId ? areaId : null,
        telephone: telephone.trim() ? telephone.trim() : null,
        mobile: mobile.trim() ? mobile.trim() : null,
        contactPerson: contactPerson.trim() ? contactPerson.trim() : null,
        ntn: ntn.trim() ? ntn.trim() : null,
        stn: stn.trim() ? stn.trim() : null,
        salesTaxStatus,
        isFiler,
        licenseNo: licenseNo.trim() ? licenseNo.trim() : null,
        licenseExpiryDate: licenseExpiryDate.trim() ? licenseExpiryDate.trim() : null,
        creditLimit,
        paymentTermsId: paymentTermsId || null,
        taxProfileId: taxProfileId || null,
      };
      if (editing) {
        await apiFetch(`/customers/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/customers', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setOpen(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  function resetForm() {
    setEditing(null);
    setName('');
    setLongName('');
    setType('');
    setAddress('');
    setTownId('');
    setAreaId('');
    setTelephone('');
    setMobile('');
    setContactPerson('');
    setNtn('');
    setStn('');
    setSalesTaxStatus('unregistered');
    setIsFiler(false);
    setLicenseNo('');
    setLicenseExpiryDate('');
    setCreditLimit('0');
    setPaymentTermsId('');
    setTaxProfileId('');
  }

  function loadRow(r: Row) {
    setEditing(r);
    setName(r.name);
    setLongName(r.longName ?? '');
    setType(r.type ?? '');
    setAddress(r.address ?? '');
    setTownId(r.townId ?? '');
    setAreaId(r.areaId ?? '');
    setTelephone(r.telephone ?? '');
    setMobile(r.mobile ?? '');
    setContactPerson(r.contactPerson ?? '');
    setNtn(r.ntn ?? '');
    setStn(r.stn ?? '');
    setSalesTaxStatus(r.salesTaxStatus ?? 'unregistered');
    setIsFiler(r.isFiler);
    setLicenseNo(r.licenseNo ?? '');
    setLicenseExpiryDate(r.licenseExpiryDate ? r.licenseExpiryDate.slice(0, 10) : '');
    setCreditLimit(r.creditLimit);
    setPaymentTermsId(r.paymentTermsId || '');
    setTaxProfileId(r.taxProfileId || '');
  }

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Customers</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRead && (
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() =>
                downloadAuthenticatedFile('/export/customers', 'customers-export.xlsx').catch((e: Error) =>
                  alert(e.message)
                )
              }
            >
              Export Excel
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              onClick={() => {
                resetForm();
                setOpen(true);
              }}
            >
              Add customer
            </button>
          )}
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Town</th>
              <th className="px-4 py-3 text-left font-medium">Area</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Credit limit</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {(data || []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-slate-700">{r.town?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{r.area?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700">{r.type}</td>
                <td className="px-4 py-3">{r.creditLimit}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => {
                        loadRow(r);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`Delete customer “${r.name}”?`)) del.mutate(r.id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MastersModal title={editing ? 'Edit customer' : 'New customer'} open={open} onClose={() => setOpen(false)}>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!hasCustomerTypes) return;
            save.mutate();
          }}
        >
          {!hasCustomerTypes && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No customer types found. Create one first under Masters → Customer types.
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identity</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Long name (optional)</label>
                <input className={inputCls} value={longName} onChange={(e) => setLongName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Type</label>
                <select
                  className={inputCls}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  required
                >
                  <option value="">— Select —</option>
                  {(customerTypes.data || []).map((ct) => (
                    <option key={ct.id} value={ct.name}>
                      {ct.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Street address</label>
                <textarea
                  className={`${inputCls} min-h-[72px]`}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Area</label>
                <select
                  className={inputCls}
                  value={areaId}
                  onChange={(e) => {
                    setAreaId(e.target.value);
                    setTownId('');
                  }}
                  required
                >
                  <option value="">— Select —</option>
                  {(areas.data || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Town</label>
                <select
                  className={inputCls}
                  value={townId}
                  onChange={(e) => setTownId(e.target.value)}
                  disabled={!areaId}
                  required
                >
                  <option value="">{areaId ? '— Select —' : 'Select an area first'}</option>
                  {(towns.data || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Manage lists under Masters → Towns &amp; areas.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Telephone</label>
                <input className={inputCls} value={telephone} onChange={(e) => setTelephone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Mobile</label>
                <input className={inputCls} value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Contact person</label>
                <input className={inputCls} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tax &amp; license</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">NTN</label>
                <input className={inputCls} value={ntn} onChange={(e) => setNtn(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">STN</label>
                <input className={inputCls} value={stn} onChange={(e) => setStn(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Sales tax status</label>
                <select
                  className={inputCls}
                  value={salesTaxStatus}
                  onChange={(e) => setSalesTaxStatus(e.target.value as SalesTaxStatus)}
                >
                  <option value="unregistered">Unregistered</option>
                  <option value="registered">Registered</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-7 sm:pt-8">
                <input
                  id="isFiler"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={isFiler}
                  onChange={(e) => setIsFiler(e.target.checked)}
                />
                <label htmlFor="isFiler" className="text-sm font-medium text-slate-700">
                  Active tax filer
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">License no.</label>
                <input className={inputCls} value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">License expiry</label>
                <input
                  className={inputCls}
                  type="date"
                  value={licenseExpiryDate}
                  onChange={(e) => setLicenseExpiryDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Credit limit</label>
                <input className={inputCls} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Payment terms</label>
                <select className={inputCls} value={paymentTermsId} onChange={(e) => setPaymentTermsId(e.target.value)}>
                  <option value="">— None —</option>
                  {(paymentTerms.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Tax profile</label>
                <select className={inputCls} value={taxProfileId} onChange={(e) => setTaxProfileId(e.target.value)}>
                  <option value="">— None —</option>
                  {(taxProfiles.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={!hasCustomerTypes}
            >
              Save
            </button>
          </div>
        </form>
      </MastersModal>
    </div>
  );
}
