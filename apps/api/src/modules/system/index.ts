import type { Express } from 'express';
import { healthRouter } from './routes/health';
import { auditRouter } from './routes/audit';
import { recycleBinRouter } from './routes/recycleBin';
import { importRouter } from './routes/import';
import { exportRouter } from './routes/export';

export function registerSystemRoutes(app: Express): void {
  app.use('/health', healthRouter);
  app.use('/audit-logs', auditRouter);
  app.use('/recycle-bin', recycleBinRouter);
  app.use('/import', importRouter);
  app.use('/export', exportRouter);
}
