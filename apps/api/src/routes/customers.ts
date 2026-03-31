import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, Customer } from '@tradeflow/db';
import { createCustomerSchema, updateCustomerSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const customersRouter = Router();
customersRouter.use(authMiddleware, loadUser);

function serialize(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    contact: c.contact,
    creditLimit: c.creditLimit,
    paymentTermsId: c.paymentTermsId,
    taxProfileId: c.taxProfileId,
    branchId: c.branchId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
  };
}

customersRouter.get('/', requirePermission('masters.customers', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const search = (req.query.search as string | undefined)?.trim();

  const qb = dataSource
    .getRepository(Customer)
    .createQueryBuilder('c')
    .where('c.deleted_at IS NULL');

  if (branchId) {
    qb.andWhere('(c.branch_id IS NULL OR c.branch_id = :bid)', { bid: branchId });
  }
  if (search) {
    qb.andWhere('LOWER(c.name) LIKE :term', { term: `%${search.toLowerCase()}%` });
  }
  qb.orderBy('c.name', 'ASC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  res.json({ data: rows.map(serialize), meta: { total, limit, offset } });
});

customersRouter.get('/:id', requirePermission('masters.customers', 'read'), async (req, res) => {
  const row = await dataSource.getRepository(Customer).findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['paymentTerms', 'taxProfile'],
  });
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ data: serialize(row) });
});

customersRouter.post(
  '/',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({ entity: 'Customer', getNewValue: (req) => req.body }),
  async (req, res) => {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(Customer);
    const row = repo.create({
      name: b.name,
      type: b.type,
      contact: b.contact ?? undefined,
      creditLimit: b.creditLimit ?? '0',
      paymentTermsId: b.paymentTermsId ?? undefined,
      taxProfileId: b.taxProfileId ?? undefined,
      branchId: b.branchId ?? req.user?.branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serialize(row) });
  }
);

customersRouter.patch(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Customer',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const c = await dataSource.getRepository(Customer).findOne({ where: { id: req.params.id } });
      return c ? serialize(c) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(Customer);
    const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.type !== undefined) row.type = b.type;
    if (b.contact !== undefined) row.contact = b.contact ?? undefined;
    if (b.creditLimit !== undefined) row.creditLimit = b.creditLimit;
    if (b.paymentTermsId !== undefined) row.paymentTermsId = b.paymentTermsId ?? undefined;
    if (b.taxProfileId !== undefined) row.taxProfileId = b.taxProfileId ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serialize(row) });
  }
);

customersRouter.delete(
  '/:id',
  requirePermission('masters.customers', 'write'),
  auditMiddleware({
    entity: 'Customer',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const c = await dataSource.getRepository(Customer).findOne({ where: { id: req.params.id } });
      return c ? serialize(c) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(Customer);
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
