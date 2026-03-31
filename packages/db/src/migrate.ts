import * as dotenv from 'dotenv';
import * as path from 'path';

// pnpm runs this script with cwd = packages/db, so process.cwd()/.env misses repo-root .env
const repoRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'apps/api/.env') });
import { dataSource } from './data-source';

async function migrate() {
  try {
    await dataSource.initialize();
    const migrations = await dataSource.runMigrations();
    console.log(`Ran ${migrations.length} migration(s)`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

migrate();
