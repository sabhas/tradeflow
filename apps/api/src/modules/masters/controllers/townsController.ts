import type { Request } from 'express';
import type { z } from 'zod';
import { Area, Customer, Town } from '@tradeflow/db';
import { createTownSchema, listTownsQuerySchema, updateTownSchema } from '@tradeflow/shared';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { IsNull } from 'typeorm';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';

type CreateTownInput = z.infer<typeof createTownSchema>;
type UpdateTownInput = z.infer<typeof updateTownSchema>;

export function serializeTown(t: Town) {
  return {
    id: t.id,
    name: t.name,
    areaId: t.areaId,
    area: t.area ? { id: t.area.id, name: t.area.name } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    deletedAt: t.deletedAt,
  };
}

export async function listTowns(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof listTownsQuerySchema>>(req);
  const areaId = q.areaId?.trim();
  const qb = Town.createQueryBuilder('t').leftJoinAndSelect('t.area', 'a').where('t.deleted_at IS NULL');
  if (areaId) {
    qb.andWhere('t.area_id = :aid', { aid: areaId });
  }
  qb.orderBy('t.name', 'ASC');
  const rows = await qb.getMany();
  return ok({ data: rows.map(serializeTown) });
}

export async function createTown(req: Request, body: CreateTownInput): Promise<ControllerResult> {
  const area = await Area.findOne({ where: { id: body.areaId, deletedAt: IsNull() } });
  if (!area) {
    throw new HttpError(400, { error: 'Unknown area' });
  }
  const repo = Town.getRepository();
  const row = repo.create({
    name: body.name.trim(),
    areaId: body.areaId,
  });
  await repo.save(row);
  const withArea = await repo.findOne({ where: { id: row.id }, relations: ['area'] });
  return created({ data: serializeTown(withArea || row) });
}

export async function updateTown(req: Request, body: UpdateTownInput): Promise<ControllerResult> {
  const repo = Town.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.areaId !== undefined) {
    const area = await Area.findOne({ where: { id: body.areaId, deletedAt: IsNull() } });
    if (!area) {
      throw new HttpError(400, { error: 'Unknown area' });
    }
    row.areaId = body.areaId;
  }
  if (body.name !== undefined) row.name = body.name.trim();
  await repo.save(row);
  const withArea = await repo.findOne({ where: { id: row.id }, relations: ['area'] });
  return ok({ data: serializeTown(withArea || row) });
}

export async function deleteTown(req: Request): Promise<ControllerResult> {
  const repo = Town.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const custCount = await Customer.count({ where: { townId: row.id, deletedAt: IsNull() } });
  if (custCount > 0) {
    throw new HttpError(400, { error: 'Reassign customers from this town before deleting it' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getTownSnapshotForAudit(id: string) {
  const t = await Town.findOne({ where: { id } });
  return t ? serializeTown(t) : undefined;
}
