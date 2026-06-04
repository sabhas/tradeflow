import type { Request } from 'express';
import type { z } from 'zod';
import { Customer, CustomerType } from '@tradeflow/db';
import { IsNull } from 'typeorm';
import { createCustomerTypeSchema, updateCustomerTypeSchema } from '@tradeflow/shared';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeCustomerType } from '../serializers/customerType.serializer';

type CreateCustomerTypeInput = z.infer<typeof createCustomerTypeSchema>;
type UpdateCustomerTypeInput = z.infer<typeof updateCustomerTypeSchema>;

export async function listCustomerTypes(req: Request): Promise<ControllerResult> {
  const rows = await CustomerType.createQueryBuilder('ct')
    .where('ct.deleted_at IS NULL')
    .orderBy('ct.name', 'ASC')
    .getMany();
  return ok({ data: rows.map(serializeCustomerType) });
}

export async function createCustomerType(
  req: Request,
  body: CreateCustomerTypeInput
): Promise<ControllerResult> {
  const name = body.name.trim();
  const existing = await CustomerType.createQueryBuilder('ct')
    .where('LOWER(TRIM(ct.name)) = LOWER(TRIM(:name))', { name })
    .andWhere('ct.deleted_at IS NULL')
    .getOne();
  if (existing) {
    throw new HttpError(400, { error: 'Customer type already exists' });
  }
  const repo = CustomerType.getRepository();
  const row = repo.create({ name });
  await repo.save(row);
  return created({ data: serializeCustomerType(row) });
}

export async function updateCustomerType(
  req: Request,
  body: UpdateCustomerTypeInput
): Promise<ControllerResult> {
  const repo = CustomerType.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) {
    const name = body.name.trim();
    const existing = await CustomerType.createQueryBuilder('ct')
      .where('LOWER(TRIM(ct.name)) = LOWER(TRIM(:name))', { name })
      .andWhere('ct.id != :id', { id: row.id })
      .andWhere('ct.deleted_at IS NULL')
      .getOne();
    if (existing) {
      throw new HttpError(400, { error: 'Customer type already exists' });
    }
    const oldName = row.name;
    row.name = name;
    await repo.save(row);
    await Customer.createQueryBuilder()
      .update(Customer)
      .set({ type: name })
      .where('type = :oldName', { oldName })
      .andWhere('deleted_at IS NULL')
      .execute();
    return ok({ data: serializeCustomerType(row) });
  }
  await repo.save(row);
  return ok({ data: serializeCustomerType(row) });
}

export async function deleteCustomerType(req: Request): Promise<ControllerResult> {
  const repo = CustomerType.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const inUse = await Customer.createQueryBuilder('c')
    .where('LOWER(TRIM(c.type)) = LOWER(TRIM(:name))', { name: row.name })
    .andWhere('c.deleted_at IS NULL')
    .getCount();
  if (inUse > 0) {
    throw new HttpError(400, { error: 'Reassign customers using this type before deleting it' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getCustomerTypeSnapshotForAudit(id: string) {
  const row = await CustomerType.findOne({ where: { id } });
  return row ? serializeCustomerType(row) : undefined;
}
