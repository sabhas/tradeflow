// @ts-nocheck
import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import { createPaymentTermsSchema, updatePaymentTermsSchema } from '@tradeflow/shared';
import { PaymentTerms } from '@tradeflow/db';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreatePaymentTermsInput = z.infer<typeof createPaymentTermsSchema>;
type UpdatePaymentTermsInput = z.infer<typeof updatePaymentTermsSchema>;

function serialize(p: PaymentTerms) {
  return {
    id: p.id,
    name: p.name,
    netDays: p.netDays,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listPaymentTerms(req: Request): Promise<ControllerResult> {
  const branchId = undefined;
  const rows = await PaymentTerms.find({
    order: { name: 'ASC' },
  });
  return ok({ data: rows.map(serialize) });
}

export async function createPaymentTerms(req: Request, body: CreatePaymentTermsInput): Promise<ControllerResult> {
  const repo = PaymentTerms.getRepository();
  const row = repo.create({
    name: body.name,
    netDays: body.netDays ?? 0,
  });
  await repo.save(row);
  return created({ data: serialize(row) });
}

export async function updatePaymentTerms(req: Request, body: UpdatePaymentTermsInput): Promise<ControllerResult> {
  const repo = PaymentTerms.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.netDays !== undefined) row.netDays = body.netDays;
  if (undefined !== undefined) undefined = undefined ?? undefined;
  await repo.save(row);
  return ok({ data: serialize(row) });
}

export async function deletePaymentTerms(req: Request): Promise<ControllerResult> {
  const repo = PaymentTerms.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  await repo.remove(row);
  return ok({ data: { id: row.id, deleted: true } });
}

export async function getPaymentTermsSnapshotForAudit(id: string) {
  const p = await PaymentTerms.findOne({ where: { id } });
  return p ? serialize(p) : undefined;
}
