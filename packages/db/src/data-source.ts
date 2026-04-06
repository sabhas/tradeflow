import 'reflect-metadata';

import { DataSource } from 'typeorm';
import * as path from 'path';

export const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tradeflow',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [
    path.join(__dirname, 'entities', '*.ts'),
    path.join(__dirname, 'entities', '*.js'),
  ],
  migrations: [
    path.join(__dirname, 'migrations', '*.ts'),
    path.join(__dirname, 'migrations', '*.js'),
  ],
});
