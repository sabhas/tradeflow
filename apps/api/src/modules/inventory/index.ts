import type { Express } from 'express';
import { inventoryRouter } from './routes/inventory';
import { stockTransfersRouter } from './routes/stockTransfers';

export function registerInventoryRoutes(app: Express): void {
  app.use('/inventory', inventoryRouter);
  app.use('/stock-transfers', stockTransfersRouter);
}
