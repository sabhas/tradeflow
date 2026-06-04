import { Supplier } from '@tradeflow/db';

export function serializeSupplier(s: Supplier) {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    city: s.city,
    telephone: s.telephone,
    mobileNo: s.mobileNo,
    email: s.email,
    website: s.website,
    contact: s.contact,
    ntn: s.ntn,
    stn: s.stn,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
  };
}
