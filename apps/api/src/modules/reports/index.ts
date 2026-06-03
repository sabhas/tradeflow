import type { Express } from 'express';
import { reportsRouter } from './routes/reports';

export function registerReportsRoutes(app: Express): void {
  app.use('/reports', reportsRouter);
}
