import * as dotenv from 'dotenv';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'apps/api/.env') });
import bcrypt from 'bcryptjs';
import { dataSource } from './data-source';
import { User } from './entities/User';
import { Role } from './entities/Role';
import { Permission } from './entities/Permission';
import { Branch } from './entities/Branch';
import { UnitOfMeasure } from './entities/UnitOfMeasure';
import { PriceLevel } from './entities/PriceLevel';
import { PaymentTerms } from './entities/PaymentTerms';
import { TaxProfile } from './entities/TaxProfile';
import { ProductCategory } from './entities/ProductCategory';

const PERMISSIONS: Array<{ resource: string; action: string; code: string }> = [
  { resource: 'audit', action: 'read', code: 'audit:read' },
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

    const branchRepo = dataSource.getRepository(Branch);
    let mainBranch = await branchRepo.findOne({ where: { code: 'MAIN' } });
    if (!mainBranch) {
      mainBranch = await branchRepo.save(branchRepo.create({ name: 'Main', code: 'MAIN' }));
      console.log('Created default branch MAIN');
    }

    const uomRepo = dataSource.getRepository(UnitOfMeasure);
    if ((await uomRepo.count()) === 0) {
      await uomRepo.save(
        uomRepo.create({ code: 'PCS', name: 'Pieces', branchId: mainBranch.id })
      );
      console.log('Created default UoM PCS');
    }

    const plRepo = dataSource.getRepository(PriceLevel);
    if ((await plRepo.count()) === 0) {
      await plRepo.save([
        plRepo.create({ name: 'Retail', branchId: mainBranch.id }),
        plRepo.create({ name: 'Wholesale', branchId: mainBranch.id }),
      ]);
      console.log('Created default price levels');
    }

    const ptRepo = dataSource.getRepository(PaymentTerms);
    if ((await ptRepo.count()) === 0) {
      await ptRepo.save([
        ptRepo.create({ name: 'Net 30', netDays: 30, branchId: mainBranch.id }),
        ptRepo.create({ name: 'COD', netDays: 0, branchId: mainBranch.id }),
      ]);
      console.log('Created sample payment terms');
    }

    const txRepo = dataSource.getRepository(TaxProfile);
    if ((await txRepo.count()) === 0) {
      await txRepo.save(
        txRepo.create({
          name: 'Standard',
          rate: '0',
          isInclusive: false,
          branchId: mainBranch.id,
        })
      );
      console.log('Created default tax profile');
    }

    const catRepo = dataSource.getRepository(ProductCategory);
    if ((await catRepo.count()) === 0) {
      await catRepo.save(
        catRepo.create({
          name: 'General',
          code: 'GEN',
          branchId: mainBranch.id,
        })
      );
      console.log('Created default product category');
    }

    const existingUser = await userRepo.findOne({ where: { email: 'admin@tradeflow.local' } });
    if (!existingUser) {
      const adminRole = await roleRepo.findOne({ where: { name: 'Admin' }, relations: ['permissions'] });
      if (adminRole) {
        const user = userRepo.create({
          email: 'admin@tradeflow.local',
          passwordHash: await bcrypt.hash('admin123', 10),
          name: 'Admin User',
          branchId: mainBranch.id,
        });
        user.roles = [adminRole];
        await userRepo.save(user);
        console.log('Created admin user: admin@tradeflow.local / admin123');
      }
    } else if (!existingUser.branchId) {
      existingUser.branchId = mainBranch.id;
      await userRepo.save(existingUser);
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
