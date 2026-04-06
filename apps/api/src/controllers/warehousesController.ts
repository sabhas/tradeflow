import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createWarehouseSchema, updateWarehouseSchema } from '@tradeflow/shared';
import { dataSource, Warehouse, Branch } from '@tradeflow/db';
import { resolveBranchId } from '../utils/branchScope';
import { created, ok, type ControllerResult } from './controllerResult';
import { HttpError } from './httpError';

type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

export function serializeWarehouse(w: Warehouse) {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    branchId: w.branchId,
    isDefault: w.isDefault,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

async function ensureDefaultWarehouse() {
  const repo = dataSource.getRepository(Warehouse);
  const count = await repo.count();
  if (count > 0) return;
  let branch = await dataSource.getRepository(Branch).findOne({ where: { code: 'MAIN' } });
  if (!branch) {
    branch = await dataSource.getRepository(Branch).save(
      dataSource.getRepository(Branch).create({ name: 'Main', code: 'MAIN' })
    );
  }
  await repo.save(
    repo.create({
      name: 'Main',
      code: 'MAIN',
      branchId: branch.id,
      isDefault: true,
    })
  );
}

export async function getWarehouseSnapshotForAudit(id: string) {
  const w = await dataSource.getRepository(Warehouse).findOne({ where: { id } });
  return w ? serializeWarehouse(w) : undefined;
}

export async function listWarehouses(req: Request): Promise<ControllerResult> {
  await ensureDefaultWarehouse();
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(Warehouse).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serializeWarehouse) });
}

export async function getWarehouse(req: Request): Promise<ControllerResult> {
  const row = await dataSource.getRepository(Warehouse).findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeWarehouse(row) });
}

export async function createWarehouse(req: Request, body: CreateWarehouseInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(Warehouse);
  if (body.isDefault) {
    await repo.createQueryBuilder().update(Warehouse).set({ isDefault: false }).execute();
  }
  const row = repo.create({
    name: body.name,
    code: body.code,
    branchId: body.branchId ?? req.user?.branchId ?? undefined,
    isDefault: body.isDefault ?? false,
  });
  await repo.save(row);
  return created({ data: serializeWarehouse(row) });
}

export async function updateWarehouse(req: Request, body: UpdateWarehouseInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(Warehouse);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.isDefault) {
    await repo
      .createQueryBuilder()
      .update(Warehouse)
      .set({ isDefault: false })
      .where('id <> :id', { id: row.id })
      .execute();
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.code !== undefined) row.code = body.code;
  if (body.branchId !== undefined) row.branchId = body.branchId ?? undefined;
  if (body.isDefault !== undefined) row.isDefault = body.isDefault;
  await repo.save(row);
  return ok({ data: serializeWarehouse(row) });
}
