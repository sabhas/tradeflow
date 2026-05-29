import type { Request } from 'express';
import type { z } from 'zod';
import { IsNull } from 'typeorm';
import {
  calculateBonusSchema,
  createBonusRuleSchema,
  updateBonusRuleSchema,
} from '@tradeflow/shared';
import { BonusRule, Product } from '@tradeflow/db';
import { getPagination } from '../utils/pagination';
import { created, ok, type ControllerResult } from '../utils/controllerResult';
import { parseDecimalStrict } from '../utils/decimal';
import { HttpError } from '../utils/httpError';
import { calculateBonus } from '../services/bonusService';
import { runInTransaction } from '../services/inventoryService';

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

export async function listBonusRules(req: Request): Promise<ControllerResult> {
  const { limit, offset } = getPagination(req);
  const qb = BonusRule.createQueryBuilder('r')
    .leftJoinAndSelect('r.product', 'product')
    .orderBy('product.name', 'ASC')
    .addOrderBy('r.minQuantity', 'ASC')
    .take(limit)
    .skip(offset);

  if (req.query.productId) {
    qb.andWhere('r.productId = :pid', { pid: req.query.productId });
  }
  if (req.query.isActive === 'true') qb.andWhere('r.isActive = true');
  if (req.query.isActive === 'false') qb.andWhere('r.isActive = false');

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
    if (parseFloat(bonusQuantity) <= 0) throw new HttpError(400, { error: 'Bonus quantity must be positive' });
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
  const parsed = calculateBonusSchema.safeParse({
    productId: req.query.productId,
    quantity: req.query.quantity != null ? Number(req.query.quantity) : undefined,
  });
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
