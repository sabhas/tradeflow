import 'reflect-metadata';

import { DataSource } from 'typeorm';
import * as path from 'path';
import { User } from './entities/User';
import { Role } from './entities/Role';
import { Permission } from './entities/Permission';
import { AuditLog } from './entities/AuditLog';

export const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tradeflow',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [User, Role, Permission, AuditLog],
  // Use globs so TypeORM can discover migrations both in dev (ts-node) and in prod (compiled js).
  migrations: [
    path.join(__dirname, 'migrations', '*.ts'),
    path.join(__dirname, 'migrations', '*.js'),
  ],
});
