import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, Supplier } from '@tradeflow/db';
import { createSupplierSchema, updateSupplierSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const suppliersRouter = Router();
suppliersRouter.use(authMiddleware, loadUser);

function serialize(s: Supplier) {
  return {
    id: s.id,
    name: s.name,
    contact: s.contact,
    paymentTermsId: s.paymentTermsId,
    taxProfileId: s.taxProfileId,
    branchId: s.branchId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
  };
}

suppliersRouter.get('/', requirePermission('masters.suppliers', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const search = (req.query.search as string | undefined)?.trim();

  const qb = dataSource
    .getRepository(Supplier)
    .createQueryBuilder('s')
    .where('s.deleted_at IS NULL');

  if (branchId) {
    qb.andWhere('(s.branch_id IS NULL OR s.branch_id = :bid)', { bid: branchId });
  }
  if (search) {
    qb.andWhere('LOWER(s.name) LIKE :term', { term: `%${search.toLowerCase()}%` });
  }
  qb.orderBy('s.name', 'ASC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map(serialize), meta: { total, limit, offset } });
});

suppliersRouter.get('/:id', requirePermission('masters.suppliers', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(Supplier).findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['paymentTerms', 'taxProfile'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row) });
});

suppliersRouter.post(
  '/',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({ entity: 'Supplier', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(Supplier);
    const row = repo.create({
      name: b.name,
      contact: b.contact ?? undefined,
      paymentTermsId: b.paymentTermsId ?? undefined,
      taxProfileId: b.taxProfileId ?? undefined,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

suppliersRouter.patch(
  '/:id',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({
    entity: 'Supplier',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const s = await dataSource.getRepository(Supplier).findOne({ where: { id: req.params.id } });
      return s ? serialize(s) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(Supplier);
    const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.contact !== undefined) row.contact = b.contact ?? undefined;
    if (b.paymentTermsId !== undefined) row.paymentTermsId = b.paymentTermsId ?? undefined;
    if (b.taxProfileId !== undefined) row.taxProfileId = b.taxProfileId ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);

suppliersRouter.delete(
  '/:id',
  requirePermission('masters.suppliers', 'write'),
  auditMiddleware({
    entity: 'Supplier',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const s = await dataSource.getRepository(Supplier).findOne({ where: { id: req.params.id } });
      return s ? serialize(s) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(Supplier);
    const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    row.deletedAt = new Date();
    await repo.save(row);
    res.json({ data: { id: row.id, deleted: true } });
  }
);
