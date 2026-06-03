import { EntityManager, In } from 'typeorm';
import { Product } from '@tradeflow/db';
import { toIsoDateString } from '../../../shared/utils/date';

export async function enforceProductBatchControls(
  manager: EntityManager,
  lines: Array<{ productId: string; batchCode?: string | null; expiryDate?: string | null }>
): Promise<void> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  if (productIds.length === 0) return;

  const products = await manager.find(Product, {
    where: { id: In(productIds) },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));

  for (const line of lines) {
    const product = productsById.get(line.productId);
    if (!product) {
      throw new Error(`Product not found: ${line.productId}`);
    }

    const batchCode = line.batchCode?.trim() ?? '';
    if (product.batchTracked && !batchCode) {
      throw new Error(`Batch code is required for batch-tracked product "${product.name}"`);
    }

    const expiryDate = line.expiryDate?.trim() ?? '';
    if (product.expiryTracked && !expiryDate) {
      throw new Error(`Expiry date is required for expiry-tracked product "${product.name}"`);
    }
  }
}

function normalizeLayerBatchCode(code: string | null | undefined): string {
  return (code ?? '').trim();
}

function normalizeLayerExpiry(expiry: string | null | undefined): string {
  return toIsoDateString(expiry) ?? '';
}

export function batchExpiryKey(batchCode?: string | null, expiryDate?: string | null): string {
  return `${normalizeLayerBatchCode(batchCode)}::${normalizeLayerExpiry(expiryDate)}`;
}

/** Credit note lines must match batch/expiry on the original invoice line they reference. */
export async function assertCreditNoteLinesMatchOriginal(
  manager: EntityManager,
  lines: Array<{
    productId: string;
    originalInvoiceLineId?: string | null;
    batchCode?: string | null;
    expiryDate?: string | null;
  }>,
  originalLinesById: Map<string, { productId: string; batchCode?: string; expiryDate?: string }>
): Promise<void> {
  for (const line of lines) {
    if (!line.originalInvoiceLineId) continue;
    const orig = originalLinesById.get(line.originalInvoiceLineId);
    if (!orig) throw new Error('Original invoice line not on referenced invoice');
    if (orig.productId !== line.productId) {
      throw new Error('Product must match original invoice line');
    }
    if (batchExpiryKey(orig.batchCode, orig.expiryDate) !== batchExpiryKey(line.batchCode, line.expiryDate)) {
      throw new Error('Return batch must match the batch sold on the original invoice line');
    }
  }
}
