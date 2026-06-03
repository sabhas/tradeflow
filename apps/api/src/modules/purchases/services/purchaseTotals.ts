import { EntityManager, In, IsNull } from 'typeorm';
import { Product, Supplier, TaxProfile } from '@tradeflow/db';
import { computeLineTax } from '@tradeflow/shared';
import { moneyAdd, moneySub, moneyIsNegative } from '../../../shared/utils/money';

export interface PurchaseLineIn {
  productId: string;
  quantity: number;
  unitPrice: string;
  discountAmount?: string;
  taxProfileId?: string | null;
  bonusQuantity?: string;
}

export interface PurchaseComputedLine {
  productId: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  taxProfileId?: string | null;
  /** Line amount excluding tax (inventory cost basis). */
  lineBase: string;
}

export async function computePurchaseDocumentTotals(
  manager: EntityManager,
  supplierId: string,
  lines: PurchaseLineIn[],
  headerDiscount?: string
): Promise<{
  lines: PurchaseComputedLine[];
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  total: string;
}> {
  const supplier = await manager.findOne(Supplier, {
    where: { id: supplierId, deletedAt: IsNull() },
  });
  if (!supplier) throw new Error('Supplier not found');

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products =
    productIds.length > 0
      ? await manager.find(Product, { where: { id: In(productIds), deletedAt: IsNull() } })
      : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const discHeader = headerDiscount && parseFloat(headerDiscount) !== 0 ? headerDiscount : '0.0000';
  const computed: PurchaseComputedLine[] = [];
  let subtotal = '0.0000';
  let taxSum = '0.0000';

  for (const line of lines) {
    const tpId = line.taxProfileId;
    let profile: { rate: string; isInclusive: boolean } | null = null;
    if (tpId) {
      const tp = await manager.findOne(TaxProfile, { where: { id: tpId } });
      if (tp) profile = { rate: tp.rate, isInclusive: tp.isInclusive };
    }
    const q = line.quantity;
    const bonusQ = parseFloat(line.bonusQuantity || '0');
    const product = productById.get(line.productId);
    const taxableQty = product?.staxOnBonusPurchase ? q + bonusQ : q;
    const p = parseFloat(line.unitPrice);
    const ld = parseFloat(line.discountAmount || '0');
    if (q <= 0) throw new Error('Line quantity must be positive');
    const gross = taxableQty * p - ld;
    const { baseAmount: baseStr, taxAmount: taxStr } = computeLineTax(gross, profile);
    const costBasis = q * p - ld;
    const costBaseStr = costBasis.toFixed(4);
    computed.push({
      ...line,
      discountAmount: line.discountAmount !== undefined ? String(line.discountAmount) : '0.0000',
      taxAmount: taxStr,
      lineBase: costBaseStr,
    });
    subtotal = moneyAdd(subtotal, costBaseStr);
    taxSum = moneyAdd(taxSum, taxStr);
  }

  const total = moneyAdd(moneySub(subtotal, discHeader), taxSum);
  if (moneyIsNegative(total)) throw new Error('Total cannot be negative');

  return {
    lines: computed,
    subtotal,
    taxAmount: taxSum,
    discountAmount: discHeader,
    total,
  };
}
