import type { Express } from 'express';
import { accountsRouter } from './routes/accounts';
import { journalEntriesRouter } from './routes/journalEntries';

export function registerAccountingRoutes(app: Express): void {
  app.use('/accounts', accountsRouter);
  app.use('/journal-entries', journalEntriesRouter);
}
