import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import {
  calculateBonusQuerySchema,
  calculateBonusSchema,
  createBonusRuleSchema,
  listBonusRulesQuerySchema,
  updateBonusRuleSchema,
} from '@tradeflow/shared';
import { BonusRule, Product } from '@tradeflow/db';
import { getValidatedQuery } from '../../../shared/middleware/validate';
import { getPaginationFromQuery } from '../../../shared/utils/pagination';
import { created, ok, type ControllerResult } from '../../../shared/utils/controllerResult';
import { parseDecimalStrict } from '../../../shared/utils/decimal';
import { HttpError } from '../../../shared/utils/httpError';
import { calculateBonus } from '../../sales/services/bonusService';
import { runInTransaction } from '../../inventory/services/inventoryService';

type CreateBonusRuleInput = z.infer<typeof createBonusRuleSchema>;
type UpdateBonusRuleInput = z.infer<typeof updateBonusRuleSchema>;

function serialize(rule: BonusRule, product?: Product) {
  return {
    id: rule.id,
    productId: rule.productId,
    productName: product?.name ?? rule.product?.name ?? null,
    productSku: product?.sku ?? rule.product?.sku ?? null,
    minQuantity: rule.minQuantity,
    bonusQuantity: rule.bonusQuantity,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

type ListBonusRulesQuery = z.infer<typeof listBonusRulesQuerySchema>;

export async function listBonusRules(req: Request): Promise<ControllerResult> {
  const q = getValidatedQuery<ListBonusRulesQuery>(req);
  const { limit, offset } = getPaginationFromQuery(q);
  const qb = BonusRule.createQueryBuilder('r')
    .leftJoinAndSelect('r.product', 'product')
    .orderBy('product.name', 'ASC')
    .addOrderBy('r.minQuantity', 'ASC')
    .take(limit)
    .skip(offset);

  if (q.productId) {
    qb.andWhere('r.productId = :pid', { pid: q.productId });
  }
  if (q.isActive === 'true') qb.andWhere('r.isActive = true');
  if (q.isActive === 'false') qb.andWhere('r.isActive = false');

  const [rows, total] = await qb.getManyAndCount();
  return ok({
    data: rows.map((r) => serialize(r, r.product)),
    meta: { total, limit, offset },
  });
}

export async function createBonusRule(req: Request, body: CreateBonusRuleInput): Promise<ControllerResult> {
  const product = await Product.findOne({ where: { id: body.productId, deletedAt: IsNull() } });
  if (!product) throw new HttpError(400, { error: 'Product not found' });

  const minQuantity = parseDecimalStrict(body.minQuantity);
  const bonusQuantity = parseDecimalStrict(body.bonusQuantity);
  if (parseFloat(minQuantity) <= 0) throw new HttpError(400, { error: 'Min quantity must be positive' });
  if (parseFloat(bonusQuantity) <= 0) throw new HttpError(400, { error: 'Bonus quantity must be positive' });

  const row = BonusRule.create({
    productId: body.productId,
    minQuantity,
    bonusQuantity,
    isActive: body.isActive ?? true,
  });
  await row.save();
  return created({ data: serialize(row, product) });
}

export async function updateBonusRule(req: Request, body: UpdateBonusRuleInput): Promise<ControllerResult> {
  const row = await BonusRule.findOne({
    where: { id: req.params.id },
    relations: ['product'],
  });
  if (!row) throw new HttpError(404, { error: 'Not found' });

  if (body.productId !== undefined) {
    const product = await Product.findOne({ where: { id: body.productId, deletedAt: IsNull() } });
    if (!product) throw new HttpError(400, { error: 'Product not found' });
    row.productId = body.productId;
  }
  if (body.minQuantity !== undefined) {
    const minQuantity = parseDecimalStrict(body.minQuantity);
    if (parseFloat(minQuantity) <= 0) throw new HttpError(400, { error: 'Min quantity must be positive' });
    row.minQuantity = minQuantity;
  }
  if (body.bonusQuantity !== undefined) {
    const bonusQuantity = parseDecimalStrict(body.bonusQuantity);
    if (parseFloat(bonusQuantity) <= 0)
      throw new HttpError(400, { error: 'Bonus quantity must be positive' });
    row.bonusQuantity = bonusQuantity;
  }
  if (body.isActive !== undefined) row.isActive = body.isActive;

  await row.save();
  const product = await Product.findOne({ where: { id: row.productId, deletedAt: IsNull() } });
  return ok({ data: serialize(row, product ?? undefined) });
}

export async function deleteBonusRule(req: Request): Promise<ControllerResult> {
  const row = await BonusRule.findOne({ where: { id: req.params.id } });
  if (!row) throw new HttpError(404, { error: 'Not found' });
  await row.remove();
  return ok({ data: { id: row.id, deleted: true } });
}

export async function calculateBonusAction(req: Request): Promise<ControllerResult> {
  const parsed = calculateBonusSchema.safeParse(
    getValidatedQuery<z.infer<typeof calculateBonusQuerySchema>>(req)
  );
  if (!parsed.success) {
    throw new HttpError(400, { error: 'Invalid input', details: parsed.error.flatten() });
  }

  const bonusQuantity = await runInTransaction((manager) =>
    calculateBonus(manager, parsed.data.productId, parsed.data.quantity)
  );

  return ok({
    data: {
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      bonusQuantity,
    },
  });
}

export async function getBonusRuleSnapshotForAudit(id: string) {
  const row = await BonusRule.findOne({ where: { id }, relations: ['product'] });
  return row ? serialize(row, row.product) : undefined;
}
