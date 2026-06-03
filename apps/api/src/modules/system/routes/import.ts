import { Router } from 'express';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { importUpload } from '../../../shared/middleware/upload';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as importController from '../controllers/importController';

export const importRouter = Router();
importRouter.use(authMiddleware, loadUser);

importRouter.get(
  '/products/template',
  requirePermission('masters.products', 'write'),
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
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await importController.importProducts(req));
  })
);

importRouter.post(
  '/customers',
  requirePermission('masters.customers', 'write'),
  importUpload.single('file'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await importController.importCustomers(req));
  })
);

importRouter.post(
  '/opening-balances',
  requirePermission('inventory', 'write'),
  importUpload.single('file'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await importController.importOpeningBalances(req));
  })
);
