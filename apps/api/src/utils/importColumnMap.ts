import { normalizeHeaderKey } from './tabularFile';

/** Map normalized CSV/XLSX header key -> canonical field name for Zod row schemas. */
const PRODUCT_ALIASES: Record<string, string> = {
  supplier: 'supplier',
  manufacturer: 'supplier',
  suppliername: 'supplier',
  category: 'category',
  categorycode: 'category',
  categoryname: 'category',
  sku: 'sku',
  barcode: 'barcode',
  name: 'name',
  unit: 'unit',
  unitcode: 'unit',
  costprice: 'costPrice',
  cost: 'costPrice',
  sellingprice: 'sellingPrice',
  price: 'sellingPrice',
  batchtracked: 'batchTracked',
  expirytracked: 'expiryTracked',
};

const CUSTOMER_ALIASES: Record<string, string> = {
  name: 'name',
  type: 'type',
  contactphone: 'contactPhone',
  phone: 'contactPhone',
  contactemail: 'contactEmail',
  email: 'contactEmail',
  contactaddress: 'contactAddress',
  address: 'contactAddress',
  creditlimit: 'creditLimit',
  paymentterms: 'paymentTerms',
  taxprofile: 'taxProfile',
};

const OPENING_INV_ALIASES: Record<string, string> = {
  warehousecode: 'warehouseCode',
  warehouse: 'warehouseCode',
  movementdate: 'movementDate',
  date: 'movementDate',
  productsku: 'productSku',
  sku: 'productSku',
  quantity: 'quantity',
  qty: 'quantity',
  unitcost: 'unitCost',
  cost: 'unitCost',
};

const OPENING_JOURNAL_ALIASES: Record<string, string> = {
  entrydate: 'entryDate',
  date: 'entryDate',
  reference: 'reference',
  ref: 'reference',
  accountcode: 'accountCode',
  account: 'accountCode',
  debit: 'debit',
  credit: 'credit',
};

function mapRow(
  raw: Record<string, string>,
  aliases: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeHeaderKey(k) || k;
    const canon = aliases[nk];
    if (canon) out[canon] = v;
  }
  return out;
}

export function mapProductRow(raw: Record<string, string>): Record<string, string> {
  return mapRow(raw, PRODUCT_ALIASES);
}

export function mapCustomerRow(raw: Record<string, string>): Record<string, string> {
  return mapRow(raw, CUSTOMER_ALIASES);
}

export function mapOpeningInventoryRow(raw: Record<string, string>): Record<string, string> {
  return mapRow(raw, OPENING_INV_ALIASES);
}

export function mapOpeningJournalRow(raw: Record<string, string>): Record<string, string> {
  return mapRow(raw, OPENING_JOURNAL_ALIASES);
}
