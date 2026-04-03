import ExcelJS from 'exceljs';
import { Brackets, In } from 'typeorm';
import {
  dataSource,
  Customer,
  Invoice,
  Product,
  ProductPrice,
} from '@tradeflow/db';

export async function buildProductsXlsx(branchId: string | undefined, categoryId?: string, search?: string) {
  const qb = dataSource
    .getRepository(Product)
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.category', 'cat')
    .leftJoinAndSelect('p.unit', 'u')
    .where('p.deleted_at IS NULL');

  if (branchId) {
    qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
  }
  if (categoryId) {
    qb.andWhere('p.category_id = :cid', { cid: categoryId });
  }
  if (search?.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    qb.andWhere(
      new Brackets((q) => {
        q.where('LOWER(p.name) LIKE :term', { term })
          .orWhere('LOWER(p.sku) LIKE :term', { term })
          .orWhere('LOWER(p.barcode) LIKE :term', { term });
      })
    );
  }

  qb.orderBy('p.name', 'ASC');
  const rows = await qb.getMany();

  const ids = rows.map((r) => r.id);
  const priceRows =
    ids.length > 0
      ? await dataSource.getRepository(ProductPrice).find({
          where: { productId: In(ids) },
        })
      : [];
  const byProduct = new Map<string, ProductPrice[]>();
  for (const pr of priceRows) {
    const list = byProduct.get(pr.productId) ?? [];
    list.push(pr);
    byProduct.set(pr.productId, list);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.addRow([
    'categoryCode',
    'categoryName',
    'sku',
    'barcode',
    'name',
    'unitCode',
    'costPrice',
    'sellingPrice',
    'batchTracked',
    'expiryTracked',
    'priceLevels',
  ]);

  for (const p of rows) {
    const prices = byProduct.get(p.id) ?? [];
    const priceLevels = prices.map((x) => `${x.priceLevelId}:${x.price}`).join('; ');
    ws.addRow([
      p.category?.code ?? '',
      p.category?.name ?? '',
      p.sku,
      p.barcode ?? '',
      p.name,
      p.unit?.code ?? '',
      p.costPrice,
      p.sellingPrice,
      p.batchTracked,
      p.expiryTracked,
      priceLevels,
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildCustomersXlsx(branchId: string | undefined, search?: string) {
  const qb = dataSource
    .getRepository(Customer)
    .createQueryBuilder('c')
    .leftJoinAndSelect('c.paymentTerms', 'pt')
    .leftJoinAndSelect('c.taxProfile', 'tp')
    .where('c.deleted_at IS NULL');

  if (branchId) {
    qb.andWhere('(c.branch_id IS NULL OR c.branch_id = :bid)', { bid: branchId });
  }
  if (search?.trim()) {
    qb.andWhere('LOWER(c.name) LIKE :term', { term: `%${search.trim().toLowerCase()}%` });
  }
  qb.orderBy('c.name', 'ASC');

  const rows = await qb.getMany();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Customers');
  ws.addRow([
    'name',
    'type',
    'phone',
    'email',
    'address',
    'creditLimit',
    'paymentTerms',
    'taxProfile',
  ]);

  for (const c of rows) {
    const ct = c.contact as { phone?: string; email?: string; address?: string } | undefined;
    ws.addRow([
      c.name,
      c.type,
      ct?.phone ?? '',
      ct?.email ?? '',
      ct?.address ?? '',
      c.creditLimit,
      c.paymentTerms?.name ?? '',
      c.taxProfile?.name ?? '',
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildInvoicesXlsx(
  branchId: string | undefined,
  filters: { customerId?: string; status?: string; dateFrom?: string; dateTo?: string }
) {
  const qb = dataSource
    .getRepository(Invoice)
    .createQueryBuilder('i')
    .leftJoinAndSelect('i.customer', 'cust')
    .where('i.deleted_at IS NULL')
    .orderBy('i.invoice_date', 'DESC')
    .addOrderBy('i.created_at', 'DESC');

  if (branchId) {
    qb.andWhere('(i.branch_id IS NULL OR i.branch_id = :bid)', { bid: branchId });
  }
  if (filters.customerId) qb.andWhere('i.customer_id = :cid', { cid: filters.customerId });
  if (filters.status) qb.andWhere('i.status = :st', { st: filters.status });
  if (filters.dateFrom) qb.andWhere('i.invoice_date >= :df', { df: filters.dateFrom });
  if (filters.dateTo) qb.andWhere('i.invoice_date <= :dt', { dt: filters.dateTo });

  const rows = await qb.getMany();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Invoices');
  ws.addRow([
    'id',
    'invoiceDate',
    'dueDate',
    'customerName',
    'status',
    'paymentType',
    'subtotal',
    'taxAmount',
    'discountAmount',
    'total',
  ]);

  for (const inv of rows) {
    ws.addRow([
      inv.id,
      inv.invoiceDate,
      inv.dueDate,
      inv.customer?.name ?? '',
      inv.status,
      inv.paymentType,
      inv.subtotal,
      inv.taxAmount,
      inv.discountAmount,
      inv.total,
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
