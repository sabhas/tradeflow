import { Router } from 'express';
import { importTemplateQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { importUpload } from '../../../shared/middleware/upload';
import { validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { handle } from '../../../shared/utils/handleRoute';
import * as importController from '../controllers/importController';

export const importRouter = Router();
importRouter.use(authMiddleware, loadUser);

importRouter.get(
  '/products/template',
  requirePermission('masters.products', 'write'),
  validateQuery(importTemplateQuerySchema),
  asyncHandler(async (req, res) => {
    const r = await importController.downloadProductsTemplate(req);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', r.contentDisposition);
    res.send(r.data);
  })
);

importRouter.get(
  '/customers/template',
  requirePermission('masters.customers', 'write'),
  validateQuery(importTemplateQuerySchema),
  asyncHandler(async (req, res) => {
    const r = await importController.downloadCustomersTemplate(req);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', r.contentDisposition);
    res.send(r.data);
  })
);

importRouter.get(
  '/opening-balances/template',
  requirePermission('inventory', 'write'),
  validateQuery(importTemplateQuerySchema),
  asyncHandler(async (req, res) => {
    const r = await importController.downloadOpeningBalancesTemplate(req);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', r.contentDisposition);
    res.send(r.data);
  })
);

importRouter.post(
  '/products',
  requirePermission('masters.products', 'write'),
  importUpload.single('file'),
  handle(importController.importProducts)
);

importRouter.post(
  '/customers',
  requirePermission('masters.customers', 'write'),
  importUpload.single('file'),
  handle(importController.importCustomers)
);

importRouter.post(
  '/opening-balances',
  requirePermission('inventory', 'write'),
  importUpload.single('file'),
  handle(importController.importOpeningBalances)
);
