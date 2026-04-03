import { EntityManager, IsNull } from 'typeorm';
import { Supplier, TaxProfile } from '@tradeflow/db';
import { computeLineTax } from '@tradeflow/shared';
import { moneyAdd, moneySub, moneyIsNegative } from '../utils/money';

export interface PurchaseLineIn {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  taxProfileId?: string | null;
}

export interface PurchaseComputedLine extends PurchaseLineIn {
  taxAmount: string;
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

  const discHeader = headerDiscount && parseFloat(headerDiscount) !== 0 ? headerDiscount : '0.0000';
  const computed: PurchaseComputedLine[] = [];
  let subtotal = '0.0000';
  let taxSum = '0.0000';

  for (const line of lines) {
    const tpId = line.taxProfileId ?? supplier.taxProfileId;
    let profile: { rate: string; isInclusive: boolean } | null = null;
    if (tpId) {
      const tp = await manager.findOne(TaxProfile, { where: { id: tpId } });
      if (tp) profile = { rate: tp.rate, isInclusive: tp.isInclusive };
    }
    const q = parseFloat(line.quantity);
    const p = parseFloat(line.unitPrice);
    const ld = parseFloat(line.discountAmount || '0');
    if (q <= 0) throw new Error('Line quantity must be positive');
    const gross = q * p - ld;
    const { baseAmount: baseStr, taxAmount: taxStr } = computeLineTax(gross, profile);
    computed.push({
      ...line,
      discountAmount: line.discountAmount !== undefined ? String(line.discountAmount) : '0.0000',
      taxAmount: taxStr,
      lineBase: baseStr,
    });
    subtotal = moneyAdd(subtotal, baseStr);
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
