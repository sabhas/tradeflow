import { BonusRule, Product } from '@tradeflow/db';
import { nullable } from '../../../shared/utils/serializeHelpers';

export function serializeBonusRule(rule: BonusRule, product?: Product) {
  return {
    id: rule.id,
    productId: rule.productId,
    productName: nullable(product?.name ?? rule.product?.name),
    productSku: nullable(product?.sku ?? rule.product?.sku),
    minQuantity: rule.minQuantity,
    bonusQuantity: rule.bonusQuantity,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}
