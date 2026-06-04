import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { Area, Customer, CustomerType, dataSource, Town } from '@tradeflow/db';
import { createCustomerSchema, updateCustomerSchema } from '@tradeflow/shared';
import { createCustomerReceivableAccount } from '../../accounting/services/glAccountService';
import { HttpError } from '../../../shared/utils/httpError';

type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

async function resolveTownAndAreaIds(
  townId: string | null,
  areaId: string | null
): Promise<{ townId: string | null; areaId: string | null }> {
  if (!townId || !areaId) {
    return { townId, areaId };
  }
  const [town, area] = await Promise.all([
    Town.findOne({ where: { id: townId, deletedAt: IsNull() } }),
    Area.findOne({ where: { id: areaId, deletedAt: IsNull() } }),
  ]);
  if (!town) {
    throw new HttpError(400, { error: 'Unknown or inactive town' });
  }
  if (!area) {
    throw new HttpError(400, { error: 'Unknown or inactive area' });
  }
  if (!town.areaId || town.areaId !== area.id) {
    throw new HttpError(400, { error: 'Selected town does not belong to the selected area' });
  }
  return { townId, areaId };
}

async function ensureCustomerTypeExists(type: string): Promise<string> {
  const normalized = type.trim();
  const existing = await CustomerType.createQueryBuilder('ct')
    .where('LOWER(TRIM(ct.name)) = LOWER(TRIM(:name))', { name: normalized })
    .andWhere('ct.deleted_at IS NULL')
    .getOne();
  if (!existing) {
    throw new HttpError(400, { error: 'Unknown customer type' });
  }
  return existing.name;
}

type StatementRow =
  | { kind: 'invoice'; date: string; id: string; debit: string; credit: string; ref: string }
  | { kind: 'receipt'; date: string; id: string; debit: string; credit: string; ref: string };

export type CustomerStatementResult = {
  customerId: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: string;
  lines: Array<StatementRow & { balance: string }>;
  closingBalance: string;
};

export async function getCustomerStatement(
  customerId: string,
  dateFrom: string,
  dateTo: string
): Promise<CustomerStatementResult> {
  const op = await dataSource.query(
    `
    SELECT (
      (SELECT COALESCE(SUM(i.total::numeric), 0) FROM invoices i
       WHERE i.customer_id = $1 AND i.status = 'posted' AND i.payment_type = 'credit'
         AND i.deleted_at IS NULL
         AND i.invoice_date < $2::date)
      -
      (SELECT COALESCE(SUM(ra.amount::numeric), 0)
       FROM receipt_allocations ra
       INNER JOIN receipts r ON r.id = ra.receipt_id
       INNER JOIN invoices i ON i.id = ra.invoice_id AND i.deleted_at IS NULL
       WHERE i.customer_id = $1 AND i.status = 'posted' AND i.payment_type = 'credit'
         AND r.receipt_date < $2::date)
    )::text AS opening
    `,
    [customerId, dateFrom]
  );
  const opening = op[0]?.opening ?? '0.0000';

  const invoices = await dataSource.query(
    `
    SELECT i.id, i.invoice_date AS date, i.total::text AS amount, i.due_date AS "dueDate"
    FROM invoices i
    WHERE i.customer_id = $1 AND i.status = 'posted' AND i.payment_type = 'credit'
      AND i.deleted_at IS NULL
      AND i.invoice_date >= $2::date AND i.invoice_date <= $3::date
    ORDER BY i.invoice_date ASC, i.id ASC
    `,
    [customerId, dateFrom, dateTo]
  );

  const receipts = await dataSource.query(
    `
    SELECT r.id, r.receipt_date AS date, r.amount::text AS amount, r.reference AS reference
    FROM receipts r
    WHERE r.customer_id = $1
      AND r.receipt_date >= $2::date AND r.receipt_date <= $3::date
    ORDER BY r.receipt_date ASC, r.id ASC
    `,
    [customerId, dateFrom, dateTo]
  );

  const merged: StatementRow[] = [
    ...invoices.map(
      (i: { id: string; date: string; amount: string }) =>
        ({
          kind: 'invoice',
          date: i.date,
          id: i.id,
          debit: i.amount,
          credit: '0.0000',
          ref: `Invoice ${i.id.slice(0, 8)}`,
        }) satisfies StatementRow
    ),
    ...receipts.map(
      (r: { id: string; date: string; amount: string; reference: string | null }) =>
        ({
          kind: 'receipt',
          date: r.date,
          id: r.id,
          debit: '0.0000',
          credit: r.amount,
          ref: r.reference || `Receipt ${r.id.slice(0, 8)}`,
        }) satisfies StatementRow
    ),
  ];
  merged.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  let balance = parseFloat(opening);
  const lines = merged.map((row) => {
    balance += parseFloat(row.debit) - parseFloat(row.credit);
    return { ...row, balance: balance.toFixed(4) };
  });

  return {
    customerId,
    dateFrom,
    dateTo,
    openingBalance: opening,
    lines,
    closingBalance: balance.toFixed(4),
  };
}

export async function createCustomer(body: CreateCustomerInput): Promise<Customer> {
  const b = body;
  const t0 = b.townId ?? null;
  const a0 = b.areaId ?? null;
  if (!t0 || !a0) {
    throw new HttpError(400, { error: 'Town and area are required' });
  }
  const address = (typeof b.address === 'string' ? b.address : '').trim();
  if (!address) {
    throw new HttpError(400, { error: 'Address is required' });
  }
  const [geo, type] = await Promise.all([resolveTownAndAreaIds(t0, a0), ensureCustomerTypeExists(b.type)]);
  const row = await dataSource.transaction(async (tx) => {
    const customerRepo = tx.getRepository(Customer);

    const custAccount = await createCustomerReceivableAccount(tx, b.name);

    const createdCustomer = customerRepo.create({
      name: b.name,
      longName:
        b.longName == null || (typeof b.longName === 'string' && b.longName.trim() === '')
          ? undefined
          : b.longName.trim(),
      type,
      address,
      townId: geo.townId!,
      areaId: geo.areaId!,
      receivableAccountId: custAccount.id,
      telephone:
        b.telephone == null || (typeof b.telephone === 'string' && b.telephone.trim() === '')
          ? undefined
          : b.telephone.trim(),
      mobile:
        b.mobile == null || (typeof b.mobile === 'string' && b.mobile.trim() === '')
          ? undefined
          : b.mobile.trim(),
      contactPerson:
        b.contactPerson == null || (typeof b.contactPerson === 'string' && b.contactPerson.trim() === '')
          ? undefined
          : b.contactPerson.trim(),
      ntn: b.ntn == null || (typeof b.ntn === 'string' && b.ntn.trim() === '') ? undefined : b.ntn.trim(),
      stn: b.stn == null || (typeof b.stn === 'string' && b.stn.trim() === '') ? undefined : b.stn.trim(),
      salesTaxStatus: b.salesTaxStatus ?? 'unregistered',
      isFiler: b.isFiler ?? false,
      licenseNo:
        b.licenseNo == null || (typeof b.licenseNo === 'string' && b.licenseNo.trim() === '')
          ? undefined
          : b.licenseNo.trim(),
      licenseExpiryDate: b.licenseExpiryDate === undefined ? undefined : b.licenseExpiryDate,
      contact: b.contact ?? undefined,
      creditLimit: b.creditLimit ?? '0',
      paymentTermsId: b.paymentTermsId ?? undefined,
      taxProfileId: b.taxProfileId ?? undefined,
    });
    await customerRepo.save(createdCustomer);
    return createdCustomer;
  });

  const withGeo = await Customer.findOne({
    where: { id: row.id },
    relations: ['town', 'area'],
  });
  return withGeo || row;
}

export async function updateCustomer(id: string, body: UpdateCustomerInput): Promise<Customer> {
  const repo = Customer.getRepository();
  const row = await repo.findOne({ where: { id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const b = body;
  const effTown = b.townId !== undefined ? b.townId : (row.townId ?? null);
  const effArea = b.areaId !== undefined ? b.areaId : (row.areaId ?? null);
  if (!effTown || !effArea) {
    throw new HttpError(400, { error: 'Town and area are required' });
  }
  const effectiveAddress = (
    b.address !== undefined ? (typeof b.address === 'string' ? b.address : '') : (row.address ?? '')
  ).trim();
  if (!effectiveAddress) {
    throw new HttpError(400, { error: 'Address is required' });
  }
  const resolvedType = await ensureCustomerTypeExists(b.type !== undefined ? b.type : row.type);
  const geo = await resolveTownAndAreaIds(effTown, effArea);
  row.townId = geo.townId!;
  row.areaId = geo.areaId!;
  row.address = effectiveAddress;
  row.type = resolvedType;

  if (b.name !== undefined) row.name = b.name;
  if (b.longName !== undefined) {
    row.longName =
      b.longName == null || (typeof b.longName === 'string' && b.longName.trim() === '')
        ? undefined
        : b.longName.trim();
  }
  if (b.telephone !== undefined) {
    row.telephone =
      b.telephone == null || (typeof b.telephone === 'string' && b.telephone.trim() === '')
        ? undefined
        : b.telephone.trim();
  }
  if (b.mobile !== undefined) {
    row.mobile =
      b.mobile == null || (typeof b.mobile === 'string' && b.mobile.trim() === '')
        ? undefined
        : b.mobile.trim();
  }
  if (b.contactPerson !== undefined) {
    row.contactPerson =
      b.contactPerson == null || (typeof b.contactPerson === 'string' && b.contactPerson.trim() === '')
        ? undefined
        : b.contactPerson.trim();
  }
  if (b.ntn !== undefined) {
    row.ntn = b.ntn == null || (typeof b.ntn === 'string' && b.ntn.trim() === '') ? undefined : b.ntn.trim();
  }
  if (b.stn !== undefined) {
    row.stn = b.stn == null || (typeof b.stn === 'string' && b.stn.trim() === '') ? undefined : b.stn.trim();
  }
  if (b.salesTaxStatus !== undefined) row.salesTaxStatus = b.salesTaxStatus;
  if (b.isFiler !== undefined) row.isFiler = b.isFiler;
  if (b.licenseNo !== undefined) {
    row.licenseNo =
      b.licenseNo == null || (typeof b.licenseNo === 'string' && b.licenseNo.trim() === '')
        ? undefined
        : b.licenseNo.trim();
  }
  if (b.licenseExpiryDate !== undefined) {
    row.licenseExpiryDate = b.licenseExpiryDate;
  }
  if (b.contact !== undefined) row.contact = b.contact ?? undefined;
  if (b.creditLimit !== undefined) row.creditLimit = b.creditLimit;
  if (b.paymentTermsId !== undefined) row.paymentTermsId = b.paymentTermsId ?? undefined;
  if (b.taxProfileId !== undefined) row.taxProfileId = b.taxProfileId ?? undefined;
  await repo.save(row);
  const refreshed = await Customer.findOne({
    where: { id: row.id },
    relations: ['town', 'area'],
  });
  return refreshed || row;
}
