import type { Request } from 'express';
import { IsNull } from 'typeorm';
import type { z } from 'zod';
import { Customer } from '@tradeflow/db';
import {
  createCustomerSchema,
  customerStatementQuerySchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import {
  createCustomer as createCustomerService,
  updateCustomer as updateCustomerService,
  getCustomerStatement as getCustomerStatementService,
} from '../services/customerService';

type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

function formatLicenseDate(value: string | Date | null | undefined): string | null {
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
    longName: c.longName ?? null,
    type: c.type,
    address: c.address ?? null,
    townId: c.townId ?? null,
    areaId: c.areaId ?? null,
    town: c.town ? { id: c.town.id, name: c.town.name } : null,
    area: c.area ? { id: c.area.id, name: c.area.name } : null,
    telephone: c.telephone ?? null,
    mobile: c.mobile ?? null,
    contactPerson: c.contactPerson ?? null,
    ntn: c.ntn ?? null,
    stn: c.stn ?? null,
    salesTaxStatus: c.salesTaxStatus,
    isFiler: c.isFiler,
    licenseNo: c.licenseNo ?? null,
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

type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export async function listCustomers(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListCustomersQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const search = q.search?.trim();

  const qb = Customer.createQueryBuilder('c').where('c.deleted_at IS NULL');
  if (search) {
    const term = `%${search.toLowerCase()}%`;
    const raw = `%${search}%`;
    qb.andWhere(
      '(LOWER(c.name) LIKE :term OR LOWER(c.long_name) LIKE :term OR c.ntn ILIKE :raw OR c.mobile ILIKE :raw)',
      { term, raw }
    );
  }
  qb.leftJoinAndSelect('c.town', 'town').leftJoinAndSelect('c.area', 'area');
  qb.orderBy('c.name', 'ASC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  return ok({ data: rows.map(serializeCustomer), meta: { total, limit, offset } });
}

export async function getCustomerStatement(req: Request): Promise<ControllerResult> {
  const { id } = req.params;
  const q = getValidatedQuery<z.infer<typeof customerStatementQuerySchema>>(req);
  const dateFrom = (q.dateFrom || '1970-01-01').slice(0, 10);
  const dateTo = (q.dateTo || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const data = await getCustomerStatementService(id, dateFrom, dateTo);
  return ok({ data });
}

export async function getCustomer(req: Request): Promise<ControllerResult> {
  const row = await Customer.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['paymentTerms', 'taxProfile', 'town', 'area'],
  });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeCustomer(row) });
}

export async function createCustomer(req: Request, body: CreateCustomerInput): Promise<ControllerResult> {
  const row = await createCustomerService(body);
  return created({ data: serializeCustomer(row) });
}

export async function updateCustomer(req: Request, body: UpdateCustomerInput): Promise<ControllerResult> {
  const row = await updateCustomerService(req.params.id, body);
  return ok({ data: serializeCustomer(row) });
}

export async function deleteCustomer(req: Request): Promise<ControllerResult> {
  const repo = Customer.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getCustomerSnapshotForAudit(id: string) {
  const c = await Customer.findOne({ where: { id }, relations: ['town', 'area'] });
  return c ? serializeCustomer(c) : undefined;
}
