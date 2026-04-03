import { EntityManager, IsNull } from 'typeorm';
import { Customer, TaxProfile } from '@tradeflow/db';
import { money4, parseTaxRate, splitTaxFromGross } from '@tradeflow/shared';
import { moneyAdd, moneySub, moneyIsNegative } from '../utils/money';

export interface LineIn {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  taxProfileId?: string | null;
}

export interface ComputedLine extends LineIn {
  taxAmount: string;
}

export async function computeSalesDocumentTotals(
  manager: EntityManager,
  customerId: string,
  lines: LineIn[],
  headerDiscount?: string
): Promise<{ lines: ComputedLine[]; subtotal: string; taxAmount: string; discountAmount: string; total: string }> {
  const customer = await manager.findOne(Customer, {
    where: { id: customerId, deletedAt: IsNull() },
  });
  if (!customer) throw new Error('Customer not found');

  const discHeader = headerDiscount && parseFloat(headerDiscount) !== 0 ? headerDiscount : '0.0000';
  const computed: ComputedLine[] = [];
  let subtotal = '0.0000';
  let taxSum = '0.0000';

  for (const line of lines) {
    const tpId = line.taxProfileId ?? customer.taxProfileId;
    let rate = 0;
    let inclusive = false;
    if (tpId) {
      const tp = await manager.findOne(TaxProfile, { where: { id: tpId } });
      if (tp) {
        rate = parseTaxRate(tp.rate);
        inclusive = tp.isInclusive;
      }
    }
    const q = parseFloat(line.quantity);
    const p = parseFloat(line.unitPrice);
    const ld = parseFloat(line.discountAmount || '0');
    if (q <= 0) throw new Error('Line quantity must be positive');
    const gross = q * p - ld;
    const { base, tax } = splitTaxFromGross(gross, rate, inclusive);
    const taxStr = money4(tax);
    const baseStr = money4(base);
    computed.push({
      ...line,
      discountAmount: line.discountAmount !== undefined ? String(line.discountAmount) : '0.0000',
      taxAmount: taxStr,
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

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
