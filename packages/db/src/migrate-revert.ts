import * as dotenv from 'dotenv';
import * as path from 'path';


const repoRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'apps/api/.env') });
import { dataSource } from './data-source';

function getRevertSteps(): number {
  const raw = process.env.MIGRATION_REVERT_STEPS ?? '1';
  const steps = Number(raw);

  if (!Number.isInteger(steps) || steps <= 0) {
    throw new Error(
      `Invalid MIGRATION_REVERT_STEPS value "${raw}". Use a positive integer.`
    );
  }

  return steps;
}

async function revertMigrations() {
  const steps = getRevertSteps();

  try {
    await dataSource.initialize();

    let reverted = 0;
    for (let i = 0; i < steps; i += 1) {
      try {
        await dataSource.undoLastMigration();
        reverted += 1;
        console.log(`Reverted migration ${reverted} of ${steps}`);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.toLowerCase().includes('no migrations were found')
        ) {
          break;
        }
        throw error;
      }
    }

    console.log(`Reverted ${reverted} migration(s)`);
  } catch (err) {
    console.error('Migration revert failed:', err);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

revertMigrations();
