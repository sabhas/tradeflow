import { EntityManager } from 'typeorm';
import { Invoice, InvoiceLine } from '@tradeflow/db';
import { batchExpiryKey } from '../../inventory/services/productBatchControls';

type CreditLineInput = {
  productId: string;
  quantity: number;
  unitPrice?: string;
  discountAmount?: string;
  taxProfileId?: string | null;
  originalInvoiceLineId?: string | null;
  batchCode?: string | null;
  expiryDate?: string | null;
};

/** Force credit note lines to use batch/expiry/product from the posted sale line. */
export async function syncCreditNoteLinesWithOriginal(
  manager: EntityManager,
  originalInvoiceId: string,
  lines: CreditLineInput[]
): Promise<CreditLineInput[]> {
  const orig = await manager.findOne(Invoice, {
    where: { id: originalInvoiceId },
    relations: ['lines'],
  });
  if (!orig) throw new Error('Original invoice not found');
  const origById = new Map((orig.lines ?? []).map((l) => [l.id, l]));

  return lines.map((line) => {
    if (!line.originalInvoiceLineId) {
      throw new Error('Each credit note line must reference an original invoice line');
    }
    const ol = origById.get(line.originalInvoiceLineId);
    if (!ol) throw new Error('Original invoice line not on referenced invoice');
    return {
      ...line,
      productId: ol.productId,
      unitPrice: line.unitPrice?.trim() ? line.unitPrice : ol.unitPrice,
    };
  });
}

export function buildOriginalLineMap(
  lines: InvoiceLine[]
): Map<string, { productId: string; batchCode?: string; expiryDate?: string }> {
  return new Map(
    lines.map((l) => [
      l.id,
      {
        productId: l.productId,
        batchCode: l.batchCode,
        expiryDate: l.expiryDate,
      },
    ])
  );
}

export function lineMatchesOriginalBatch(
  cn: { batchCode?: string | null; expiryDate?: string | null },
  orig: { batchCode?: string; expiryDate?: string }
): boolean {
  return batchExpiryKey(cn.batchCode, cn.expiryDate) === batchExpiryKey(orig.batchCode, orig.expiryDate);
}
