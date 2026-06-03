import type { Express } from 'express';
import { purchaseOrdersRouter } from './routes/purchaseOrders';
import { grnsRouter } from './routes/grns';
import { purchaseReturnsRouter } from './routes/purchaseReturns';
import { supplierInvoicesRouter } from './routes/supplierInvoices';
import { supplierPaymentsRouter } from './routes/supplierPayments';

export function registerPurchasesRoutes(app: Express): void {
  app.use('/purchase-orders', purchaseOrdersRouter);
  app.use('/grns', grnsRouter);
  app.use('/purchase-returns', purchaseReturnsRouter);
  app.use('/supplier-invoices', supplierInvoicesRouter);
  app.use('/supplier-payments', supplierPaymentsRouter);
}
