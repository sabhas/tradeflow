import { EntityManager } from 'typeorm';
import { BonusRule } from '@tradeflow/db';
import { parseDecimalStrict } from '../../../shared/utils/decimal';

/** Pick the best active tier and compute bonus qty: floor(qty / min) * bonus per tier. */
export function computeBonusFromRules(
  rules: Array<{ minQuantity: string; bonusQuantity: string }>,
  quantity: number
): string {
  if (quantity <= 0 || rules.length === 0) return '0.0000';

  let best: { minQuantity: string; bonusQuantity: string } | null = null;
  let bestMin = 0;

  for (const rule of rules) {
    const min = parseFloat(parseDecimalStrict(rule.minQuantity));
    const bonus = parseFloat(parseDecimalStrict(rule.bonusQuantity));
    if (min <= 0 || bonus <= 0) continue;
    if (quantity >= min && min >= bestMin) {
      best = rule;
      bestMin = min;
    }
  }

  if (!best) return '0.0000';

  const min = parseFloat(parseDecimalStrict(best.minQuantity));
  const bonusPer = parseFloat(parseDecimalStrict(best.bonusQuantity));
  const total = Math.floor(quantity / min) * bonusPer;
  return parseDecimalStrict(total.toFixed(4));
}

export async function loadActiveBonusRulesForProduct(
  manager: EntityManager,
  productId: string
): Promise<BonusRule[]> {
  return manager.find(BonusRule, {
    where: { productId, isActive: true },
    order: { minQuantity: 'DESC' },
  });
}

export async function calculateBonus(
  manager: EntityManager,
  productId: string,
  quantity: number
): Promise<string> {
  const rules = await loadActiveBonusRulesForProduct(manager, productId);
  return computeBonusFromRules(rules, quantity);
}

export async function calculateBonusBatch(
  manager: EntityManager,
  items: Array<{ productId: string; quantity: number }>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  const productIds = [...new Set(items.map((i) => i.productId))];
  const rules = await manager.find(BonusRule, {
    where: productIds.map((productId) => ({ productId, isActive: true })),
    order: { minQuantity: 'DESC' },
  });

  const rulesByProduct = new Map<string, BonusRule[]>();
  for (const rule of rules) {
    const list = rulesByProduct.get(rule.productId) ?? [];
    list.push(rule);
    rulesByProduct.set(rule.productId, list);
  }

  for (const item of items) {
    const key = `${item.productId}:${item.quantity}`;
    const productRules = rulesByProduct.get(item.productId) ?? [];
    out.set(key, computeBonusFromRules(productRules, item.quantity));
  }

  return out;
}
