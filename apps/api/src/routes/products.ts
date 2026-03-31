import { Router } from 'express';
import { Brackets, In, IsNull } from 'typeorm';
import {
  dataSource,
  Product,
  ProductPrice,
  ProductCategory,
  UnitOfMeasure,
  PriceLevel,
} from '@tradeflow/db';
import { createProductSchema, updateProductSchema, replaceProductPricesSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { resolveBranchId } from '../utils/branchScope';
import { getPagination } from '../utils/pagination';

export const productsRouter = Router();

productsRouter.use(authMiddleware, loadUser);

function serializeProduct(p: Product, prices?: ProductPrice[]) {
  return {
    id: p.id,
    categoryId: p.categoryId,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    unitId: p.unitId,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    batchTracked: p.batchTracked,
    expiryTracked: p.expiryTracked,
    minStock: p.minStock,
    reorderLevel: p.reorderLevel,
    branchId: p.branchId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
    prices:
      prices?.map((pp) => ({
        id: pp.id,
        priceLevelId: pp.priceLevelId,
        price: pp.price,
      })) ?? undefined,
  };
}

async function loadProductPrices(productId: string) {
  return dataSource.getRepository(ProductPrice).find({
    where: { productId },
    relations: ['priceLevel'],
  });
}

productsRouter.get('/', requirePermission('masters.products', 'read'), async (req, res) => {
  const branchId = resolveBranchId(req);
  const { limit, offset } = getPagination(req);
  const categoryId = req.query.categoryId as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  const qb = dataSource
    .getRepository(Product)
    .createQueryBuilder('p')
    .where('p.deleted_at IS NULL');

  if (branchId) {
    qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
  }
  if (categoryId) {
    qb.andWhere('p.category_id = :cid', { cid: categoryId });
  }
  if (search) {
    const term = `%${search.toLowerCase()}%`;
    qb.andWhere(
      new Brackets((q) => {
        q.where('LOWER(p.name) LIKE :term', { term })
          .orWhere('LOWER(p.sku) LIKE :term', { term })
          .orWhere('LOWER(p.barcode) LIKE :term', { term });
      })
    );
  }

  qb.orderBy('p.name', 'ASC').take(limit).skip(offset);

  const [rows, total] = await qb.getManyAndCount();
  const ids = rows.map((r) => r.id);
  const priceRows =
    ids.length > 0
      ? await dataSource.getRepository(ProductPrice).find({
          where: { productId: In(ids) },
        })
      : [];
  const byProduct = new Map<string, ProductPrice[]>();
  for (const pr of priceRows) {
    const list = byProduct.get(pr.productId) ?? [];
    list.push(pr);
    byProduct.set(pr.productId, list);
  }

  res.json({
    data: rows.map((p) => serializeProduct(p, byProduct.get(p.id))),
    meta: { total, limit, offset },
  });
});

productsRouter.get(
  '/:id/prices',
  requirePermission('masters.products', 'read'),
  async (req, res) => {
    const p = await dataSource.getRepository(Product).findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    });
    if (!p) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const prices = await loadProductPrices(p.id);
    res.json({
      data: prices.map((pp) => ({ id: pp.id, priceLevelId: pp.priceLevelId, price: pp.price })),
    });
  }
);

productsRouter.put(
  '/:id/prices',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'ProductPrice',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => loadProductPrices(req.params.id),
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = replaceProductPricesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const p = await dataSource.getRepository(Product).findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    });
    if (!p) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await dataSource.transaction(async (em) => {
      await em.getRepository(ProductPrice).delete({ productId: p.id });
      const pRepo = em.getRepository(ProductPrice);
      for (const pr of parsed.data.prices) {
        const pl = await em.getRepository(PriceLevel).findOne({ where: { id: pr.priceLevelId } });
        if (!pl) continue;
        await pRepo.save(
          pRepo.create({
            productId: p.id,
            priceLevelId: pr.priceLevelId,
            price: pr.price,
          })
        );
      }
    });
    const prices = await loadProductPrices(p.id);
    res.json({
      data: prices.map((pp) => ({ id: pp.id, priceLevelId: pp.priceLevelId, price: pp.price })),
    });
  }
);

productsRouter.get('/:id', requirePermission('masters.products', 'read'), async (req, res) => {
  const p = await dataSource.getRepository(Product).findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['category', 'unit'],
  });
  if (!p) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const prices = await loadProductPrices(p.id);
  res.json({ data: serializeProduct(p, prices) });
});

productsRouter.post(
  '/',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const category = await dataSource.getRepository(ProductCategory).findOne({
      where: { id: b.categoryId, deletedAt: IsNull() },
    });
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    const unit = await dataSource.getRepository(UnitOfMeasure).findOne({ where: { id: b.unitId } });
    if (!unit) {
      res.status(400).json({ error: 'Invalid unit' });
      return;
    }

    const branchId = b.branchId ?? req.user?.branchId;

    let row: Product;
    let prices: ProductPrice[];
    await dataSource.transaction(async (em) => {
      const repo = em.getRepository(Product);
      row = repo.create({
        categoryId: b.categoryId,
        sku: b.sku.trim(),
        barcode: b.barcode?.trim() || undefined,
        name: b.name,
        unitId: b.unitId,
        costPrice: b.costPrice ?? '0',
        sellingPrice: b.sellingPrice ?? '0',
        batchTracked: b.batchTracked ?? false,
        expiryTracked: b.expiryTracked ?? false,
        minStock: b.minStock ?? undefined,
        reorderLevel: b.reorderLevel ?? undefined,
        branchId: branchId ?? undefined,
      });
      await repo.save(row);

      if (b.prices?.length) {
        const pRepo = em.getRepository(ProductPrice);
        for (const pr of b.prices) {
          const pl = await em.getRepository(PriceLevel).findOne({ where: { id: pr.priceLevelId } });
          if (!pl) continue;
          await pRepo.save(
            pRepo.create({
              productId: row.id,
              priceLevelId: pr.priceLevelId,
              price: pr.price,
            })
          );
        }
      }

      prices = await em.getRepository(ProductPrice).find({ where: { productId: row.id } });
    });
    res.status(201).json({ data: serializeProduct(row!, prices!) });
  }
);

productsRouter.patch(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const row = await dataSource.getRepository(Product).findOne({ where: { id: req.params.id } });
      if (!row) return undefined;
      const prices = await loadProductPrices(row.id);
      return serializeProduct(row, prices);
    },
    getNewValue: (req) => req.body,
  }),
  async (req, res) => {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const repo = dataSource.getRepository(Product);
    const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (b.categoryId) {
      const c = await dataSource.getRepository(ProductCategory).findOne({
        where: { id: b.categoryId, deletedAt: IsNull() },
      });
      if (!c) {
        res.status(400).json({ error: 'Invalid category' });
        return;
      }
      row.categoryId = b.categoryId;
    }
    if (b.unitId) {
      const u = await dataSource.getRepository(UnitOfMeasure).findOne({ where: { id: b.unitId } });
      if (!u) {
        res.status(400).json({ error: 'Invalid unit' });
        return;
      }
      row.unitId = b.unitId;
    }
    if (b.sku !== undefined) row.sku = b.sku.trim();
    if (b.barcode !== undefined) row.barcode = b.barcode?.trim() || undefined;
    if (b.name !== undefined) row.name = b.name;
    if (b.costPrice !== undefined) row.costPrice = b.costPrice;
    if (b.sellingPrice !== undefined) row.sellingPrice = b.sellingPrice;
    if (b.batchTracked !== undefined) row.batchTracked = b.batchTracked;
    if (b.expiryTracked !== undefined) row.expiryTracked = b.expiryTracked;
    if (b.minStock !== undefined) row.minStock = b.minStock ?? undefined;
    if (b.reorderLevel !== undefined) row.reorderLevel = b.reorderLevel ?? undefined;
    if (b.branchId !== undefined) row.branchId = b.branchId ?? undefined;
    await repo.save(row);

    if (b.prices?.length) {
      await dataSource.transaction(async (em) => {
        await em.getRepository(ProductPrice).delete({ productId: row.id });
        const pRepo = em.getRepository(ProductPrice);
        for (const pr of b.prices!) {
          await pRepo.save(
            pRepo.create({
              productId: row.id,
              priceLevelId: pr.priceLevelId,
              price: pr.price,
            })
          );
        }
      });
    }

    const prices = await loadProductPrices(row.id);
    res.json({ data: serializeProduct(row, prices) });
  }
);

productsRouter.delete(
  '/:id',
  requirePermission('masters.products', 'write'),
  auditMiddleware({
    entity: 'Product',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => {
      const row = await dataSource.getRepository(Product).findOne({ where: { id: req.params.id } });
      if (!row) return undefined;
      return serializeProduct(row, await loadProductPrices(row.id));
    },
  }),
  async (req, res) => {
    const repo = dataSource.getRepository(Product);
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
