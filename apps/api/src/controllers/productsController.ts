import type { Request } from 'express';
import type { z } from 'zod';
import { Brackets, In, IsNull } from 'typeorm';
import {
  dataSource,
  Product,
  ProductPrice,
  ProductCategory,
  Supplier,
  UnitOfMeasure,
  PriceLevel,
} from '@tradeflow/db';
import { createProductSchema, replaceProductPricesSchema, updateProductSchema } from '@tradeflow/shared';
import { getPagination } from '../utils/pagination';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { HttpError } from '../utils/httpError';

type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;
type ReplaceProductPricesInput = z.infer<typeof replaceProductPricesSchema>;

function serializeProduct(p: Product, prices?: ProductPrice[]) {
  return {
    id: p.id,
    supplierId: p.supplierId,
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : undefined,
    categoryId: p.categoryId,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    unitId: p.unitId,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    batchTracked: p.batchTracked,
    expiryTracked: p.expiryTracked,
    costingMethod: p.costingMethod ?? null,
    minStock: p.minStock,
    reorderLevel: p.reorderLevel,
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
  return ProductPrice.find({
    where: { productId },
    relations: ['priceLevel'],
  });
}

export async function listProducts(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const categoryId = req.query.categoryId as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();

  const qb = Product
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.supplier', 'supplier')
    .where('p.deleted_at IS NULL');
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
      ? await ProductPrice.find({
          where: { productId: In(ids) },
        })
      : [];
  const byProduct = new Map<string, ProductPrice[]>();
  for (const pr of priceRows) {
    const list = byProduct.get(pr.productId) ?? [];
    list.push(pr);
    byProduct.set(pr.productId, list);
  }

  return ok({
    data: rows.map((p) => serializeProduct(p, byProduct.get(p.id))),
    meta: { total, limit, offset },
  });
}

export async function lookupProductByBarcode(req: Request): Promise<ControllerResult> {
  const code = req.params.barcode.trim();
  if (!code) {
    throw new HttpError(400, { error: 'Barcode required' });
  }
  const qb = Product
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.supplier', 'supplier')
    .where('p.deleted_at IS NULL AND p.barcode = :code', { code });
  const p = await qb.getOne();
  if (!p) {
    throw new HttpError(404, { error: 'No product for barcode' });
  }
  const prices = await loadProductPrices(p.id);
  return ok({ data: serializeProduct(p, prices) });
}

export async function getProductPrices(req: Request): Promise<ControllerResult> {
  const p = await Product.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
  });
  if (!p) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const prices = await loadProductPrices(p.id);
  return ok({
    data: prices.map((pp) => ({ id: pp.id, priceLevelId: pp.priceLevelId, price: pp.price })),
  });
}

export async function replaceProductPrices(req: Request, body: ReplaceProductPricesInput): Promise<ControllerResult> {
  const p = await Product.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
  });
  if (!p) {
    throw new HttpError(404, { error: 'Not found' });
  }
  await dataSource.transaction(async (em) => {
    await em.getRepository(ProductPrice).delete({ productId: p.id });
    const pRepo = em.getRepository(ProductPrice);
    for (const pr of body.prices) {
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
  return ok({
    data: prices.map((pp) => ({ id: pp.id, priceLevelId: pp.priceLevelId, price: pp.price })),
  });
}

export async function getProduct(req: Request): Promise<ControllerResult> {
  const p = await Product.findOne({
    where: { id: req.params.id, deletedAt: IsNull() },
    relations: ['category', 'unit', 'supplier'],
  });
  if (!p) {
    throw new HttpError(404, { error: 'Not found' });
  }
  const prices = await loadProductPrices(p.id);
  return ok({ data: serializeProduct(p, prices) });
}

export async function createProduct(req: Request, b: CreateProductInput): Promise<ControllerResult> {
  const category = await ProductCategory.findOne({
    where: { id: b.categoryId, deletedAt: IsNull() },
  });
  if (!category) {
    throw new HttpError(400, { error: 'Invalid category' });
  }
  const unit = await UnitOfMeasure.findOne({ where: { id: b.unitId } });
  if (!unit) {
    throw new HttpError(400, { error: 'Invalid unit' });
  }
  const supplier = await Supplier.findOne({
    where: { id: b.supplierId, deletedAt: IsNull() },
  });
  if (!supplier) {
    throw new HttpError(400, { error: 'Invalid supplier' });
  }
  let row: Product;
  let prices: ProductPrice[];
  await dataSource.transaction(async (em) => {
    const repo = em.getRepository(Product);
    row = repo.create({
      supplierId: b.supplierId,
      categoryId: b.categoryId,
      sku: b.sku.trim(),
      barcode: b.barcode?.trim() || undefined,
      name: b.name,
      unitId: b.unitId,
      costPrice: b.costPrice ?? '0',
      sellingPrice: b.sellingPrice ?? '0',
      batchTracked: b.batchTracked ?? false,
      expiryTracked: b.expiryTracked ?? false,
      costingMethod: b.costingMethod ?? undefined,
      minStock: b.minStock ?? undefined,
      reorderLevel: b.reorderLevel ?? undefined,
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
  const createdRow = await Product.findOneOrFail({
    where: { id: row!.id },
    relations: ['supplier'],
  });
  return created({ data: serializeProduct(createdRow, prices!) });
}

export async function updateProduct(req: Request, b: UpdateProductInput): Promise<ControllerResult> {
  const repo = Product.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (b.categoryId) {
    const c = await ProductCategory.findOne({
      where: { id: b.categoryId, deletedAt: IsNull() },
    });
    if (!c) {
      throw new HttpError(400, { error: 'Invalid category' });
    }
    row.categoryId = b.categoryId;
  }
  if (b.unitId) {
    const u = await UnitOfMeasure.findOne({ where: { id: b.unitId } });
    if (!u) {
      throw new HttpError(400, { error: 'Invalid unit' });
    }
    row.unitId = b.unitId;
  }
  if (b.supplierId) {
    const s = await Supplier.findOne({
      where: { id: b.supplierId, deletedAt: IsNull() },
    });
    if (!s) {
      throw new HttpError(400, { error: 'Invalid supplier' });
    }
    row.supplierId = b.supplierId;
  }
  if (b.sku !== undefined) row.sku = b.sku.trim();
  if (b.barcode !== undefined) row.barcode = b.barcode?.trim() || undefined;
  if (b.name !== undefined) row.name = b.name;
  if (b.costPrice !== undefined) row.costPrice = b.costPrice;
  if (b.sellingPrice !== undefined) row.sellingPrice = b.sellingPrice;
  if (b.batchTracked !== undefined) row.batchTracked = b.batchTracked;
  if (b.expiryTracked !== undefined) row.expiryTracked = b.expiryTracked;
  if (b.costingMethod !== undefined) row.costingMethod = b.costingMethod ?? undefined;
  if (b.minStock !== undefined) row.minStock = b.minStock ?? undefined;
  if (b.reorderLevel !== undefined) row.reorderLevel = b.reorderLevel ?? undefined;
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

  const withSupplier = await repo.findOne({
    where: { id: row.id },
    relations: ['supplier'],
  });
  const prices = await loadProductPrices(row.id);
  return ok({ data: serializeProduct(withSupplier ?? row, prices) });
}

export async function deleteProduct(req: Request): Promise<ControllerResult> {
  const repo = Product.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}

/** For audit middleware getOldValue on ProductPrice updates */
export async function loadProductPricesForAudit(productId: string) {
  return loadProductPrices(productId);
}

/** For audit middleware getOldValue on Product patch/delete */
export async function getOldProductSnapshotForAudit(req: Request) {
  const row = await Product.findOne({ where: { id: req.params.id } });
  if (!row) return undefined;
  return serializeProduct(row, await loadProductPrices(row.id));
}
