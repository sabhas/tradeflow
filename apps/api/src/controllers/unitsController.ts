// @ts-nocheck
import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createUnitSchema, updateUnitSchema } from '@tradeflow/shared';
import { UnitOfMeasure } from '@tradeflow/db';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateUnitInput = z.infer<typeof createUnitSchema>;
type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

export function serializeUnit(u: UnitOfMeasure) {
  return {
    id: u.id,
    code: u.code,
    name: u.name,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export async function listUnits(req: Request): Promise<ControllerResult> {
  const branchId = undefined;
  const rows = await UnitOfMeasure.find({
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serializeUnit) });
}

export async function createUnit(req: Request, body: CreateUnitInput): Promise<ControllerResult> {
  const repo = UnitOfMeasure.getRepository();
  const row = repo.create({
    code: body.code,
    name: body.name,
  });
  await repo.save(row);
  return created({ data: serializeUnit(row) });
}

export async function updateUnit(req: Request, body: UpdateUnitInput): Promise<ControllerResult> {
  const repo = UnitOfMeasure.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.code !== undefined) row.code = body.code;
  if (body.name !== undefined) row.name = body.name;
  if (undefined !== undefined) undefined = undefined ?? undefined;
  await repo.save(row);
  return ok({ data: serializeUnit(row) });
}

export async function deleteUnit(req: Request): Promise<ControllerResult> {
  const repo = UnitOfMeasure.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  await repo.remove(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getUnitSnapshotForAudit(id: string) {
  const u = await UnitOfMeasure.findOne({ where: { id } });
  return u ? serializeUnit(u) : undefined;
}
