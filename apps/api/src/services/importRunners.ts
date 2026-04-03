import { Brackets, EntityManager, IsNull } from 'typeorm';
import {
  dataSource,
  Account,
  Customer,
  JournalEntry,
  JournalLine,
  PaymentTerms,
  Product,
  ProductCategory,
  TaxProfile,
  UnitOfMeasure,
  Warehouse,
} from '@tradeflow/db';
import {
  createProductSchema,
  customerImportRowSchema,
  openingInventoryRowSchema,
  openingJournalRowSchema,
  productImportRowSchema,
} from '@tradeflow/shared';
import { z } from 'zod';
import {
  mapCustomerRow,
  mapOpeningInventoryRow,
  mapOpeningJournalRow,
  mapProductRow,
} from '../utils/importColumnMap';
import type { SheetTable } from '../utils/tabularFile';
import {
  applyMovement,
  assertProductInScope,
  assertWarehouseInScope,
  newBatchRefId,
  runInTransaction,
} from './inventoryService';
import { parseDecimalStrict } from '../utils/decimal';

export type ImportError = { row: number; field?: string; message: string };

export type ImportResult = { successCount: number; errors: ImportError[] };

function assertJournalBalanced(lines: Array<{ debit: string; credit: string }>): void {
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += parseFloat(l.debit || '0');
    c += parseFloat(l.credit || '0');
  }
  if (Math.abs(d - c) > 0.0001) throw new Error('Journal group must balance (sum debits = sum credits)');
}

function normalizeJournalLine(raw: { debit: string; credit: string }): { debit: string; credit: string } {
  const debit = parseDecimalStrict(raw.debit || '0');
  const credit = parseDecimalStrict(raw.credit || '0');
  if (parseFloat(debit) > 0 && parseFloat(credit) > 0) {
    throw new Error('Each line must have either debit or credit, not both');
  }
  if (parseFloat(debit) <= 0 && parseFloat(credit) <= 0) {
    throw new Error('Each line must have a non-zero debit or credit');
  }
  return { debit, credit };
}

async function findCategory(
  em: EntityManager,
  codeOrName: string,
  branchId: string | undefined
): Promise<ProductCategory | null> {
  const term = codeOrName.trim();
  if (!term) return null;
  const qb = em
    .getRepository(ProductCategory)
    .createQueryBuilder('c')
    .where('c.deleted_at IS NULL')
    .andWhere('(LOWER(TRIM(c.code)) = LOWER(TRIM(:t)) OR LOWER(TRIM(c.name)) = LOWER(TRIM(:t)))', {
      t: term,
    });
  if (branchId) {
    qb.andWhere('(c.branch_id IS NULL OR c.branch_id = :bid)', { bid: branchId });
  }
  return qb.getOne();
}

async function findUnit(em: EntityManager, code: string): Promise<UnitOfMeasure | null> {
  const term = code.trim();
  if (!term) return null;
  return em
    .getRepository(UnitOfMeasure)
    .createQueryBuilder('u')
    .where('LOWER(TRIM(u.code)) = LOWER(TRIM(:t))', { t: term })
    .getOne();
}

async function skuExists(em: EntityManager, sku: string, branchId: string | undefined): Promise<boolean> {
  const qb = em
    .getRepository(Product)
    .createQueryBuilder('p')
    .where('p.deleted_at IS NULL')
    .andWhere('LOWER(TRIM(p.sku)) = LOWER(TRIM(:sku))', { sku });
  if (branchId) {
    qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
  } else {
    qb.andWhere('p.branch_id IS NULL');
  }
  const n = await qb.getCount();
  return n > 0;
}

async function findPaymentTermsByName(
  em: EntityManager,
  name: string | undefined,
  branchId: string | undefined
): Promise<string | undefined> {
  const n = name?.trim();
  if (!n) return undefined;
  const qb = em
    .getRepository(PaymentTerms)
    .createQueryBuilder('pt')
    .where('LOWER(TRIM(pt.name)) = LOWER(TRIM(:n))', { n });
  if (branchId) {
    qb.andWhere('(pt.branch_id IS NULL OR pt.branch_id = :bid)', { bid: branchId });
  }
  const row = await qb.getOne();
  return row?.id;
}

async function findTaxProfileByName(
  em: EntityManager,
  name: string | undefined,
  branchId: string | undefined
): Promise<string | undefined> {
  const n = name?.trim();
  if (!n) return undefined;
  const qb = em
    .getRepository(TaxProfile)
    .createQueryBuilder('tp')
    .where('LOWER(TRIM(tp.name)) = LOWER(TRIM(:n))', { n });
  if (branchId) {
    qb.andWhere('(tp.branch_id IS NULL OR tp.branch_id = :bid)', { bid: branchId });
  }
  const row = await qb.getOne();
  return row?.id;
}

export async function importProductsFromSheets(
  sheets: SheetTable[],
  branchId: string | undefined,
  userBranchId: string | undefined
): Promise<ImportResult> {
  const effectiveBranch = branchId ?? userBranchId;
  const table = sheets[0];
  if (!table?.rows.length) {
    return { successCount: 0, errors: [{ row: 0, message: 'No data rows found' }] };
  }

  const errors: ImportError[] = [];
  let successCount = 0;
  const seenSku = new Set<string>();
  let rowNum = 2;

  for (const raw of table.rows) {
    const mapped = mapProductRow(raw);
    const parsed = productImportRowSchema.safeParse(mapped);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join('; ');
      errors.push({ row: rowNum, message: msg });
      rowNum++;
      continue;
    }
    const row = parsed.data;
    const skuKey = row.sku.trim().toLowerCase();
    if (seenSku.has(skuKey)) {
      errors.push({ row: rowNum, field: 'sku', message: 'Duplicate SKU in file' });
      rowNum++;
      continue;
    }
    seenSku.add(skuKey);

    try {
      await runInTransaction(async (em) => {
        const cat = await findCategory(em, row.category, effectiveBranch);
        if (!cat) {
          throw new Error(`Unknown category: ${row.category}`);
        }
        const unit = await findUnit(em, row.unit);
        if (!unit) {
          throw new Error(`Unknown unit code: ${row.unit}`);
        }
        if (await skuExists(em, row.sku, effectiveBranch)) {
          throw new Error(`SKU already exists: ${row.sku}`);
        }

        const payload = {
          categoryId: cat.id,
          sku: row.sku.trim(),
          barcode: row.barcode?.trim() || null,
          name: row.name.trim(),
          unitId: unit.id,
          costPrice: row.costPrice ?? '0',
          sellingPrice: row.sellingPrice ?? '0',
          batchTracked: row.batchTracked ?? false,
          expiryTracked: row.expiryTracked ?? false,
          branchId: effectiveBranch ?? null,
        };
        const valid = createProductSchema.safeParse(payload);
        if (!valid.success) {
          throw new Error(valid.error.issues.map((e) => e.message).join('; '));
        }

        const repo = em.getRepository(Product);
        const p = repo.create({
          categoryId: valid.data.categoryId,
          sku: valid.data.sku,
          barcode: valid.data.barcode ?? undefined,
          name: valid.data.name,
          unitId: valid.data.unitId,
          costPrice: valid.data.costPrice ?? '0',
          sellingPrice: valid.data.sellingPrice ?? '0',
          batchTracked: valid.data.batchTracked ?? false,
          expiryTracked: valid.data.expiryTracked ?? false,
          branchId: effectiveBranch ?? undefined,
        });
        await repo.save(p);
      });
      successCount++;
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    rowNum++;
  }

  return { successCount, errors };
}

export async function importCustomersFromSheets(
  sheets: SheetTable[],
  branchId: string | undefined,
  userBranchId: string | undefined
): Promise<ImportResult> {
  const effectiveBranch = branchId ?? userBranchId;
  const table = sheets[0];
  if (!table?.rows.length) {
    return { successCount: 0, errors: [{ row: 0, message: 'No data rows found' }] };
  }

  const errors: ImportError[] = [];
  let successCount = 0;
  let rowNum = 2;

  for (const raw of table.rows) {
    const mapped = mapCustomerRow(raw);
    const parsed = customerImportRowSchema.safeParse(mapped);
    if (!parsed.success) {
      errors.push({
        row: rowNum,
        message: parsed.error.issues.map((e) => e.message).join('; '),
      });
      rowNum++;
      continue;
    }
    const row = parsed.data;

    try {
      await runInTransaction(async (em) => {
        const paymentTermsId = await findPaymentTermsByName(em, row.paymentTerms ?? undefined, effectiveBranch);
        if (row.paymentTerms?.trim() && !paymentTermsId) {
          throw new Error(`Unknown payment terms: ${row.paymentTerms}`);
        }
        const taxProfileId = await findTaxProfileByName(em, row.taxProfile ?? undefined, effectiveBranch);
        if (row.taxProfile?.trim() && !taxProfileId) {
          throw new Error(`Unknown tax profile: ${row.taxProfile}`);
        }

        const c = em.getRepository(Customer).create({
          name: row.name.trim(),
          type: row.type,
          contact:
            row.contactPhone || row.contactEmail || row.contactAddress
              ? {
                  phone: row.contactPhone?.trim() || undefined,
                  email: row.contactEmail?.trim() || undefined,
                  address: row.contactAddress?.trim() || undefined,
                }
              : undefined,
          creditLimit: row.creditLimit ?? '0',
          paymentTermsId,
          taxProfileId,
          branchId: effectiveBranch ?? undefined,
        });
        await em.getRepository(Customer).save(c);
      });
      successCount++;
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    rowNum++;
  }

  return { successCount, errors };
}

function pickSheet(sheets: SheetTable[], names: string[]): SheetTable | undefined {
  const lower = names.map((n) => n.toLowerCase());
  for (const s of sheets) {
    if (lower.includes(s.name.trim().toLowerCase())) return s;
  }
  return undefined;
}

async function findWarehouseByCode(
  em: EntityManager,
  code: string,
  branchId: string | undefined
): Promise<Warehouse | null> {
  const qb = em
    .getRepository(Warehouse)
    .createQueryBuilder('w')
    .where('LOWER(TRIM(w.code)) = LOWER(TRIM(:c))', { c: code.trim() });
  if (branchId) {
    qb.andWhere('(w.branch_id IS NULL OR w.branch_id = :bid)', { bid: branchId });
  }
  return qb.getOne();
}

async function findProductBySku(
  em: EntityManager,
  sku: string,
  branchId: string | undefined
): Promise<Product | null> {
  const qb = em
    .getRepository(Product)
    .createQueryBuilder('p')
    .where('p.deleted_at IS NULL')
    .andWhere('LOWER(TRIM(p.sku)) = LOWER(TRIM(:sku))', { sku: sku.trim() });
  if (branchId) {
    qb.andWhere('(p.branch_id IS NULL OR p.branch_id = :bid)', { bid: branchId });
  } else {
    qb.andWhere('p.branch_id IS NULL');
  }
  return qb.getOne();
}

async function findAccountByCode(
  em: EntityManager,
  code: string,
  branchId: string | undefined
): Promise<Account | null> {
  const qb = em
    .getRepository(Account)
    .createQueryBuilder('a')
    .where('LOWER(TRIM(a.code)) = LOWER(TRIM(:c))', { c: code.trim() });
  if (branchId) {
    qb.andWhere(
      new Brackets((q) => {
        q.where('a.branch_id IS NULL').orWhere('a.branch_id = :bid', { bid: branchId });
      })
    );
  }
  return qb.getOne();
}

export async function importOpeningBalancesFromSheets(
  sheets: SheetTable[],
  branchId: string | undefined,
  userBranchId: string | undefined,
  userId: string | undefined,
  canJournal: boolean
): Promise<
  ImportResult & {
    inventoryRefIds?: string[];
    journalEntryIds?: string[];
  }
> {
  const effectiveBranch = branchId ?? userBranchId;
  const errors: ImportError[] = [];
  const inventoryRefIds: string[] = [];
  const journalEntryIds: string[] = [];
  let successInventoryGroups = 0;
  let successJournalGroups = 0;

  let invSheet = pickSheet(sheets, ['inventory']);
  if (!invSheet && sheets.length === 1 && sheets[0].rows.length) {
    const sample = sheets[0].rows[0];
    if (sample.warehousecode) {
      invSheet = sheets[0];
    }
  }

  let journalSheet = pickSheet(sheets, ['journal', 'openingjournal', 'ledger']);
  if (!journalSheet && sheets.length === 1 && sheets[0].rows.length) {
    const keys = Object.keys(sheets[0].rows[0]);
    if (keys.includes('entrydate') && keys.includes('accountcode') && !keys.includes('warehousecode')) {
      journalSheet = sheets[0];
    }
  }

  if (!invSheet?.rows.length && !journalSheet?.rows.length) {
    return {
      successCount: 0,
      errors: [{ row: 0, message: 'No Inventory or Journal sheet with data found' }],
    };
  }

  if (invSheet?.rows.length) {
    type GroupKey = string;
    const groups = new Map<GroupKey, { warehouseCode: string; movementDate: string; lines: z.infer<typeof openingInventoryRowSchema>[] }>();
    let r = 2;
    for (const raw of invSheet.rows) {
      const mapped = mapOpeningInventoryRow(raw);
      const parsed = openingInventoryRowSchema.safeParse(mapped);
      if (!parsed.success) {
        errors.push({
          row: r,
          message: parsed.error.issues.map((e) => e.message).join('; '),
        });
        r++;
        continue;
      }
      const row = parsed.data;
      const key = `${row.warehouseCode.trim().toLowerCase()}|${row.movementDate.trim().slice(0, 10)}`;
      const g = groups.get(key);
      if (g) {
        g.lines.push(row);
      } else {
        groups.set(key, {
          warehouseCode: row.warehouseCode,
          movementDate: row.movementDate.trim().slice(0, 10),
          lines: [row],
        });
      }
      r++;
    }

    for (const [, group] of groups) {
      const refId = newBatchRefId();
      try {
        await runInTransaction(async (em) => {
          const wh = await findWarehouseByCode(em, group.warehouseCode, effectiveBranch);
          if (!wh) throw new Error(`Unknown warehouse code: ${group.warehouseCode}`);
          await assertWarehouseInScope(wh.id, effectiveBranch);

          for (const line of group.lines) {
            const p = await findProductBySku(em, line.productSku, effectiveBranch);
            if (!p) throw new Error(`Unknown product SKU: ${line.productSku}`);
            await assertProductInScope(p.id, effectiveBranch);
            const qty = parseDecimalStrict(line.quantity);
            if (parseFloat(qty) <= 0) throw new Error('Opening quantity must be positive');
            await applyMovement(em, {
              productId: p.id,
              warehouseId: wh.id,
              quantityDelta: qty,
              refType: 'opening_balance',
              refId,
              unitCost:
                line.unitCost != null && String(line.unitCost).trim() !== ''
                  ? parseDecimalStrict(String(line.unitCost))
                  : undefined,
              movementDate: group.movementDate,
              branchId: effectiveBranch,
              userId,
            });
          }
        });
        inventoryRefIds.push(refId);
        successInventoryGroups++;
      } catch (e) {
        errors.push({
          row: 0,
          message: `[Inventory ${group.warehouseCode} @ ${group.movementDate}] ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  if (journalSheet?.rows.length) {
    if (!canJournal) {
      errors.push({
        row: 0,
        message: 'Journal sheet present but accounting:write permission is required',
      });
    } else {
      type JKey = string;
      const jgroups = new Map<JKey, z.infer<typeof openingJournalRowSchema>[]>();
      let jr = 2;
      for (const raw of journalSheet.rows) {
        const mapped = mapOpeningJournalRow(raw);
        const parsed = openingJournalRowSchema.safeParse(mapped);
        if (!parsed.success) {
          errors.push({
            row: jr,
            message: parsed.error.issues.map((e) => e.message).join('; '),
          });
          jr++;
          continue;
        }
        const row = parsed.data;
        const ref = (row.reference ?? '').trim();
        const d = row.entryDate.trim().slice(0, 10);
        const key = `${d}|${ref}`;
        const list = jgroups.get(key) ?? [];
        list.push({ ...row, entryDate: d, reference: ref || null });
        jgroups.set(key, list);
        jr++;
      }

      for (const [, lines] of jgroups) {
        try {
          const normalized = lines.map((l) =>
            normalizeJournalLine({ debit: l.debit, credit: l.credit })
          );
          assertJournalBalanced(normalized);

          const entryId = await runInTransaction(async (em) => {
            const resolved: { accountId: string; debit: string; credit: string }[] = [];
            for (let i = 0; i < lines.length; i++) {
              const acc = await findAccountByCode(em, lines[i].accountCode, effectiveBranch);
              if (!acc) throw new Error(`Unknown account code: ${lines[i].accountCode}`);
              resolved.push({
                accountId: acc.id,
                debit: normalized[i].debit,
                credit: normalized[i].credit,
              });
            }

            const entry = em.create(JournalEntry, {
              entryDate: lines[0].entryDate,
              reference: lines[0].reference ?? undefined,
              description: 'Opening balance import',
              status: 'posted',
              branchId: effectiveBranch ?? undefined,
              createdBy: userId,
            });
            await em.save(entry);
            for (const l of resolved) {
              await em.save(
                em.create(JournalLine, {
                  journalEntryId: entry.id,
                  accountId: l.accountId,
                  debit: l.debit,
                  credit: l.credit,
                })
              );
            }
            return entry.id;
          });
          journalEntryIds.push(entryId);
          successJournalGroups++;
        } catch (e) {
          errors.push({
            row: 0,
            message: `[Journal ${lines[0]?.entryDate} ${lines[0]?.reference ?? ''}] ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
    }
  }

  const successCount = successInventoryGroups + successJournalGroups;
  return {
    successCount,
    errors,
    inventoryRefIds: inventoryRefIds.length ? inventoryRefIds : undefined,
    journalEntryIds: journalEntryIds.length ? journalEntryIds : undefined,
  };
}
