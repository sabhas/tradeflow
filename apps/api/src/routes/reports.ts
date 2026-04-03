import { Router } from 'express';
import { dataSource } from '@tradeflow/db';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { resolveBranchId } from '../utils/branchScope';

export const reportsRouter = Router();
reportsRouter.use(authMiddleware, loadUser);

/** Receivables aging by customer (posted credit invoices with open balance). */
reportsRouter.get('/aging', requirePermission('sales', 'read'), async (req, res) => {
  const asOf = ((req.query.asOf as string) || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const branchId = resolveBranchId(req);

  const rows = await dataSource.query(
    `
    SELECT
      i.id AS "invoiceId",
      i.customer_id AS "customerId",
      c.name AS "customerName",
      i.due_date AS "dueDate",
      i.invoice_date AS "invoiceDate",
      i.total::text AS "total",
      COALESCE((
        SELECT SUM(ra.amount)::text
        FROM receipt_allocations ra
        WHERE ra.invoice_id = i.id
      ), '0') AS "allocated",
      (i.total::numeric - COALESCE((
        SELECT SUM(ra.amount)
        FROM receipt_allocations ra
        WHERE ra.invoice_id = i.id
      ), 0))::text AS "openAmount"
    FROM invoices i
    INNER JOIN customers c ON c.id = i.customer_id AND c.deleted_at IS NULL
    WHERE i.status = 'posted'
      AND i.payment_type = 'credit'
      AND ($1::uuid IS NULL OR i.branch_id IS NULL OR i.branch_id = $1::uuid)
    `,
    [branchId || null]
  );

  const asOfMs = new Date(`${asOf}T12:00:00.000Z`).getTime();
  type Bucket = { current: string; d1_30: string; d31_60: string; d61_90: string; d90p: string };
  const byCustomer = new Map<
    string,
    { customerName: string; buckets: Bucket; totalOpen: number }
  >();

  function emptyBucket(): Bucket {
    return { current: '0.0000', d1_30: '0.0000', d31_60: '0.0000', d61_90: '0.0000', d90p: '0.0000' };
  }

  function addToBucket(b: Bucket, key: keyof Bucket, amt: number): void {
    const cur = parseFloat(b[key]);
    b[key] = (cur + amt).toFixed(4);
  }

  for (const r of rows) {
    const open = parseFloat(r.openAmount);
    if (open <= 0.00005) continue;
    const dueMs = new Date(`${r.dueDate}T12:00:00.000Z`).getTime();
    const daysPast = Math.floor((asOfMs - dueMs) / (24 * 3600 * 1000));
    let key: keyof Bucket = 'current';
    if (daysPast >= 1 && daysPast <= 30) key = 'd1_30';
    else if (daysPast >= 31 && daysPast <= 60) key = 'd31_60';
    else if (daysPast >= 61 && daysPast <= 90) key = 'd61_90';
    else if (daysPast > 90) key = 'd90p';

    if (!byCustomer.has(r.customerId)) {
      byCustomer.set(r.customerId, { customerName: r.customerName, buckets: emptyBucket(), totalOpen: 0 });
    }
    const agg = byCustomer.get(r.customerId)!;
    agg.totalOpen += open;
    addToBucket(agg.buckets, key, open);
  }

  const data = [...byCustomer.entries()].map(([customerId, v]) => ({
    customerId,
    customerName: v.customerName,
    totalOpen: v.totalOpen.toFixed(4),
    buckets: v.buckets,
  }));

  res.json({ data, meta: { asOf } });
});
