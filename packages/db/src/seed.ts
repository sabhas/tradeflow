import * as dotenv from 'dotenv';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'apps/api/.env') });
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { dataSource } from './data-source';
import { User } from './entities/User';
import { Role } from './entities/Role';
import { Permission } from './entities/Permission';
import { UnitOfMeasure } from './entities/UnitOfMeasure';
import { PriceLevel } from './entities/PriceLevel';
import { PaymentTerms } from './entities/PaymentTerms';
import { TaxProfile } from './entities/TaxProfile';
import { ProductCategory } from './entities/ProductCategory';
import { Account, AccountType } from './entities/Account';
import { CompanySettings } from './entities/CompanySettings';
import { CustomerType } from './entities/CustomerType';
import { Area } from './entities/Area';
import { Town } from './entities/Town';
import { Supplier } from './entities/Supplier';
import { Customer } from './entities/Customer';
import { Warehouse } from './entities/Warehouse';
import { Salesperson } from './entities/Salesperson';
import { Product } from './entities/Product';
import { ProductPrice } from './entities/ProductPrice';
import { JournalEntry } from './entities/JournalEntry';
import { JournalLine } from './entities/JournalLine';
import { PurchaseOrder } from './entities/PurchaseOrder';
import { PurchaseOrderLine } from './entities/PurchaseOrderLine';
import { Grn } from './entities/Grn';
import { GrnLine } from './entities/GrnLine';
import { SupplierInvoice } from './entities/SupplierInvoice';
import { SupplierInvoiceLine } from './entities/SupplierInvoiceLine';
import { Invoice } from './entities/Invoice';
import { InvoiceLine } from './entities/InvoiceLine';
import { Receipt } from './entities/Receipt';
import { ReceiptAllocation } from './entities/ReceiptAllocation';
import { SupplierPayment } from './entities/SupplierPayment';
import { SupplierPaymentAllocation } from './entities/SupplierPaymentAllocation';

const PERMISSIONS: Array<{ resource: string; action: string; code: string }> = [
  { resource: 'audit', action: 'read', code: 'audit:read' },
  { resource: 'recycle_bin', action: 'read', code: 'recycle_bin:read' },
  { resource: 'recycle_bin', action: 'restore', code: 'recycle_bin:restore' },
  { resource: 'inventory', action: 'read', code: 'inventory:read' },
  { resource: 'inventory', action: 'write', code: 'inventory:write' },
  { resource: 'sales', action: 'read', code: 'sales:read' },
  { resource: 'sales', action: 'create', code: 'sales:create' },
  { resource: 'sales', action: 'update', code: 'sales:update' },
  { resource: 'sales', action: 'post', code: 'sales:post' },
  { resource: 'accounting', action: 'read', code: 'accounting:read' },
  { resource: 'accounting', action: 'write', code: 'accounting:write' },
  { resource: 'masters.products', action: 'read', code: 'masters.products:read' },
  { resource: 'masters.products', action: 'write', code: 'masters.products:write' },
  { resource: 'masters.customers', action: 'read', code: 'masters.customers:read' },
  { resource: 'masters.customers', action: 'write', code: 'masters.customers:write' },
  { resource: 'masters.suppliers', action: 'read', code: 'masters.suppliers:read' },
  { resource: 'masters.suppliers', action: 'write', code: 'masters.suppliers:write' },
  { resource: 'masters.warehouses', action: 'read', code: 'masters.warehouses:read' },
  { resource: 'masters.warehouses', action: 'write', code: 'masters.warehouses:write' },
  { resource: 'masters.salespersons', action: 'read', code: 'masters.salespersons:read' },
  { resource: 'masters.salespersons', action: 'write', code: 'masters.salespersons:write' },
  { resource: 'masters.tax', action: 'read', code: 'masters.tax:read' },
  { resource: 'masters.tax', action: 'write', code: 'masters.tax:write' },
  { resource: 'masters.payment_terms', action: 'read', code: 'masters.payment_terms:read' },
  { resource: 'masters.payment_terms', action: 'write', code: 'masters.payment_terms:write' },
  { resource: 'purchases.orders', action: 'read', code: 'purchases.orders:read' },
  { resource: 'purchases.orders', action: 'write', code: 'purchases.orders:write' },
  { resource: 'purchases.orders', action: 'post', code: 'purchases.orders:post' },
  { resource: 'purchases.grn', action: 'read', code: 'purchases.grn:read' },
  { resource: 'purchases.grn', action: 'write', code: 'purchases.grn:write' },
  { resource: 'purchases.grn', action: 'post', code: 'purchases.grn:post' },
  { resource: 'purchases.supplier_invoices', action: 'read', code: 'purchases.supplier_invoices:read' },
  { resource: 'purchases.supplier_invoices', action: 'write', code: 'purchases.supplier_invoices:write' },
  { resource: 'purchases.supplier_invoices', action: 'post', code: 'purchases.supplier_invoices:post' },
  { resource: 'purchases.payments', action: 'read', code: 'purchases.payments:read' },
  { resource: 'purchases.payments', action: 'write', code: 'purchases.payments:write' },
  { resource: 'purchases.reports', action: 'read', code: 'purchases.reports:read' },
  { resource: 'settings', action: 'read', code: 'settings:read' },
  { resource: 'settings', action: 'write', code: 'settings:write' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: PERMISSIONS.map((p) => p.code),
  Accountant: [
    'accounting:read',
    'accounting:write',
    'sales:read',
    'sales:create',
    'sales:update',
    'sales:post',
    'masters.customers:read',
    'masters.suppliers:read',
    'masters.tax:read',
    'masters.tax:write',
    'masters.payment_terms:read',
    'masters.payment_terms:write',
    'masters.warehouses:read',
    'purchases.orders:read',
    'purchases.orders:write',
    'purchases.orders:post',
    'purchases.grn:read',
    'purchases.grn:write',
    'purchases.grn:post',
    'purchases.supplier_invoices:read',
    'purchases.supplier_invoices:write',
    'purchases.supplier_invoices:post',
    'purchases.payments:read',
    'purchases.payments:write',
    'purchases.reports:read',
  ],
  Sales: [
    'sales:read',
    'sales:create',
    'sales:update',
    'sales:post',
    'inventory:read',
    'masters.products:read',
    'masters.customers:read',
    'masters.customers:write',
    'masters.warehouses:read',
    'masters.salespersons:read',
    'masters.payment_terms:read',
    'masters.tax:read',
  ],
  Storekeeper: [
    'inventory:read',
    'inventory:write',
    'masters.products:read',
    'masters.products:write',
    'masters.warehouses:read',
    'masters.warehouses:write',
    'purchases.orders:read',
    'purchases.grn:read',
    'purchases.grn:write',
    'purchases.grn:post',
    'masters.suppliers:read',
  ],
};

/** Chart of accounts: parents (no parentCode) must appear before children in this list for clarity; seed resolves links in two passes. */
const CHART_OF_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  isSystem?: boolean;
}> = [
  { code: '1000', name: 'Cash in Hand', type: 'asset', isSystem: true },
  { code: '1010', name: 'Bank — Primary Operating', type: 'asset', isSystem: true },
  { code: '1020', name: 'Petty Cash', type: 'asset' },
  { code: '1100', name: 'Accounts Receivable — Trade', type: 'asset' },
  { code: '1150', name: 'Allowance for Doubtful Accounts', type: 'asset' },
  { code: '1200', name: 'Inventory Holding', type: 'asset' },
  { code: '1210', name: 'Inventory — Pharma & OTC', type: 'asset', parentCode: '1200' },
  { code: '1220', name: 'Inventory — Cold Chain', type: 'asset', parentCode: '1200' },
  { code: '1230', name: 'Inventory — Surgical & Disposables', type: 'asset', parentCode: '1200' },
  { code: '1300', name: 'Advances to Suppliers', type: 'asset' },
  { code: '1350', name: 'Prepaid Expenses', type: 'asset' },
  { code: '1400', name: 'VAT / Sales Tax Input (Recoverable)', type: 'asset' },
  { code: '1500', name: 'Office & Warehouse Equipment', type: 'asset' },
  { code: '2000', name: 'Accounts Payable — Trade', type: 'liability' },
  { code: '2050', name: 'Accrued Purchases', type: 'liability' },
  { code: '2100', name: 'Sales Tax / VAT Payable', type: 'liability' },
  { code: '2150', name: 'Withholding Tax Payable', type: 'liability' },
  { code: '2200', name: 'Accrued Expenses & Other Payables', type: 'liability' },
  { code: '2300', name: 'Short-term Borrowings', type: 'liability' },
  { code: '3000', name: "Owner's Capital", type: 'equity' },
  { code: '3100', name: 'Retained Earnings', type: 'equity' },
  { code: '3200', name: 'Current Year Profit / Loss', type: 'equity' },
  { code: '4000', name: 'Sales — Pharmaceuticals & OTC', type: 'income' },
  { code: '4100', name: 'Sales — Surgical & Consumables', type: 'income' },
  { code: '4150', name: 'Sales — Wellness & Nutraceuticals', type: 'income' },
  { code: '4200', name: 'Sales Returns & Allowances', type: 'income' },
  { code: '4300', name: 'Other Income', type: 'income' },
  { code: '5000', name: 'Cost of Goods Sold — Pharma & OTC', type: 'expense' },
  { code: '5100', name: 'Cost of Goods Sold — Surgical', type: 'expense' },
  { code: '5200', name: 'Distribution & Delivery Expense', type: 'expense' },
  { code: '5300', name: 'Warehouse & Cold Storage', type: 'expense' },
  { code: '5400', name: 'Rent', type: 'expense' },
  { code: '5500', name: 'Salaries & Wages', type: 'expense' },
  { code: '5600', name: 'Utilities', type: 'expense' },
  { code: '5700', name: 'Marketing & Medical Detailing', type: 'expense' },
  { code: '5800', name: 'Insurance', type: 'expense' },
  { code: '5900', name: 'Professional Fees', type: 'expense' },
  { code: '6000', name: 'Depreciation Expense', type: 'expense' },
];

const EXTRA_UOM: Array<{ code: string; name: string }> = [
  { code: 'BOX', name: 'Box' },
  { code: 'STRIP', name: 'Strip' },
  { code: 'TAB', name: 'Tablet' },
  { code: 'VIAL', name: 'Vial' },
  { code: 'BOT', name: 'Bottle' },
];

const EXTRA_PAYMENT_TERMS: Array<{ name: string; netDays: number }> = [
  { name: 'Net 7', netDays: 7 },
  { name: 'Net 15', netDays: 15 },
  { name: 'Net 45', netDays: 45 },
  { name: 'Net 60', netDays: 60 },
];

const EXTRA_TAX_PROFILES: Array<{ name: string; rate: string; isInclusive: boolean }> = [
  { name: 'GST 18% (standard)', rate: '18', isInclusive: false },
  { name: 'Reduced rate 10%', rate: '10', isInclusive: false },
  { name: 'Exempt', rate: '0', isInclusive: false },
];

const PRODUCT_CATEGORIES: Array<{ name: string; code: string }> = [
  { name: 'Tablets & Capsules', code: 'TBLS' },
  { name: 'Syrups & Suspensions', code: 'SYRP' },
  { name: 'Injectables & Biologics', code: 'INJ' },
  { name: 'Surgical & Disposables', code: 'SURG' },
  { name: 'OTC & Wellness', code: 'OTC' },
];

/** Well-known / major pharmaceutical suppliers (names suitable for distributor master data). */
const PHARMA_SUPPLIERS: Array<{
  name: string;
  city?: string;
  address?: string;
  telephone?: string;
  email?: string;
  website?: string;
  contact?: string;
}> = [
  {
    name: 'Pfizer Pakistan',
    city: 'Karachi',
    address: 'Pfizer Centre, Main Shahrah-e-Faisal',
    telephone: '+92-21-3454-7000',
    email: 'info.pk@pfizer.com',
    website: 'https://www.pfizer.com.pk',
    contact: 'Regional Trade Desk',
  },
  {
    name: 'GlaxoSmithKline Pakistan Limited',
    city: 'Karachi',
    address: 'Corporate Office, Karachi',
    telephone: '+92-21-111-647-259',
    email: 'consumer.service@pk.gsk.com',
    website: 'https://www.pk.gsk.com',
    contact: 'Customer Service',
  },
  {
    name: 'Novartis Pharma Pakistan',
    city: 'Lahore',
    address: 'Novartis Pakistan, Lahore',
    telephone: '+92-42-111-112-888',
    website: 'https://www.novartis.com/pk',
    contact: 'Pharma Distribution',
  },
  {
    name: 'Sanofi Pakistan Limited',
    city: 'Karachi',
    address: 'Sanofi House, Karachi',
    telephone: '+92-21-3713-0200',
    website: 'https://www.sanofi.pk',
    contact: 'Trade Operations',
  },
  {
    name: 'Abbott Laboratories Pakistan Limited',
    city: 'Karachi',
    address: 'Abbott Plaza, Karachi',
    telephone: '+92-21-111-222-688',
    website: 'https://www.abbott.com',
    contact: 'Distribution Support',
  },
  {
    name: 'Johnson & Johnson Pakistan (Private) Limited',
    city: 'Karachi',
    telephone: '+92-21-3568-0211',
    website: 'https://www.jnj.com',
    contact: 'Medical Devices & OTC',
  },
  {
    name: 'Getz Pharma (Private) Limited',
    city: 'Karachi',
    address: 'Getz Pharma Distribution',
    telephone: '+92-21-111-000-999',
    website: 'https://www.getzpharma.com',
    contact: 'Sales Office',
  },
  {
    name: 'Novo Nordisk Pakistan',
    city: 'Karachi',
    address: 'Novo Nordisk Regional Office',
    telephone: '+92-21-3580-5000',
    website: 'https://www.novonordisk.com',
    contact: 'Insulin & Biopharmaceuticals',
  },
];

type ProductSeed = {
  sku: string;
  name: string;
  shortName?: string;
  genericName?: string;
  packing?: string;
  categoryCode: string;
  supplierName: string;
  unitCode: string;
  costPrice: string;
  sellingPrice: string;
  retailPrice: string;
  cutPrice: string;
  expiryTracked: boolean;
  batchTracked: boolean;
  isFridged: boolean;
  isNarcotic: boolean;
  manufacturerCode?: string;
};

const DEMO_PRODUCTS: ProductSeed[] = [
  {
    sku: 'PHR-PAR-500-20S',
    name: 'Paracetamol Tablets 500mg',
    genericName: 'Paracetamol',
    packing: "20's",
    categoryCode: 'TBLS',
    supplierName: 'GlaxoSmithKline Pakistan Limited',
    unitCode: 'STRIP',
    costPrice: '85.0000',
    sellingPrice: '95.0000',
    retailPrice: '120.0000',
    cutPrice: '100.0000',
    expiryTracked: true,
    batchTracked: true,
    isFridged: false,
    isNarcotic: false,
  },
  {
    sku: 'PHR-AMX-250-15S',
    name: 'Amoxicillin Capsules 250mg',
    genericName: 'Amoxicillin',
    packing: "15's",
    categoryCode: 'TBLS',
    supplierName: 'Pfizer Pakistan',
    unitCode: 'BOX',
    costPrice: '320.0000',
    sellingPrice: '380.0000',
    retailPrice: '450.0000',
    cutPrice: '400.0000',
    expiryTracked: true,
    batchTracked: true,
    isFridged: false,
    isNarcotic: false,
  },
  {
    sku: 'PHR-INS-ASP-5ML',
    name: 'Insulin Aspart Injection',
    genericName: 'Insulin aspart',
    packing: '5 penfills',
    categoryCode: 'INJ',
    supplierName: 'Novo Nordisk Pakistan',
    unitCode: 'BOX',
    costPrice: '18500.0000',
    sellingPrice: '19900.0000',
    retailPrice: '22000.0000',
    cutPrice: '20500.0000',
    expiryTracked: true,
    batchTracked: true,
    isFridged: true,
    isNarcotic: false,
  },
  {
    sku: 'SUR-GLOV-NXS-M',
    name: 'Nitrile Examination Gloves (Medium)',
    categoryCode: 'SURG',
    supplierName: 'Johnson & Johnson Pakistan (Private) Limited',
    unitCode: 'BOX',
    costPrice: '850.0000',
    sellingPrice: '980.0000',
    retailPrice: '1200.0000',
    cutPrice: '1050.0000',
    expiryTracked: false,
    batchTracked: false,
    isFridged: false,
    isNarcotic: false,
  },
  {
    sku: 'SYR-AMOX-250-60ML',
    name: 'Amoxicillin Suspension 250mg/5ml',
    genericName: 'Amoxicillin',
    packing: '60ml',
    categoryCode: 'SYRP',
    supplierName: 'Getz Pharma (Private) Limited',
    unitCode: 'BOT',
    costPrice: '210.0000',
    sellingPrice: '245.0000',
    retailPrice: '290.0000',
    cutPrice: '260.0000',
    expiryTracked: true,
    batchTracked: true,
    isFridged: false,
    isNarcotic: false,
  },
  {
    sku: 'OTC-VIT-D3-TAB',
    name: 'Cholecalciferol (Vitamin D3) Tablets',
    genericName: 'Cholecalciferol',
    packing: "30's",
    categoryCode: 'OTC',
    supplierName: 'Abbott Laboratories Pakistan Limited',
    unitCode: 'PCS',
    costPrice: '175.0000',
    sellingPrice: '195.0000',
    retailPrice: '240.0000',
    cutPrice: '210.0000',
    expiryTracked: true,
    batchTracked: true,
    isFridged: false,
    isNarcotic: false,
  },
];

async function ensureAccount(
  repo: Repository<Account>,
  cache: Map<string, Account>,
  spec: (typeof CHART_OF_ACCOUNTS)[number]
): Promise<Account> {
  const existing = await repo.findOne({ where: { code: spec.code } });
  if (existing) {
    cache.set(spec.code, existing);
    return existing;
  }
  let parentId: string | undefined;
  if (spec.parentCode) {
    let parent = cache.get(spec.parentCode);
    if (!parent) {
      parent = (await repo.findOne({ where: { code: spec.parentCode } })) ?? undefined;
      if (parent) cache.set(spec.parentCode, parent);
    }
    if (!parent) {
      throw new Error(`Seed: parent account ${spec.parentCode} must exist before ${spec.code}`);
    }
    parentId = parent.id;
  }
  const created = await repo.save(
    repo.create({
      code: spec.code,
      name: spec.name,
      type: spec.type,
      parentId,
      isSystem: spec.isSystem ?? false,
    })
  );
  cache.set(spec.code, created);
  return created;
}

async function seedChartOfAccounts(repo: Repository<Account>): Promise<Map<string, Account>> {
  const cache = new Map<string, Account>();
  const roots = CHART_OF_ACCOUNTS.filter((a) => !a.parentCode);
  const children = CHART_OF_ACCOUNTS.filter((a) => a.parentCode);
  for (const spec of roots) {
    await ensureAccount(repo, cache, spec);
  }
  for (const spec of children) {
    await ensureAccount(repo, cache, spec);
  }
  return cache;
}

async function seed() {
  try {
    await dataSource.initialize();

    const permRepo = dataSource.getRepository(Permission);
    const roleRepo = dataSource.getRepository(Role);
    const userRepo = dataSource.getRepository(User);

    for (const p of PERMISSIONS) {
      const existing = await permRepo.findOne({ where: { code: p.code } });
      if (!existing) {
        await permRepo.save(permRepo.create(p));
      }
    }
    console.log('Permissions ensured');

    const allPerms = await permRepo.find();
    const permMap = new Map(allPerms.map((p) => [p.code, p]));

    const existingRoles = await roleRepo.count();
    if (existingRoles === 0) {
      for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
        const role = roleRepo.create({
          name: roleName,
          description: roleName,
        });
        role.permissions = permCodes.map((c) => permMap.get(c)).filter(Boolean) as Permission[];
        await roleRepo.save(role);
      }
      console.log(`Created ${Object.keys(ROLE_PERMISSIONS).length} roles`);
    } else {
      const adminRole = await roleRepo.findOne({ where: { name: 'Admin' }, relations: ['permissions'] });
      if (adminRole) {
        const codes = new Set((adminRole.permissions || []).map((p) => p.code));
        let added = false;
        for (const p of PERMISSIONS) {
          if (!codes.has(p.code)) {
            const perm = permMap.get(p.code);
            if (perm) {
              adminRole.permissions = [...(adminRole.permissions || []), perm];
              added = true;
            }
          }
        }
        if (added) await roleRepo.save(adminRole);
      }
      for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
        if (roleName === 'Admin') continue;
        const role = await roleRepo.findOne({ where: { name: roleName }, relations: ['permissions'] });
        if (!role) continue;
        const codes = new Set((role.permissions || []).map((p) => p.code));
        let changed = false;
        for (const code of permCodes) {
          if (!codes.has(code)) {
            const perm = permMap.get(code);
            if (perm) {
              role.permissions = [...(role.permissions || []), perm];
              changed = true;
            }
          }
        }
        if (changed) await roleRepo.save(role);
      }
    }

    const uomRepo = dataSource.getRepository(UnitOfMeasure);
    if ((await uomRepo.count()) === 0) {
      await uomRepo.save(uomRepo.create({ code: 'PCS', name: 'Pieces' }));
      console.log('Created default UoM PCS');
    }
    for (const u of EXTRA_UOM) {
      const found = await uomRepo.findOne({ where: { code: u.code } });
      if (!found) {
        await uomRepo.save(uomRepo.create(u));
        console.log(`Created UoM ${u.code}`);
      }
    }

    const plRepo = dataSource.getRepository(PriceLevel);
    if ((await plRepo.count()) === 0) {
      await plRepo.save([plRepo.create({ name: 'Retail' }), plRepo.create({ name: 'Wholesale' })]);
      console.log('Created default price levels');
    }

    const ptRepo = dataSource.getRepository(PaymentTerms);
    if ((await ptRepo.count()) === 0) {
      await ptRepo.save([
        ptRepo.create({ name: 'Net 30', netDays: 30 }),
        ptRepo.create({ name: 'COD', netDays: 0 }),
      ]);
      console.log('Created sample payment terms');
    }
    for (const term of EXTRA_PAYMENT_TERMS) {
      const found = await ptRepo.findOne({ where: { name: term.name } });
      if (!found) {
        await ptRepo.save(ptRepo.create(term));
        console.log(`Created payment term ${term.name}`);
      }
    }

    const txRepo = dataSource.getRepository(TaxProfile);
    if ((await txRepo.count()) === 0) {
      await txRepo.save(
        txRepo.create({
          name: 'Standard',
          rate: '0',
          isInclusive: false,
        })
      );
      console.log('Created default tax profile');
    }
    for (const tp of EXTRA_TAX_PROFILES) {
      const found = await txRepo.findOne({ where: { name: tp.name } });
      if (!found) {
        await txRepo.save(txRepo.create(tp));
        console.log(`Created tax profile ${tp.name}`);
      }
    }

    const customerTypeRepo = dataSource.getRepository(CustomerType);
    const customerTypeNames = ['Retailer', 'Wholesaler', 'Walk-in', 'Hospital', 'Clinic'];
    for (const name of customerTypeNames) {
      const found = await customerTypeRepo.findOne({ where: { name } });
      if (!found) {
        await customerTypeRepo.save(customerTypeRepo.create({ name }));
        console.log(`Customer type: ${name}`);
      }
    }

    const catRepo = dataSource.getRepository(ProductCategory);
    if ((await catRepo.count()) === 0) {
      await catRepo.save(catRepo.create({ name: 'General', code: 'GEN' }));
      console.log('Created default product category');
    }
    for (const c of PRODUCT_CATEGORIES) {
      const found = await catRepo.findOne({ where: { code: c.code } });
      if (!found) {
        await catRepo.save(catRepo.create(c));
        console.log(`Created category ${c.code}`);
      }
    }

    const accountRepo = dataSource.getRepository(Account);
    const accountByCode = await seedChartOfAccounts(accountRepo);
    console.log(`Chart of accounts: ${accountByCode.size} codes ensured`);

    const arParent = accountByCode.get('1100');
    const apParent = accountByCode.get('2000');
    if (!arParent || !apParent) {
      throw new Error('Seed: AR (1100) and AP (2000) accounts must exist');
    }

    const cashAccount = accountByCode.get('1000');
    const bankAccount = accountByCode.get('1010');
    if (!cashAccount || !bankAccount) {
      throw new Error('Seed: cash (1000) and bank (1010) accounts must exist');
    }

    const companySettingsRepo = dataSource.getRepository(CompanySettings);
    const existingCompanySettings = await companySettingsRepo.findOne({
      where: {},
      order: { id: 'ASC' },
    });
    if (!existingCompanySettings) {
      await companySettingsRepo.save(
        companySettingsRepo.create({
          companyName: 'Tradeflow Pharma Distributors',
          legalName: 'Tradeflow Pharma Distributors (Private) Limited',
          addressLine1: 'Plot 12-B, Industrial Distribution Avenue',
          city: 'Karachi',
          country: 'Pakistan',
          phone: '+92-21-0000-0000',
          email: 'accounts@tradeflow.local',
          currencyCode: 'PKR',
          moneyDecimals: 2,
          quantityDecimals: 2,
          defaultCashAccountId: cashAccount.id,
          defaultBankAccountId: bankAccount.id,
        })
      );
      console.log('Created default company settings');
    }

    const areaRepo = dataSource.getRepository(Area);
    let areaKarachi =
      (await areaRepo.findOne({ where: { name: 'Karachi — Central' } })) ||
      (await areaRepo.save(areaRepo.create({ name: 'Karachi — Central' })));
    let areaLahore =
      (await areaRepo.findOne({ where: { name: 'Lahore — Gulberg' } })) ||
      (await areaRepo.save(areaRepo.create({ name: 'Lahore — Gulberg' })));

    const townRepo = dataSource.getRepository(Town);
    let townKhi =
      (await townRepo.findOne({ where: { name: 'Karachi' } })) ||
      (await townRepo.save(townRepo.create({ name: 'Karachi', areaId: areaKarachi.id })));
    let townLhr =
      (await townRepo.findOne({ where: { name: 'Lahore' } })) ||
      (await townRepo.save(townRepo.create({ name: 'Lahore', areaId: areaLahore.id })));

    if (!townKhi.areaId) {
      townKhi.areaId = areaKarachi.id;
      await townRepo.save(townKhi);
    }
    if (!townLhr.areaId) {
      townLhr.areaId = areaLahore.id;
      await townRepo.save(townLhr);
    }
    console.log('Areas/towns ensured');

    const supplierRepo = dataSource.getRepository(Supplier);
    for (const s of PHARMA_SUPPLIERS) {
      const found = await supplierRepo.findOne({ where: { name: s.name } });
      if (!found) {
        const suppAcc = await accountRepo.save(
          accountRepo.create({
            code: `2000-SUPP-${crypto.randomUUID()}`,
            name: `A/P — ${s.name}`.slice(0, 255),
            type: 'liability',
            parentId: apParent.id,
            isSystem: false,
          })
        );
        await supplierRepo.save(
          supplierRepo.create({
            name: s.name,
            payableAccountId: suppAcc.id,
            address: s.address,
            city: s.city,
            telephone: s.telephone,
            email: s.email,
            website: s.website,
            contact: s.contact,
          })
        );
        console.log(`Supplier: ${s.name}`);
      }
    }

    const net30 = await ptRepo.findOne({ where: { name: 'Net 30' } });
    const cod = await ptRepo.findOne({ where: { name: 'COD' } });
    const standardTax = await txRepo.findOne({ where: { name: 'Standard' } });

    const customerRepo = dataSource.getRepository(Customer);
    const demoCustomers: Array<{
      name: string;
      type: string;
      address: string;
      town: Town;
      area: Area;
      telephone?: string;
      creditLimit: string;
      paymentTermsId?: string;
    }> = [
      {
        name: 'City Pharmacy — Saddar',
        type: 'Retailer',
        address: 'Shop 4-B, Empress Market Road, Saddar',
        town: townKhi,
        area: areaKarachi,
        telephone: '+92-300-1234567',
        creditLimit: '250000.0000',
        paymentTermsId: cod?.id,
      },
      {
        name: 'Medilink Wholesale Distributors',
        type: 'Wholesaler',
        address: 'Wholesale Plaza, SITE Area',
        town: townKhi,
        area: areaKarachi,
        telephone: '+92-21-3500-8899',
        creditLimit: '5000000.0000',
        paymentTermsId: net30?.id,
      },
      {
        name: 'National Hospital Pharmacy',
        type: 'Hospital',
        address: 'Main Campus Outpatient Block',
        town: townLhr,
        area: areaLahore,
        telephone: '+92-42-9900-1122',
        creditLimit: '1200000.0000',
        paymentTermsId: net30?.id,
      },
      {
        name: 'Sehat Medical Store',
        type: 'Walk-in',
        address: 'MM Alam Road',
        town: townLhr,
        area: areaLahore,
        creditLimit: '0.0000',
        paymentTermsId: cod?.id,
      },
      {
        name: 'Family Care Clinic Pharmacy',
        type: 'Clinic',
        address: 'DHA Phase 5',
        town: townKhi,
        area: areaKarachi,
        telephone: '+92-321-555-0101',
        creditLimit: '400000.0000',
        paymentTermsId: net30?.id,
      },
    ];

    for (const c of demoCustomers) {
      const found = await customerRepo.findOne({ where: { name: c.name } });
      if (!found) {
        const custAcc = await accountRepo.save(
          accountRepo.create({
            code: `1100-CUST-${crypto.randomUUID()}`,
            name: `A/R — ${c.name}`.slice(0, 255),
            type: 'asset',
            parentId: arParent.id,
            isSystem: false,
          })
        );
        await customerRepo.save(
          customerRepo.create({
            name: c.name,
            type: c.type,
            address: c.address,
            townId: c.town.id,
            areaId: c.area.id,
            receivableAccountId: custAcc.id,
            telephone: c.telephone,
            creditLimit: c.creditLimit,
            paymentTermsId: c.paymentTermsId,
            taxProfileId: standardTax?.id,
            salesTaxStatus: 'registered',
            isFiler: true,
          })
        );
        console.log(`Customer: ${c.name}`);
      }
    }

    const whRepo = dataSource.getRepository(Warehouse);
    const warehouses: Array<{ name: string; code: string; isDefault: boolean }> = [
      { name: 'Main Distribution Center', code: 'MAIN', isDefault: true },
      { name: 'Cold Chain Vault', code: 'COLD', isDefault: false },
      { name: 'Bulk Storage — SITE', code: 'BULK', isDefault: false },
    ];
    for (const w of warehouses) {
      const found = await whRepo.findOne({ where: { code: w.code } });
      if (!found) {
        await whRepo.save(whRepo.create(w));
        console.log(`Warehouse: ${w.code}`);
      }
    }

    const spRepo = dataSource.getRepository(Salesperson);
    const salespeople: Array<{ name: string; code: string }> = [
      { name: 'Ahmed Khan', code: 'SP-KHI-01' },
      { name: 'Fatima Noor', code: 'SP-KHI-02' },
      { name: 'Bilal Hussain', code: 'SP-LHR-01' },
    ];
    for (const sp of salespeople) {
      const found = await spRepo.findOne({ where: { code: sp.code } });
      if (!found) {
        await spRepo.save(spRepo.create(sp));
        console.log(`Salesperson: ${sp.code}`);
      }
    }

    const productRepo = dataSource.getRepository(Product);
    const productPriceRepo = dataSource.getRepository(ProductPrice);
    const retailLevel = await plRepo.findOne({ where: { name: 'Retail' } });
    const wholesaleLevel = await plRepo.findOne({ where: { name: 'Wholesale' } });

    for (const raw of DEMO_PRODUCTS) {
      let supplier = await supplierRepo.findOne({ where: { name: raw.supplierName } });
      if (!supplier) {
        const placeholderAcc = await accountRepo.save(
          accountRepo.create({
            code: `2000-SUPP-${crypto.randomUUID()}`,
            name: `A/P — ${raw.supplierName}`.slice(0, 255),
            type: 'liability',
            parentId: apParent.id,
            isSystem: false,
          })
        );
        supplier = await supplierRepo.save(
          supplierRepo.create({
            name: raw.supplierName,
            payableAccountId: placeholderAcc.id,
            city: 'Karachi',
            contact: 'Seed placeholder',
          })
        );
        console.log(`Created placeholder supplier: ${raw.supplierName}`);
      }
      const category = await catRepo.findOne({ where: { code: raw.categoryCode } });
      const unit = await uomRepo.findOne({ where: { code: raw.unitCode } });
      if (!category || !unit) {
        console.warn(`Skip product ${raw.sku}: missing category ${raw.categoryCode} or UoM ${raw.unitCode}`);
        continue;
      }
      let product = await productRepo.findOne({ where: { sku: raw.sku } });
      if (!product) {
        product = await productRepo.save(
          productRepo.create({
            supplierId: supplier.id,
            categoryId: category.id,
            sku: raw.sku,
            name: raw.name,
            shortName: raw.shortName,
            genericName: raw.genericName,
            packing: raw.packing,
            unitId: unit.id,
            costPrice: raw.costPrice,
            sellingPrice: raw.sellingPrice,
            retailPrice: raw.retailPrice,
            cutPrice: raw.cutPrice,
            expiryTracked: raw.expiryTracked,
            batchTracked: raw.batchTracked,
            isFridged: raw.isFridged,
            isNarcotic: raw.isNarcotic,
            manufacturerCode: raw.manufacturerCode,
            isActive: true,
          })
        );
        console.log(`Product: ${raw.sku}`);
      }
      if (retailLevel) {
        const exists = await productPriceRepo.findOne({
          where: { productId: product.id, priceLevelId: retailLevel.id },
        });
        if (!exists) {
          await productPriceRepo.save(
            productPriceRepo.create({
              productId: product.id,
              priceLevelId: retailLevel.id,
              price: raw.retailPrice,
            })
          );
        }
      }
      if (wholesaleLevel) {
        const exists = await productPriceRepo.findOne({
          where: { productId: product.id, priceLevelId: wholesaleLevel.id },
        });
        if (!exists) {
          await productPriceRepo.save(
            productPriceRepo.create({
              productId: product.id,
              priceLevelId: wholesaleLevel.id,
              price: raw.sellingPrice,
            })
          );
        }
      }
    }

    const journalRepo = dataSource.getRepository(JournalEntry);
    const journalLineRepo = dataSource.getRepository(JournalLine);
    const poRepo = dataSource.getRepository(PurchaseOrder);
    const poLineRepo = dataSource.getRepository(PurchaseOrderLine);
    const grnRepo = dataSource.getRepository(Grn);
    const grnLineRepo = dataSource.getRepository(GrnLine);
    const supplierInvoiceRepo = dataSource.getRepository(SupplierInvoice);
    const supplierInvoiceLineRepo = dataSource.getRepository(SupplierInvoiceLine);
    const salesInvoiceRepo = dataSource.getRepository(Invoice);
    const salesInvoiceLineRepo = dataSource.getRepository(InvoiceLine);
    const receiptRepo = dataSource.getRepository(Receipt);
    const receiptAllocationRepo = dataSource.getRepository(ReceiptAllocation);
    const supplierPaymentRepo = dataSource.getRepository(SupplierPayment);
    const supplierPaymentAllocationRepo = dataSource.getRepository(SupplierPaymentAllocation);

    const inventoryAccount = accountByCode.get('1210') ?? accountByCode.get('1200');
    const ownerCapitalAccount = accountByCode.get('3000');
    const salesRevenueAccount = accountByCode.get('4000');
    const cogsAccount = accountByCode.get('5000');
    if (!inventoryAccount || !ownerCapitalAccount || !salesRevenueAccount || !cogsAccount) {
      throw new Error(
        'Seed: inventory (1210/1200), owner capital (3000), sales (4000), and COGS (5000) accounts must exist'
      );
    }

    const openingCapitalReference = 'SEED-OPENING-CAPITAL-001';
    const existingOpeningCapital = await journalRepo.findOne({
      where: { reference: openingCapitalReference },
    });
    if (!existingOpeningCapital) {
      const openingCapital = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-02',
          reference: openingCapitalReference,
          description: 'Initial owner equity introduced into bank for startup funding',
          status: 'posted',
          sourceType: 'seed',
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: openingCapital.id,
          accountId: bankAccount.id,
          debit: '5000000.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: openingCapital.id,
          accountId: ownerCapitalAccount.id,
          debit: '0.0000',
          credit: '5000000.0000',
        }),
      ]);
      console.log('Seeded opening owner equity journal entry');
    }

    const mainWarehouse = await whRepo.findOne({ where: { code: 'MAIN' } });
    const coldWarehouse = await whRepo.findOne({ where: { code: 'COLD' } });
    const cityPharmacy = await customerRepo.findOne({ where: { name: 'City Pharmacy — Saddar' } });
    const medilink = await customerRepo.findOne({ where: { name: 'Medilink Wholesale Distributors' } });
    const gskSupplier = await supplierRepo.findOne({ where: { name: 'GlaxoSmithKline Pakistan Limited' } });
    const pfizerSupplier = await supplierRepo.findOne({ where: { name: 'Pfizer Pakistan' } });

    if (!mainWarehouse || !coldWarehouse || !cityPharmacy || !medilink || !gskSupplier || !pfizerSupplier) {
      throw new Error('Seed: required master data for sample purchases/sales is missing');
    }

    const paracetamol = await productRepo.findOne({ where: { sku: 'PHR-PAR-500-20S' } });
    const amoxicillin = await productRepo.findOne({ where: { sku: 'PHR-AMX-250-15S' } });
    const syrup = await productRepo.findOne({ where: { sku: 'SYR-AMOX-250-60ML' } });
    const insulin = await productRepo.findOne({ where: { sku: 'PHR-INS-ASP-5ML' } });
    const gloves = await productRepo.findOne({ where: { sku: 'SUR-GLOV-NXS-M' } });
    if (!paracetamol || !amoxicillin || !syrup || !insulin || !gloves) {
      throw new Error('Seed: required demo products are missing for purchase/sales transactions');
    }

    const purchaseOneNote = 'SEED-PURCHASE-001';
    const purchaseTwoNote = 'SEED-PURCHASE-002';

    const existingPurchaseOne = await poRepo.findOne({ where: { notes: purchaseOneNote } });
    if (!existingPurchaseOne) {
      const po1 = await poRepo.save(
        poRepo.create({
          supplierId: gskSupplier.id,
          orderDate: '2026-01-05',
          expectedDate: '2026-01-07',
          status: 'sent',
          warehouseId: mainWarehouse.id,
          subtotal: '17000.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '17000.0000',
          notes: purchaseOneNote,
        })
      );
      const po1Lines = await poLineRepo.save([
        poLineRepo.create({
          purchaseOrderId: po1.id,
          productId: paracetamol.id,
          quantity: '100.0000',
          unitPrice: '85.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          receivedQuantity: '100.0000',
        }),
        poLineRepo.create({
          purchaseOrderId: po1.id,
          productId: amoxicillin.id,
          quantity: '20.0000',
          unitPrice: '320.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          receivedQuantity: '20.0000',
        }),
        poLineRepo.create({
          purchaseOrderId: po1.id,
          productId: syrup.id,
          quantity: '10.0000',
          unitPrice: '210.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          receivedQuantity: '10.0000',
        }),
      ]);
      const grn1 = await grnRepo.save(
        grnRepo.create({
          purchaseOrderId: po1.id,
          supplierId: gskSupplier.id,
          grnDate: '2026-01-07',
          warehouseId: mainWarehouse.id,
          status: 'posted',
        })
      );
      await grnLineRepo.save([
        grnLineRepo.create({
          grnId: grn1.id,
          productId: paracetamol.id,
          quantity: '100.0000',
          unitPrice: '85.0000',
          purchaseOrderLineId: po1Lines[0].id,
        }),
        grnLineRepo.create({
          grnId: grn1.id,
          productId: amoxicillin.id,
          quantity: '20.0000',
          unitPrice: '320.0000',
          purchaseOrderLineId: po1Lines[1].id,
        }),
        grnLineRepo.create({
          grnId: grn1.id,
          productId: syrup.id,
          quantity: '10.0000',
          unitPrice: '210.0000',
          purchaseOrderLineId: po1Lines[2].id,
        }),
      ]);
      const supplierInvoice1 = await supplierInvoiceRepo.save(
        supplierInvoiceRepo.create({
          supplierId: gskSupplier.id,
          invoiceNumber: 'SI-SEED-0001',
          invoiceDate: '2026-01-08',
          dueDate: '2026-02-07',
          purchaseOrderId: po1.id,
          grnId: grn1.id,
          status: 'posted',
          subtotal: '17000.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '17000.0000',
          notes: purchaseOneNote,
        })
      );
      await supplierInvoiceLineRepo.save([
        supplierInvoiceLineRepo.create({
          supplierInvoiceId: supplierInvoice1.id,
          productId: paracetamol.id,
          quantity: '100.0000',
          unitPrice: '85.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        supplierInvoiceLineRepo.create({
          supplierInvoiceId: supplierInvoice1.id,
          productId: amoxicillin.id,
          quantity: '20.0000',
          unitPrice: '320.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        supplierInvoiceLineRepo.create({
          supplierInvoiceId: supplierInvoice1.id,
          productId: syrup.id,
          quantity: '10.0000',
          unitPrice: '210.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
      ]);

      const purchaseJournal1 = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-08',
          reference: 'SEED-JE-PURCHASE-001',
          description: 'Inventory added from first seeded supplier purchase',
          status: 'posted',
          sourceType: 'supplier_invoice',
          sourceId: supplierInvoice1.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: purchaseJournal1.id,
          accountId: inventoryAccount.id,
          debit: '17000.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: purchaseJournal1.id,
          accountId: gskSupplier.payableAccountId,
          debit: '0.0000',
          credit: '17000.0000',
        }),
      ]);
      console.log('Seeded first purchase flow');
    }

    const existingPurchaseTwo = await poRepo.findOne({ where: { notes: purchaseTwoNote } });
    if (!existingPurchaseTwo) {
      const po2 = await poRepo.save(
        poRepo.create({
          supplierId: pfizerSupplier.id,
          orderDate: '2026-01-10',
          expectedDate: '2026-01-12',
          status: 'sent',
          warehouseId: coldWarehouse.id,
          subtotal: '37850.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '37850.0000',
          notes: purchaseTwoNote,
        })
      );
      const po2Lines = await poLineRepo.save([
        poLineRepo.create({
          purchaseOrderId: po2.id,
          productId: insulin.id,
          quantity: '2.0000',
          unitPrice: '18500.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          receivedQuantity: '2.0000',
        }),
        poLineRepo.create({
          purchaseOrderId: po2.id,
          productId: gloves.id,
          quantity: '1.0000',
          unitPrice: '850.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          receivedQuantity: '1.0000',
        }),
      ]);
      const grn2 = await grnRepo.save(
        grnRepo.create({
          purchaseOrderId: po2.id,
          supplierId: pfizerSupplier.id,
          grnDate: '2026-01-12',
          warehouseId: coldWarehouse.id,
          status: 'posted',
        })
      );
      await grnLineRepo.save([
        grnLineRepo.create({
          grnId: grn2.id,
          productId: insulin.id,
          quantity: '2.0000',
          unitPrice: '18500.0000',
          purchaseOrderLineId: po2Lines[0].id,
        }),
        grnLineRepo.create({
          grnId: grn2.id,
          productId: gloves.id,
          quantity: '1.0000',
          unitPrice: '850.0000',
          purchaseOrderLineId: po2Lines[1].id,
        }),
      ]);
      const supplierInvoice2 = await supplierInvoiceRepo.save(
        supplierInvoiceRepo.create({
          supplierId: pfizerSupplier.id,
          invoiceNumber: 'SI-SEED-0002',
          invoiceDate: '2026-01-13',
          dueDate: '2026-02-12',
          purchaseOrderId: po2.id,
          grnId: grn2.id,
          status: 'posted',
          subtotal: '37850.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '37850.0000',
          notes: purchaseTwoNote,
        })
      );
      await supplierInvoiceLineRepo.save([
        supplierInvoiceLineRepo.create({
          supplierInvoiceId: supplierInvoice2.id,
          productId: insulin.id,
          quantity: '2.0000',
          unitPrice: '18500.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        supplierInvoiceLineRepo.create({
          supplierInvoiceId: supplierInvoice2.id,
          productId: gloves.id,
          quantity: '1.0000',
          unitPrice: '850.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
      ]);

      const purchaseJournal2 = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-13',
          reference: 'SEED-JE-PURCHASE-002',
          description: 'Inventory added from second seeded supplier purchase',
          status: 'posted',
          sourceType: 'supplier_invoice',
          sourceId: supplierInvoice2.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: purchaseJournal2.id,
          accountId: inventoryAccount.id,
          debit: '37850.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: purchaseJournal2.id,
          accountId: pfizerSupplier.payableAccountId,
          debit: '0.0000',
          credit: '37850.0000',
        }),
      ]);
      console.log('Seeded second purchase flow');
    }

    const saleOneNote = 'SEED-SALE-001';
    const saleTwoNote = 'SEED-SALE-002';

    const existingSaleOne = await salesInvoiceRepo.findOne({ where: { notes: saleOneNote } });
    if (!existingSaleOne) {
      const invoice1 = await salesInvoiceRepo.save(
        salesInvoiceRepo.create({
          customerId: cityPharmacy.id,
          invoiceDate: '2026-01-15',
          dueDate: '2026-01-15',
          status: 'posted',
          paymentType: 'cash',
          warehouseId: mainWarehouse.id,
          subtotal: '4075.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '4075.0000',
          notes: saleOneNote,
        })
      );
      await salesInvoiceLineRepo.save([
        salesInvoiceLineRepo.create({
          invoiceId: invoice1.id,
          productId: paracetamol.id,
          quantity: '30.0000',
          unitPrice: '95.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        salesInvoiceLineRepo.create({
          invoiceId: invoice1.id,
          productId: syrup.id,
          quantity: '5.0000',
          unitPrice: '245.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
      ]);
      const saleJournal1 = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-15',
          reference: 'SEED-JE-SALE-001',
          description: 'Cash sale from seeded invoice batch',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: invoice1.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: saleJournal1.id,
          accountId: cashAccount.id,
          debit: '4075.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: saleJournal1.id,
          accountId: salesRevenueAccount.id,
          debit: '0.0000',
          credit: '4075.0000',
        }),
      ]);
      console.log('Seeded first sales invoice');
    }

    const existingSaleTwo = await salesInvoiceRepo.findOne({ where: { notes: saleTwoNote } });
    if (!existingSaleTwo) {
      const invoice2 = await salesInvoiceRepo.save(
        salesInvoiceRepo.create({
          customerId: medilink.id,
          invoiceDate: '2026-01-16',
          dueDate: '2026-02-15',
          status: 'posted',
          paymentType: 'credit',
          warehouseId: mainWarehouse.id,
          subtotal: '25660.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '25660.0000',
          notes: saleTwoNote,
        })
      );
      await salesInvoiceLineRepo.save([
        salesInvoiceLineRepo.create({
          invoiceId: invoice2.id,
          productId: amoxicillin.id,
          quantity: '10.0000',
          unitPrice: '380.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        salesInvoiceLineRepo.create({
          invoiceId: invoice2.id,
          productId: gloves.id,
          quantity: '2.0000',
          unitPrice: '980.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        salesInvoiceLineRepo.create({
          invoiceId: invoice2.id,
          productId: insulin.id,
          quantity: '1.0000',
          unitPrice: '19900.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
      ]);
      const saleJournal2 = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-16',
          reference: 'SEED-JE-SALE-002',
          description: 'Credit sale from seeded invoice batch',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: invoice2.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: saleJournal2.id,
          accountId: medilink.receivableAccountId,
          debit: '25660.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: saleJournal2.id,
          accountId: salesRevenueAccount.id,
          debit: '0.0000',
          credit: '25660.0000',
        }),
      ]);
      console.log('Seeded second sales invoice');
    }

    const saleOne = await salesInvoiceRepo.findOne({ where: { notes: saleOneNote } });
    const saleTwo = await salesInvoiceRepo.findOne({ where: { notes: saleTwoNote } });
    if (!saleOne || !saleTwo) {
      throw new Error('Seed: baseline seeded sales invoices are missing');
    }

    const existingCogsOne = await journalRepo.findOne({ where: { reference: 'SEED-JE-COGS-001' } });
    if (!existingCogsOne) {
      const cogsJournal1 = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-15',
          reference: 'SEED-JE-COGS-001',
          description: 'COGS recognition for cash seeded sale',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: saleOne.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: cogsJournal1.id,
          accountId: cogsAccount.id,
          debit: '3600.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: cogsJournal1.id,
          accountId: inventoryAccount.id,
          debit: '0.0000',
          credit: '3600.0000',
        }),
      ]);
    }

    const existingCogsTwo = await journalRepo.findOne({ where: { reference: 'SEED-JE-COGS-002' } });
    if (!existingCogsTwo) {
      const cogsJournal2 = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-16',
          reference: 'SEED-JE-COGS-002',
          description: 'COGS recognition for credit seeded sale',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: saleTwo.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: cogsJournal2.id,
          accountId: cogsAccount.id,
          debit: '23300.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: cogsJournal2.id,
          accountId: inventoryAccount.id,
          debit: '0.0000',
          credit: '23300.0000',
        }),
      ]);
    }

    const saleAgingOverdueNote = 'SEED-SALE-AGING-OVERDUE';
    const saleAgingCurrentNote = 'SEED-SALE-AGING-CURRENT';

    let agingOverdueInvoice = await salesInvoiceRepo.findOne({ where: { notes: saleAgingOverdueNote } });
    if (!agingOverdueInvoice) {
      agingOverdueInvoice = await salesInvoiceRepo.save(
        salesInvoiceRepo.create({
          customerId: cityPharmacy.id,
          invoiceDate: '2026-02-05',
          dueDate: '2026-03-05',
          status: 'posted',
          paymentType: 'credit',
          warehouseId: mainWarehouse.id,
          subtotal: '1500.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '1500.0000',
          notes: saleAgingOverdueNote,
        })
      );
      await salesInvoiceLineRepo.save([
        salesInvoiceLineRepo.create({
          invoiceId: agingOverdueInvoice.id,
          productId: paracetamol.id,
          quantity: '10.0000',
          unitPrice: '95.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        salesInvoiceLineRepo.create({
          invoiceId: agingOverdueInvoice.id,
          productId: syrup.id,
          quantity: '2.0000',
          unitPrice: '275.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
      ]);
      const agingSaleJournal = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-02-05',
          reference: 'SEED-JE-SALE-003',
          description: 'Overdue AR bucket seeded sale',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: agingOverdueInvoice.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: agingSaleJournal.id,
          accountId: cityPharmacy.receivableAccountId,
          debit: '1500.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: agingSaleJournal.id,
          accountId: salesRevenueAccount.id,
          debit: '0.0000',
          credit: '1500.0000',
        }),
      ]);
      const agingCogsJournal = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-02-05',
          reference: 'SEED-JE-COGS-003',
          description: 'COGS for overdue AR bucket seeded sale',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: agingOverdueInvoice.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: agingCogsJournal.id,
          accountId: cogsAccount.id,
          debit: '1270.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: agingCogsJournal.id,
          accountId: inventoryAccount.id,
          debit: '0.0000',
          credit: '1270.0000',
        }),
      ]);
    }

    let agingCurrentInvoice = await salesInvoiceRepo.findOne({ where: { notes: saleAgingCurrentNote } });
    if (!agingCurrentInvoice) {
      agingCurrentInvoice = await salesInvoiceRepo.save(
        salesInvoiceRepo.create({
          customerId: medilink.id,
          invoiceDate: '2026-04-20',
          dueDate: '2026-05-20',
          status: 'posted',
          paymentType: 'credit',
          warehouseId: mainWarehouse.id,
          subtotal: '4100.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
          total: '4100.0000',
          notes: saleAgingCurrentNote,
        })
      );
      await salesInvoiceLineRepo.save([
        salesInvoiceLineRepo.create({
          invoiceId: agingCurrentInvoice.id,
          productId: amoxicillin.id,
          quantity: '6.0000',
          unitPrice: '380.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
        salesInvoiceLineRepo.create({
          invoiceId: agingCurrentInvoice.id,
          productId: gloves.id,
          quantity: '2.0000',
          unitPrice: '910.0000',
          taxAmount: '0.0000',
          discountAmount: '0.0000',
        }),
      ]);
      const currentSaleJournal = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-04-20',
          reference: 'SEED-JE-SALE-004',
          description: 'Current AR bucket seeded sale',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: agingCurrentInvoice.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: currentSaleJournal.id,
          accountId: medilink.receivableAccountId,
          debit: '4100.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: currentSaleJournal.id,
          accountId: salesRevenueAccount.id,
          debit: '0.0000',
          credit: '4100.0000',
        }),
      ]);
      const currentCogsJournal = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-04-20',
          reference: 'SEED-JE-COGS-004',
          description: 'COGS for current AR bucket seeded sale',
          status: 'posted',
          sourceType: 'invoice',
          sourceId: agingCurrentInvoice.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: currentCogsJournal.id,
          accountId: cogsAccount.id,
          debit: '3620.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: currentCogsJournal.id,
          accountId: inventoryAccount.id,
          debit: '0.0000',
          credit: '3620.0000',
        }),
      ]);
    }

    const purchaseOneInvoice = await supplierInvoiceRepo.findOne({ where: { notes: purchaseOneNote } });
    const purchaseTwoInvoice = await supplierInvoiceRepo.findOne({ where: { notes: purchaseTwoNote } });
    if (!purchaseOneInvoice || !purchaseTwoInvoice || !agingOverdueInvoice || !agingCurrentInvoice) {
      throw new Error('Seed: expected purchase/sales documents for allocations are missing');
    }

    const existingReceiptOne = await receiptRepo.findOne({ where: { reference: 'SEED-RECEIPT-001' } });
    if (!existingReceiptOne) {
      const receiptOne = await receiptRepo.save(
        receiptRepo.create({
          customerId: cityPharmacy.id,
          receiptDate: '2026-01-15',
          amount: '4075.0000',
          paymentMethod: 'cash',
          reference: 'SEED-RECEIPT-001',
        })
      );
      await receiptAllocationRepo.save(
        receiptAllocationRepo.create({
          receiptId: receiptOne.id,
          invoiceId: saleOne.id,
          amount: '4075.0000',
        })
      );
      const receiptJournalOne = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-15',
          reference: 'SEED-JE-RECEIPT-001',
          description: 'Settlement of seeded cash sale receipt',
          status: 'posted',
          sourceType: 'receipt',
          sourceId: receiptOne.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: receiptJournalOne.id,
          accountId: cashAccount.id,
          debit: '4075.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: receiptJournalOne.id,
          accountId: cityPharmacy.receivableAccountId,
          debit: '0.0000',
          credit: '4075.0000',
        }),
      ]);
    }

    const existingReceiptTwo = await receiptRepo.findOne({ where: { reference: 'SEED-RECEIPT-002' } });
    if (!existingReceiptTwo) {
      const receiptTwo = await receiptRepo.save(
        receiptRepo.create({
          customerId: medilink.id,
          receiptDate: '2026-02-20',
          amount: '18000.0000',
          paymentMethod: 'bank_transfer',
          reference: 'SEED-RECEIPT-002',
        })
      );
      await receiptAllocationRepo.save(
        receiptAllocationRepo.create({
          receiptId: receiptTwo.id,
          invoiceId: saleTwo.id,
          amount: '18000.0000',
        })
      );
      const receiptJournalTwo = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-02-20',
          reference: 'SEED-JE-RECEIPT-002',
          description: 'Partial settlement on seeded credit sale',
          status: 'posted',
          sourceType: 'receipt',
          sourceId: receiptTwo.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: receiptJournalTwo.id,
          accountId: bankAccount.id,
          debit: '18000.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: receiptJournalTwo.id,
          accountId: medilink.receivableAccountId,
          debit: '0.0000',
          credit: '18000.0000',
        }),
      ]);
    }

    const existingSupplierPaymentOne = await supplierPaymentRepo.findOne({
      where: { reference: 'SEED-SUPP-PAY-001' },
    });
    if (!existingSupplierPaymentOne) {
      const supplierPaymentOne = await supplierPaymentRepo.save(
        supplierPaymentRepo.create({
          supplierId: gskSupplier.id,
          paymentDate: '2026-01-25',
          amount: '10000.0000',
          paymentMethod: 'bank_transfer',
          reference: 'SEED-SUPP-PAY-001',
        })
      );
      await supplierPaymentAllocationRepo.save(
        supplierPaymentAllocationRepo.create({
          supplierPaymentId: supplierPaymentOne.id,
          supplierInvoiceId: purchaseOneInvoice.id,
          amount: '10000.0000',
        })
      );
      const supplierPaymentJournalOne = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-01-25',
          reference: 'SEED-JE-SUPP-PAY-001',
          description: 'Partial settlement of first seeded supplier invoice',
          status: 'posted',
          sourceType: 'supplier_payment',
          sourceId: supplierPaymentOne.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: supplierPaymentJournalOne.id,
          accountId: gskSupplier.payableAccountId,
          debit: '10000.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: supplierPaymentJournalOne.id,
          accountId: bankAccount.id,
          debit: '0.0000',
          credit: '10000.0000',
        }),
      ]);
    }

    const existingSupplierPaymentTwo = await supplierPaymentRepo.findOne({
      where: { reference: 'SEED-SUPP-PAY-002' },
    });
    if (!existingSupplierPaymentTwo) {
      const supplierPaymentTwo = await supplierPaymentRepo.save(
        supplierPaymentRepo.create({
          supplierId: pfizerSupplier.id,
          paymentDate: '2026-02-10',
          amount: '37850.0000',
          paymentMethod: 'bank_transfer',
          reference: 'SEED-SUPP-PAY-002',
        })
      );
      await supplierPaymentAllocationRepo.save(
        supplierPaymentAllocationRepo.create({
          supplierPaymentId: supplierPaymentTwo.id,
          supplierInvoiceId: purchaseTwoInvoice.id,
          amount: '37850.0000',
        })
      );
      const supplierPaymentJournalTwo = await journalRepo.save(
        journalRepo.create({
          entryDate: '2026-02-10',
          reference: 'SEED-JE-SUPP-PAY-002',
          description: 'Full settlement of second seeded supplier invoice',
          status: 'posted',
          sourceType: 'supplier_payment',
          sourceId: supplierPaymentTwo.id,
        })
      );
      await journalLineRepo.save([
        journalLineRepo.create({
          journalEntryId: supplierPaymentJournalTwo.id,
          accountId: pfizerSupplier.payableAccountId,
          debit: '37850.0000',
          credit: '0.0000',
        }),
        journalLineRepo.create({
          journalEntryId: supplierPaymentJournalTwo.id,
          accountId: bankAccount.id,
          debit: '0.0000',
          credit: '37850.0000',
        }),
      ]);
    }

    const SEED_USERS: Array<{ email: string; name: string; roleName: string; password: string }> = [
      {
        email: 'admin@tradeflow.local',
        name: 'Admin User',
        roleName: 'Admin',
        password: 'admin123',
      },
      {
        email: 'accountant@tradeflow.local',
        name: 'Sara Accountant',
        roleName: 'Accountant',
        password: 'accountant123',
      },
      {
        email: 'sales@tradeflow.local',
        name: 'Omar Sales',
        roleName: 'Sales',
        password: 'sales123',
      },
      {
        email: 'storekeeper@tradeflow.local',
        name: 'Warehouse Clerk',
        roleName: 'Storekeeper',
        password: 'store123',
      },
    ];

    for (const u of SEED_USERS) {
      const existing = await userRepo.findOne({ where: { email: u.email } });
      if (existing) continue;
      const role = await roleRepo.findOne({ where: { name: u.roleName } });
      if (!role) {
        console.warn(`Seed: role "${u.roleName}" not found; skip user ${u.email}`);
        continue;
      }
      const user = userRepo.create({
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        name: u.name,
      });
      user.roles = [role];
      await userRepo.save(user);
      console.log(`Created user: ${u.email} / ${u.password} (${u.roleName})`);
    }

    console.log('Seed completed');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

seed();
