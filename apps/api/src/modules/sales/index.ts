import type { Express } from 'express';
import { quotationsRouter } from './routes/quotations';
import { salesOrdersRouter } from './routes/salesOrders';
import { invoicesRouter } from './routes/invoices';
import { receiptsRouter } from './routes/receipts';

export function registerSalesRoutes(app: Express): void {
  app.use('/quotations', quotationsRouter);
  app.use('/sales-orders', salesOrdersRouter);
  app.use('/invoices', invoicesRouter);
  app.use('/receipts', receiptsRouter);
}
