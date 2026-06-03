import type { Express } from 'express';
import { companySettingsRouter } from './routes/companySettings';
import { invoiceTemplatesRouter } from './routes/invoiceTemplates';
import { notificationsRouter } from './routes/notifications';
import { approvalsRouter } from './routes/approvals';

export function registerSettingsRoutes(app: Express): void {
  app.use('/settings', companySettingsRouter);
  app.use('/invoice-templates', invoiceTemplatesRouter);
  app.use('/notifications', notificationsRouter);
  app.use('/approvals', approvalsRouter);
}
