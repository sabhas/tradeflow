import { Customer } from '@tradeflow/db';
import { nullable, relationIdName } from '../../../shared/utils/serializeHelpers';

export function formatLicenseDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === 'string' ? value.slice(0, 10) : null;
}

export function serializeCustomer(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    longName: nullable(c.longName),
    type: c.type,
    address: nullable(c.address),
    townId: nullable(c.townId),
    areaId: nullable(c.areaId),
    town: relationIdName(c.town),
    area: relationIdName(c.area),
    telephone: nullable(c.telephone),
    mobile: nullable(c.mobile),
    contactPerson: nullable(c.contactPerson),
    ntn: nullable(c.ntn),
    stn: nullable(c.stn),
    salesTaxStatus: c.salesTaxStatus,
    isFiler: c.isFiler,
    licenseNo: nullable(c.licenseNo),
    licenseExpiryDate: formatLicenseDate(c.licenseExpiryDate ?? null),
    contact: c.contact,
    creditLimit: c.creditLimit,
    paymentTermsId: c.paymentTermsId,
    taxProfileId: c.taxProfileId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
  };
}
