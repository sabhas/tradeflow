import type { Request } from 'express';
import type { z } from 'zod';
import { createWarehouseSchema, updateWarehouseSchema } from '@tradeflow/shared';
import { Warehouse } from '@tradeflow/db';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;

export function serializeWarehouse(w: Warehouse) {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    isDefault: w.isDefault,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

async function ensureDefaultWarehouse() {
  const repo = Warehouse.getRepository();
  const count = await repo.count();
  if (count > 0) return;
  await repo.save(
    repo.create({
      name: 'Main',
      code: 'MAIN',
      isDefault: true,
    })
  );
}

export async function getWarehouseSnapshotForAudit(id: string) {
  const w = await Warehouse.findOne({ where: { id } });
  return w ? serializeWarehouse(w) : undefined;
}

export async function listWarehouses(req: Request): Promise<ControllerResult> {
  await ensureDefaultWarehouse();
  const rows = await Warehouse.find({
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serializeWarehouse) });
}

export async function getWarehouse(req: Request): Promise<ControllerResult> {
  const row = await Warehouse.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serializeWarehouse(row) });
}

export async function createWarehouse(req: Request, body: CreateWarehouseInput): Promise<ControllerResult> {
  const repo = Warehouse.getRepository();
  if (body.isDefault) {
    await repo.createQueryBuilder().update(Warehouse).set({ isDefault: false }).execute();
  }
  const row = repo.create({
    name: body.name,
    code: body.code,
    isDefault: body.isDefault ?? false,
  });
  await repo.save(row);
  return created({ data: serializeWarehouse(row) });
}

export async function updateWarehouse(req: Request, body: UpdateWarehouseInput): Promise<ControllerResult> {
  const repo = Warehouse.getRepository();
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
  if (body.isDefault !== undefined) row.isDefault = body.isDefault;
  await repo.save(row);
  return ok({ data: serializeWarehouse(row) });
}
