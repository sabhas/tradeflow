import 'dotenv/config';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { app } from './app';

const repoRoot = path.resolve(__dirname, '../../..');
console.log('repoRoot', repoRoot);
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, 'apps/api/.env') });

import { dataSource } from '@tradeflow/db';


const PORT = process.env.PORT || 3001;

async function main() {
  try {
    await dataSource.initialize();
    console.log('Database connected');

    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

main();
