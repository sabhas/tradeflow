import { Router } from 'express';
import { IsNull } from 'typeorm';
import { dataSource, ProductCategory } from '@tradeflow/db';
import { createProductCategorySchema, updateProductCategorySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';

export const productCategoriesRouter = Router();

productCategoriesRouter.use(authMiddleware, loadUser);

function serializeCategory(c: ProductCategory) {
  return {
    id: c.id,
    parentId: c.parentId,
    name: c.name,
    code: c.code,
    branchId: c.branchId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
  };
}

function buildTree(flat: ProductCategory[], parentId: string | null | undefined): unknown[] {
  return flat
    .filter((c) => (parentId == null ? c.parentId == null : c.parentId === parentId))
    .map((c) => ({
      ...serializeCategory(c),
      children: buildTree(flat, c.id),
    }));
}

productCategoriesRouter.get(
  '/',
  requirePermission('masters.products', 'read'),
  async (req, res) => {
    const tree = req.query.tree === 'true' || req.query.tree === '1';
    const branchId = resolveBranchId(req);
    const repo = dataSource.getRepository(ProductCategory);
    const flat = await repo.find({
      where: branchId ? [{ branchId: IsNull() }, { branchId }] : {},
      order: { name: 'ASC' },
    });
    const active = flat.filter((c) => !c.deletedAt);
    if (tree) {
      res.json({ data: buildTree(active, null) });
      return;
    }
    res.json({ data: active.map(serializeCategory) });
  }
);

productCategoriesRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = createProductCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(ProductCategory);
    const branchId = b.branchId ?? req.user?.branchId;
    const row = repo.create({
      parentId: b.parentId ?? undefined,
      name: b.name,
      code: b.code,
      branchId: branchId ?? undefined,
    });
    await repo.save(row);
    res.status(201).json({ data: serializeCategory(row) });
  }
);

productCategoriesRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const c = await dataSource.getRepository(ProductCategory).findOne({ where: { id: req.params.id } });
      return c ? serializeCategory(c) : undefined;
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateProductCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const repo = dataSource.getRepository(ProductCategory);
    const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = parsed.data;
    if (b.name !== undefined) row.name = b.name;
    if (b.code !== undefined) row.code = b.code;
    if (b.parentId !== undefined) row.parentId = b.parentId ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);
    res.json({ data: serializeCategory(row) });
  }
);

productCategoriesRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductCategory',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const c = await dataSource.getRepository(ProductCategory).findOne({ where: { id: req.params.id } });
      return c ? serializeCategory(c) : undefined;
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(ProductCategory);
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
