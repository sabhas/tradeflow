import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createUnitSchema, updateUnitSchema } from '@tradeflow/shared';
import { dataSource, UnitOfMeasure } from '@tradeflow/db';
import { resolveBranchId } from '../utils/branchScope';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateUnitInput = z.infer<typeof createUnitSchema>;
type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

export function serializeUnit(u: UnitOfMeasure) {
  return {
    id: u.id,
    code: u.code,
    name: u.name,
    branchId: u.branchId,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export async function listUnits(req: Request): Promise<ControllerResult> {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(UnitOfMeasure).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serializeUnit) });
}

export async function createUnit(req: Request, body: CreateUnitInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(UnitOfMeasure);
  const row = repo.create({
    code: body.code,
    name: body.name,
    branchId: body.branchId ?? req.user?.branchId ?? undefined,
  });
  await repo.save(row);
  return created({ data: serializeUnit(row) });
}

export async function updateUnit(req: Request, body: UpdateUnitInput): Promise<ControllerResult> {
  const repo = dataSource.getRepository(UnitOfMeasure);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.code !== undefined) row.code = body.code;
  if (body.name !== undefined) row.name = body.name;
  if (body.branchId !== undefined) row.branchId = body.branchId ?? undefined;
  await repo.save(row);
  return ok({ data: serializeUnit(row) });
}

export async function deleteUnit(req: Request): Promise<ControllerResult> {
  const repo = dataSource.getRepository(UnitOfMeasure);
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  await repo.remove(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getUnitSnapshotForAudit(id: string) {
  const u = await dataSource.getRepository(UnitOfMeasure).findOne({ where: { id } });
  return u ? serializeUnit(u) : undefined;
}
