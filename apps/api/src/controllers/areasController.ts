import type { Request } from 'express';
import type { z } from 'zod';
import { Area, Customer, Town } from '@tradeflow/db';
import { createAreaSchema, updateAreaSchema } from '@tradeflow/shared';
import { IsNull } from 'typeorm';
import { resolveBranchId } from '../utils/branchScope';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateAreaInput = z.infer<typeof createAreaSchema>;
type UpdateAreaInput = z.infer<typeof updateAreaSchema>;

export function serializeArea(a: Area) {
  return {
    id: a.id,
    name: a.name,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    deletedAt: a.deletedAt,
  };
}

export async function listAreas(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const qb = Area.createQueryBuilder('a').where('a.deleted_at IS NULL');
  if (branchId) {
    qb.andWhere(
      `EXISTS (
        SELECT 1 FROM towns t
        WHERE t.area_id = a.id
          AND t.deleted_at IS NULL
          AND (t.branch_id IS NULL OR t.branch_id = :bid)
      )`,
      { bid: branchId }
    );
  }
  qb.orderBy('a.name', 'ASC');
  const rows = await qb.getMany();
  return ok({ data: rows.map(serializeArea) });
}

export async function createArea(req: Request, body: CreateAreaInput): Promise<ControllerResult> {
  const repo = Area.getRepository();
  const row = repo.create({
    name: body.name.trim(),
  });
  await repo.save(row);
  return created({ data: serializeArea(row) });
}

export async function updateArea(req: Request, body: UpdateAreaInput): Promise<ControllerResult> {
  const repo = Area.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name.trim();
  await repo.save(row);
  return ok({ data: serializeArea(row) });
}

export async function deleteArea(req: Request): Promise<ControllerResult> {
  const repo = Area.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const townCount = await Town.count({ where: { areaId: row.id, deletedAt: IsNull() } });
  if (townCount > 0) {
    throw new HttpError(400, { error: 'Reassign towns from this area before deleting it' });
  }
  const custCount = await Customer.count({ where: { areaId: row.id, deletedAt: IsNull() } });
  if (custCount > 0) {
    throw new HttpError(400, { error: 'Reassign customers from this area before deleting it' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getAreaSnapshotForAudit(id: string) {
  const a = await Area.findOne({ where: { id } });
  return a ? serializeArea(a) : undefined;
}
