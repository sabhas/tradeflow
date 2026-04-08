import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, apiFetchData } from '../../api/client';
import { MastersModal } from '../../components/MastersModal';
import { hasPermission } from '../../lib/permissions';
import { useAppSelector } from '../../hooks/useAppSelector';

interface Row {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  telephone?: string | null;
  mobileNo?: string | null;
  email?: string | null;
  website?: string | null;
  contact?: string | null;
  ntn?: string | null;
  stn?: string | null;
  paymentTermsId?: string | null;
  taxProfileId?: string | null;
}

interface Opt {
  id: string;
  name: string;
}

export function SuppliersPage() {
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canRead = hasPermission(permissions, 'masters.suppliers:read');
  const canWrite = hasPermission(permissions, 'masters.suppliers:write');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers'],
    enabled: canRead,
    queryFn: () => apiFetch<{ data: Row[] }>('/suppliers').then((r) => r.data),
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
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [telephone, setTelephone] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [contact, setContact] = useState('');
  const [ntn, setNtn] = useState('');
  const [stn, setStn] = useState('');
  const [paymentTermsId, setPaymentTermsId] = useState('');
  const [taxProfileId, setTaxProfileId] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        address: address || null,
        city: city || null,
        telephone: telephone || null,
        mobileNo: mobileNo || null,
        email: email || null,
        website: website || null,
        contact: contact || null,
        ntn: ntn || null,
        stn: stn || null,
        paymentTermsId: paymentTermsId || null,
        taxProfileId: taxProfileId || null,
      };
      if (editing) {
        await apiFetch(`/suppliers/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/suppliers', { method: 'POST', body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setOpen(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  if (!canRead) return <p className="text-slate-600">No permission.</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-800">Suppliers</h1>
        {canWrite && (
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setEditing(null);
              setName('');
              setAddress('');
              setCity('');
              setTelephone('');
              setMobileNo('');
              setEmail('');
              setWebsite('');
              setContact('');
              setNtn('');
              setStn('');
              setPaymentTermsId('');
              setTaxProfileId('');
              setOpen(true);
            }}
          >
            Add supplier
          </button>
        )}
      </div>
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              {canWrite && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {(data || []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.name}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline"
                      onClick={() => {
                        setEditing(r);
                        setName(r.name);
                        setAddress(r.address || '');
                        setCity(r.city || '');
                        setTelephone(r.telephone || '');
                        setMobileNo(r.mobileNo || '');
                        setEmail(r.email || '');
                        setWebsite(r.website || '');
                        setContact(r.contact || '');
                        setNtn(r.ntn || '');
                        setStn(r.stn || '');
                        setPaymentTermsId(r.paymentTermsId || '');
                        setTaxProfileId(r.taxProfileId || '');
                        setOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`Delete supplier “${r.name}”?`)) del.mutate(r.id);
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
      <MastersModal title={editing ? 'Edit supplier' : 'New supplier'} open={open} onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
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
            <label className="block text-sm font-medium text-slate-700">Address</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">City</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Contact</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Telephone</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Mobile no</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={mobileNo}
                onChange={(e) => setMobileNo(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Website</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">NTN</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={ntn}
                onChange={(e) => setNtn(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">STN</label>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={stn}
                onChange={(e) => setStn(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Payment terms</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={paymentTermsId}
              onChange={(e) => setPaymentTermsId(e.target.value)}
            >
              <option value="">— None —</option>
              {(paymentTerms.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Tax profile</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={taxProfileId}
              onChange={(e) => setTaxProfileId(e.target.value)}
            >
              <option value="">— None —</option>
              {(taxProfiles.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white">
              Save
            </button>
          </div>
        </form>
      </MastersModal>
    </div>
  );
}
