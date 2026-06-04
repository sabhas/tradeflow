import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createSalespersonSchema, updateSalespersonSchema } from '@tradeflow/shared';
import { Salesperson } from '@tradeflow/db';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeSalesperson } from '../serializers/salesperson.serializer';

type CreateSalespersonInput = z.infer<typeof createSalespersonSchema>;
type UpdateSalespersonInput = z.infer<typeof updateSalespersonSchema>;

export async function listSalespersons(req: Request): Promise<ControllerResult> {
  const rows = await Salesperson.find({
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serializeSalesperson) });
}

export async function createSalesperson(
  req: Request,
  body: CreateSalespersonInput
): Promise<ControllerResult> {
  const repo = Salesperson.getRepository();
  const row = repo.create({
    name: body.name,
    code: body.code,
  });
  await repo.save(row);
  return created({ data: serializeSalesperson(row) });
}

export async function updateSalesperson(
  req: Request,
  body: UpdateSalespersonInput
): Promise<ControllerResult> {
  const repo = Salesperson.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.code !== undefined) row.code = body.code;
  await repo.save(row);
  return ok({ data: serializeSalesperson(row) });
}

export async function deleteSalesperson(req: Request): Promise<ControllerResult> {
  const repo = Salesperson.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  await repo.remove(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getSalespersonSnapshotForAudit(id: string) {
  const s = await Salesperson.findOne({ where: { id } });
  return s ? serializeSalesperson(s) : undefined;
}
