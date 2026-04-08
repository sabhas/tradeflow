import type { Request } from 'express';
import type { z } from 'zod';
import { createInvoiceTemplateSchema, updateInvoiceTemplateSchema } from '@tradeflow/shared';
import { InvoiceTemplate } from '@tradeflow/db';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateInvoiceTemplateInput = z.infer<typeof createInvoiceTemplateSchema>;
type UpdateInvoiceTemplateInput = z.infer<typeof updateInvoiceTemplateSchema>;

function serialize(t: InvoiceTemplate) {
  return {
    id: t.id,
    name: t.name,
    config: t.config,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listInvoiceTemplates(req: Request): Promise<ControllerResult> {
  const qb = InvoiceTemplate.createQueryBuilder('t').orderBy('t.name', 'ASC');
  const rows = await qb.getMany();
  return ok({ data: rows.map(serialize) });
}

export async function getInvoiceTemplate(req: Request): Promise<ControllerResult> {
  const row = await InvoiceTemplate.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  return ok({ data: serialize(row) });
}

export async function createInvoiceTemplate(
  _req: Request,
  body: CreateInvoiceTemplateInput
): Promise<ControllerResult> {
  const row = InvoiceTemplate.create({
    name: body.name.trim(),
    config: body.config,
  });
  await InvoiceTemplate.save(row);
  return created({ data: serialize(row) });
}

export async function updateInvoiceTemplate(
  req: Request,
  body: UpdateInvoiceTemplateInput
): Promise<ControllerResult> {
  const row = await InvoiceTemplate.findOne({ where: { id: req.params.id } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name.trim();
  if (body.config !== undefined) row.config = { ...row.config, ...body.config };
    await InvoiceTemplate.save(row);
  return ok({ data: serialize(row) });
}
