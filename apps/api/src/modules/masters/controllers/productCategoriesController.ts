import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import {
  createProductCategorySchema,
  listProductCategoriesQuerySchema,
  updateProductCategorySchema,
} from '@tradeflow/shared';
import { ProductCategory } from '@tradeflow/db';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { HttpError } from '../../../shared/utils/httpError';
import { serializeCategory } from '../serializers/productCategory.serializer';

type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;
type UpdateProductCategoryInput = z.infer<typeof updateProductCategorySchema>;

function buildTree(flat: ProductCategory[], parentId: string | null | undefined): unknown[] {
  return flat
    .filter((c) => (parentId == null ? c.parentId == null : c.parentId === parentId))
    .map((c) => ({
      ...serializeCategory(c),
      children: buildTree(flat, c.id),
    }));
}

export async function getProductCategorySnapshotForAudit(id: string) {
  const c = await ProductCategory.findOne({ where: { id } });
  return c ? serializeCategory(c) : undefined;
}

export async function listProductCategories(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<z.infer<typeof listProductCategoriesQuerySchema>>(req);
  const tree = q.tree === 'true';
  const repo = ProductCategory.getRepository();
  const flat = await repo.find({
    order: { name: 'ASC' },
  });
  const active = flat.filter((c) => !c.deletedAt);
  if (tree) {
    return ok({ data: buildTree(active, null) });
  }
  return ok({ data: active.map(serializeCategory) });
}

export async function createProductCategory(
  req: Request,
  body: CreateProductCategoryInput
): Promise<ControllerResult> {
  const repo = ProductCategory.getRepository();
  const row = repo.create({
    parentId: body.parentId ?? undefined,
    name: body.name,
    code: body.code,
  });
  await repo.save(row);
  return created({ data: serializeCategory(row) });
}

export async function updateProductCategory(
  req: Request,
  body: UpdateProductCategoryInput
): Promise<ControllerResult> {
  const repo = ProductCategory.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  if (body.name !== undefined) row.name = body.name;
  if (body.code !== undefined) row.code = body.code;
  if (body.parentId !== undefined) row.parentId = body.parentId ?? undefined;
  await repo.save(row);
  return ok({ data: serializeCategory(row) });
}

export async function deleteProductCategory(req: Request): Promise<ControllerResult> {
  const repo = ProductCategory.getRepository();
  const row = await repo.findOne({ where: { id: req.params.id, deletedAt: IsNull() } });
  if (!row) {
    throw new HttpError(404, { error: 'Not found' });
  }
  row.deletedAt = new Date();
  await repo.save(row);
  return ok({ data: { id: row.id, deleted: true } });
}
