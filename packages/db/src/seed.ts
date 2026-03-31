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

const PERMISSIONS = [
  { resource: 'audit', action: 'read', code: 'audit:read' },
  { resource: 'inventory', action: 'read', code: 'inventory:read' },
  { resource: 'inventory', action: 'write', code: 'inventory:write' },
  { resource: 'sales', action: 'read', code: 'sales:read' },
  { resource: 'sales', action: 'create', code: 'sales:create' },
  { resource: 'sales', action: 'update', code: 'sales:update' },
  { resource: 'accounting', action: 'read', code: 'accounting:read' },
  { resource: 'accounting', action: 'write', code: 'accounting:write' },
];

const ROLES = [
  { name: 'Admin', description: 'Full system access', permissions: ['audit:read', 'inventory:read', 'inventory:write', 'sales:read', 'sales:create', 'sales:update', 'accounting:read', 'accounting:write'] },
  { name: 'Accountant', description: 'Accounting and financial access', permissions: ['accounting:read', 'accounting:write', 'sales:read'] },
  { name: 'Sales', description: 'Sales and customer access', permissions: ['sales:read', 'sales:create', 'sales:update', 'inventory:read'] },
  { name: 'Storekeeper', description: 'Inventory management', permissions: ['inventory:read', 'inventory:write'] },
];

async function seed() {
  try {
    await dataSource.initialize();

    const permRepo = dataSource.getRepository(Permission);
    const roleRepo = dataSource.getRepository(Role);
    const userRepo = dataSource.getRepository(User);

    // Create permissions
    const existingPerms = await permRepo.count();
    if (existingPerms === 0) {
      for (const p of PERMISSIONS) {
        await permRepo.save(permRepo.create(p));
      }
      console.log(`Created ${PERMISSIONS.length} permissions`);
    }

    // Create roles with permissions
    const allPerms = await permRepo.find();
    const permMap = new Map(allPerms.map((p) => [p.code, p]));

    const existingRoles = await roleRepo.count();
    if (existingRoles === 0) {
      for (const r of ROLES) {
        const role = roleRepo.create({ name: r.name, description: r.description });
        const perms = r.permissions.map((code) => permMap.get(code)).filter(Boolean) as Permission[];
        role.permissions = perms;
        await roleRepo.save(role);
      }
      console.log(`Created ${ROLES.length} roles`);
    }

    // Create admin user if not exists
    const existingUser = await userRepo.findOne({ where: { email: 'admin@tradeflow.local' } });
    if (!existingUser) {
      const adminRole = await roleRepo.findOne({ where: { name: 'Admin' }, relations: ['permissions'] });
      if (adminRole) {
        const user = userRepo.create({
          email: 'admin@tradeflow.local',
          passwordHash: await bcrypt.hash('admin123', 10),
          name: 'Admin User',
        });
        user.roles = [adminRole];
        await userRepo.save(user);
        console.log('Created admin user: admin@tradeflow.local / admin123');
      }
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
