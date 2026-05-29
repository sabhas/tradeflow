import { EntityManager, In, IsNull } from 'typeorm';
import { Customer, Product, TaxProfile } from '@tradeflow/db';
import { computeLineTax } from '@tradeflow/shared';
import { moneyIsNegative } from '../utils/money';
import { roundAmountString } from '../utils/rounding';
import { getCompanySettingsRow } from './companySettings';

export interface LineIn {
  productId: string;
  quantity: number;
  unitPrice: string;
  discountAmount?: string;
  taxProfileId?: string | null;
  bonusQuantity?: string;
}

export interface ComputedLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  taxProfileId?: string | null;
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

  const cs = await getCompanySettingsRow(manager);
  const md = Math.min(6, Math.max(0, cs.moneyDecimals));
  const qd = Math.min(6, Math.max(0, cs.quantityDecimals));
  const mode = cs.roundingMode || 'half_up';

  const discHeader =
    headerDiscount && parseFloat(headerDiscount) !== 0
      ? roundAmountString(String(headerDiscount), md, mode)
      : roundAmountString('0', md, mode);
  const computed: ComputedLine[] = [];
  let subAcc = 0;
  let taxAcc = 0;

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products =
    productIds.length > 0
      ? await manager.find(Product, { where: { id: In(productIds), deletedAt: IsNull() } })
      : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const line of lines) {
    const tpId = line.taxProfileId ?? customer.taxProfileId;
    let profile: { rate: string; isInclusive: boolean } | null = null;
    if (tpId) {
      const tp = await manager.findOne(TaxProfile, { where: { id: tpId } });
      if (tp) profile = { rate: tp.rate, isInclusive: tp.isInclusive };
    }
    const qtyStr = roundAmountString(String(line.quantity), qd, mode);
    const q = parseFloat(qtyStr);
    const bonusQ = parseFloat(line.bonusQuantity || '0');
    const product = productById.get(line.productId);
    const taxableQty = product?.staxOnBonusSale ? q + bonusQ : q;
    const p = parseFloat(line.unitPrice);
    const ld = parseFloat(line.discountAmount || '0');
    if (q <= 0) throw new Error('Line quantity must be positive');
    const gross = taxableQty * p - ld;
    const { baseAmount: baseStr, taxAmount: taxStr } = computeLineTax(gross, profile);
    const baseRounded = roundAmountString(baseStr, md, mode);
    const taxRounded = roundAmountString(taxStr, md, mode);
    const revenueBase = q * p - ld;
    computed.push({
      ...line,
      quantity: qtyStr,
      discountAmount:
        line.discountAmount !== undefined
          ? roundAmountString(String(line.discountAmount), md, mode)
          : roundAmountString('0', md, mode),
      taxAmount: taxRounded,
    });
    subAcc += parseFloat(roundAmountString(String(revenueBase), md, mode));
    taxAcc += parseFloat(taxRounded);
  }

  const subtotal = roundAmountString(String(subAcc), md, mode);
  const taxAmount = roundAmountString(String(taxAcc), md, mode);
  const total = roundAmountString(
    String(parseFloat(subtotal) - parseFloat(discHeader) + parseFloat(taxAmount)),
    md,
    mode
  );
  if (moneyIsNegative(total)) throw new Error('Total cannot be negative');

  return {
    lines: computed,
    subtotal,
    taxAmount,
    discountAmount: discHeader,
    total,
  };
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
