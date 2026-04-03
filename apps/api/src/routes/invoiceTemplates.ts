import { Router } from 'express';
import { dataSource, InvoiceTemplate } from '@tradeflow/db';
import { createInvoiceTemplateSchema, updateInvoiceTemplateSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const invoiceTemplatesRouter = Router();
invoiceTemplatesRouter.use(authMiddleware, loadUser);

function serialize(t: InvoiceTemplate) {
  return {
    id: t.id,
    name: t.name,
    config: t.config,
    branchId: t.branchId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

invoiceTemplatesRouter.get('/', requirePermission('settings', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const qb = dataSource.getRepository(InvoiceTemplate).createQueryBuilder('t').orderBy('t.name', 'ASC');
  if (branchId) {
    qb.andWhere('(t.branch_id IS NULL OR t.branch_id = :bid)', { bid: branchId });
  }
  const rows = await qb.getMany();
  res.json({ data: rows.map(serialize) });
});

invoiceTemplatesRouter.get('/:id', requirePermission('settings', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(InvoiceTemplate).findOne({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row) });
});

invoiceTemplatesRouter.post(
  '/',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'InvoiceTemplate', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createInvoiceTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const row = dataSource.getRepository(InvoiceTemplate).create({
      name: b.name.trim(),
      config: b.config,
      branchId: b.branchId ?? undefined,
    });
    await dataSource.getRepository(InvoiceTemplate).save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

invoiceTemplatesRouter.patch(
  '/:id',
  requirePermission('settings', 'write'),
  auditMiddleware({
    entity: 'InvoiceTemplate',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateInvoiceTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const row = await dataSource.getRepository(InvoiceTemplate).findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name.trim();
    if (b.config !== undefined) row.config = { ...row.config, ...b.config };
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await dataSource.getRepository(InvoiceTemplate).save(row);
    res.json({ data: serialize(row) });
  }
);
