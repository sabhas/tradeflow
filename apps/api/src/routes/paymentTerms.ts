import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, PaymentTerms } from '@tradeflow/db';
import { createPaymentTermsSchema, updatePaymentTermsSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const paymentTermsRouter = Router();
paymentTermsRouter.use(authMiddleware, loadUser);

function serialize(p: PaymentTerms) {
  return {
    id: p.id,
    name: p.name,
    netDays: p.netDays,
    branchId: p.branchId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

paymentTermsRouter.get('/', requirePermission('masters.payment_terms', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const rows = await dataSource.getRepository(PaymentTerms).find({
    where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
    order: { name: 'ASC' },
  });
  res.json({ data: rows.map(serialize) });
});

paymentTermsRouter.post(
  '/',
  requirePermission('masters.payment_terms', 'write'),
  auditMiddleware({ entity: 'PaymentTerms', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createPaymentTermsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(PaymentTerms);
    const row = repo.create({
      name: b.name,
      netDays: b.netDays ?? 0,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

paymentTermsRouter.patch(
  '/:id',
  requirePermission('masters.payment_terms', 'write'),
  auditMiddleware({
    entity: 'PaymentTerms',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const p = await dataSource.getRepository(PaymentTerms).findOne({ where: { id: req.params.id } });
      return p ? serialize(p) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updatePaymentTermsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(PaymentTerms);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.netDays !== undefined) row.netDays = b.netDays;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);

paymentTermsRouter.delete(
  '/:id',
  requirePermission('masters.payment_terms', 'write'),
  auditMiddleware({
    entity: 'PaymentTerms',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const p = await dataSource.getRepository(PaymentTerms).findOne({ where: { id: req.params.id } });
      return p ? serialize(p) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(PaymentTerms);
    const row = await repo.findOne({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await repo.remove(row);
    res.json({ data: { id: row.id, deleted: true } });
  }
);
