import 'zod-openapi/extend';
import { createDocument } from 'zod-openapi';
import { buildApiPaths } from './buildPaths';

export function createOpenApiDocument(serverUrl: string) {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'TradeFlow API',
      version: '1.0.0',
      description:
        'REST API for TradeFlow pharma distribution ERP. Authenticate via POST /auth/login, then send `Authorization: Bearer <token>` on protected routes. Request/response bodies use the same Zod schemas as runtime validation in `@tradeflow/shared`.',
    },
    servers: [{ url: serverUrl, description: 'API server' }],
    tags: [
      { name: 'Health', description: 'Service health checks' },
      { name: 'Auth', description: 'Authentication and current user' },
      { name: 'Masters', description: 'Master data (products, customers, suppliers, etc.)' },
      { name: 'Sales', description: 'Quotations, sales orders, invoices, receipts' },
      { name: 'Purchases', description: 'POs, GRNs, supplier invoices, payments, returns' },
      { name: 'Inventory', description: 'Stock balances, movements, transfers' },
      { name: 'Accounting', description: 'GL accounts, journal entries' },
      { name: 'Reports', description: 'Analytics and financial reports' },
      { name: 'Settings', description: 'Company and invoice template settings' },
      { name: 'ImportExport', description: 'Bulk import templates and exports' },
      { name: 'Audit', description: 'Audit logs and recycle bin' },
      { name: 'Notifications', description: 'User notifications' },
      { name: 'Approvals', description: 'Accounting approval workflow' },
    ],
    paths: buildApiPaths(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT from POST /auth/login',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  });
}
