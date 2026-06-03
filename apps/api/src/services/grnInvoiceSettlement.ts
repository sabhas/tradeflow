import type { EntityManager } from 'typeorm';
import { dataSource, Grn, SupplierInvoice } from '@tradeflow/db';
import { GL_ACCOUNT_CODES } from '../constants/glAccounts';

export type InvoiceSettlement = 'not_applicable' | 'awaiting_invoice' | 'invoice_draft' | 'invoice_posted';

export type LinkedSupplierInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
};

export function computeInvoiceSettlement(
  grnStatus: string,
  linkedInvoice?: LinkedSupplierInvoice | null
): InvoiceSettlement {
  if (grnStatus !== 'posted') return 'not_applicable';
  if (!linkedInvoice) return 'awaiting_invoice';
  if (linkedInvoice.status === 'posted') return 'invoice_posted';
  return 'invoice_draft';
}

export type GrnInvoiceSettlementFields = {
  invoiceSettlement: InvoiceSettlement;
  supplierInvoiceId: string | null;
  supplierInvoiceNumber: string | null;
  supplierInvoiceStatus: string | null;
};

export function settlementFields(
  grnStatus: string,
  linked?: LinkedSupplierInvoice | null
): GrnInvoiceSettlementFields {
  const invoiceSettlement = computeInvoiceSettlement(grnStatus, linked);
  return {
    invoiceSettlement,
    supplierInvoiceId: linked?.id ?? null,
    supplierInvoiceNumber: linked?.invoiceNumber ?? null,
    supplierInvoiceStatus: linked?.status ?? null,
  };
}

/** Latest supplier invoice per GRN (by created_at). */
export async function loadLinkedInvoicesByGrnIds(
  grnIds: string[]
): Promise<Map<string, LinkedSupplierInvoice>> {
  const map = new Map<string, LinkedSupplierInvoice>();
  if (grnIds.length === 0) return map;

  const rows: Array<{ grnId: string; id: string; invoiceNumber: string; status: string }> =
    await dataSource.query(
      `
    SELECT DISTINCT ON (si.grn_id)
      si.grn_id AS "grnId",
      si.id,
      si.invoice_number AS "invoiceNumber",
      si.status
    FROM supplier_invoices si
    WHERE si.grn_id = ANY($1::uuid[])
    ORDER BY si.grn_id, si.created_at DESC
    `,
      [grnIds]
    );

  for (const r of rows) {
    map.set(r.grnId, { id: r.id, invoiceNumber: r.invoiceNumber, status: r.status });
  }
  return map;
}

export async function findLinkedInvoiceForGrn(
  manager: EntityManager,
  grnId: string,
  excludeInvoiceId?: string
): Promise<SupplierInvoice | null> {
  const qb = manager
    .getRepository(SupplierInvoice)
    .createQueryBuilder('si')
    .where('si.grnId = :grnId', { grnId })
    .orderBy('si.createdAt', 'DESC')
    .take(1);
  if (excludeInvoiceId) {
    qb.andWhere('si.id != :excludeId', { excludeId: excludeInvoiceId });
  }
  return qb.getOne();
}

export async function assertGrnLinkableToInvoice(
  manager: EntityManager,
  grnId: string,
  supplierId: string,
  excludeInvoiceId?: string
): Promise<Grn> {
  const grn = await manager.findOne(Grn, { where: { id: grnId } });
  if (!grn) throw new Error('GRN not found');
  if (grn.status !== 'posted') throw new Error('GRN must be posted before linking a supplier invoice');
  if (grn.supplierId !== supplierId) throw new Error('GRN supplier mismatch');

  const existing = await findLinkedInvoiceForGrn(manager, grnId, excludeInvoiceId);
  if (existing) {
    throw new Error('A supplier invoice is already linked to this GRN');
  }
  return grn;
}

export type PeriodLockGrnWarning = {
  grnId: string;
  grnDate: string;
  supplierId: string;
  supplierName: string;
  invoiceSettlement: InvoiceSettlement;
  accruedAmount: string;
};

/** Posted GRNs on or before lockedThrough without a posted supplier invoice. */
export async function getUnsettledGrnsForPeriodLock(lockedThrough: string): Promise<{
  count: number;
  totalAccruedUnsettled: string;
  grns: PeriodLockGrnWarning[];
}> {
  const through = lockedThrough.slice(0, 10);
  const rows: Array<{
    grnId: string;
    grnDate: string;
    supplierId: string;
    supplierName: string;
    invoiceSettlement: string;
    accruedAmount: string;
  }> = await dataSource.query(
    `
    SELECT
      g.id AS "grnId",
      g.grn_date::text AS "grnDate",
      g.supplier_id AS "supplierId",
      s.name AS "supplierName",
      CASE
        WHEN si.id IS NULL THEN 'awaiting_invoice'
        WHEN si.status = 'draft' THEN 'invoice_draft'
        ELSE 'invoice_posted'
      END AS "invoiceSettlement",
      COALESCE((
        SELECT SUM(jl.credit::numeric)::text
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        JOIN accounts a ON a.id = jl.account_id
        WHERE je.source_type = 'grn_posting'
          AND je.source_id = g.id
          AND je.status = 'posted'
          AND a.code = $2
      ), '0.0000') AS "accruedAmount"
    FROM grns g
    JOIN suppliers s ON s.id = g.supplier_id
    LEFT JOIN LATERAL (
      SELECT si2.id, si2.status
      FROM supplier_invoices si2
      WHERE si2.grn_id = g.id
      ORDER BY si2.created_at DESC
      LIMIT 1
    ) si ON true
    WHERE g.status = 'posted'
      AND g.grn_date <= $1::date
      AND (si.id IS NULL OR si.status != 'posted')
    ORDER BY g.grn_date, g.created_at
    `,
    [through, GL_ACCOUNT_CODES.ACCRUED_PURCHASES]
  );

  let total = 0;
  for (const r of rows) {
    total += parseFloat(r.accruedAmount || '0');
  }

  return {
    count: rows.length,
    totalAccruedUnsettled: total.toFixed(4),
    grns: rows.map((r) => ({
      grnId: r.grnId,
      grnDate: r.grnDate,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      invoiceSettlement: r.invoiceSettlement as InvoiceSettlement,
      accruedAmount: r.accruedAmount,
    })),
  };
}
