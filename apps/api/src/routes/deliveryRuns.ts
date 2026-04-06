import { Router } from 'express';
import { createDeliveryRunSchema, updateDeliveryRunSchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as deliveryRunsController from '../controllers/deliveryRunsController';

export const deliveryRunsRouter = Router();
deliveryRunsRouter.use(authMiddleware, loadUser);

deliveryRunsRouter.get(
  '/',
  requirePermission('logistics.deliveries', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRunsController.listDeliveryRuns(req));
  })
);

deliveryRunsRouter.get(
  '/:id/sheet',
  requirePermission('logistics.deliveries', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRunsController.getDeliveryRunSheet(req));
  })
);

deliveryRunsRouter.get(
  '/:id',
  requirePermission('logistics.deliveries', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRunsController.getDeliveryRun(req));
  })
);

deliveryRunsRouter.post(
  '/',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryRun', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createDeliveryRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await deliveryRunsController.createDeliveryRun(req, parsed.data));
  })
);

deliveryRunsRouter.patch(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({
    entity: 'DeliveryRun',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateDeliveryRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await deliveryRunsController.updateDeliveryRun(req, parsed.data));
  })
);

deliveryRunsRouter.delete(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryRun', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRunsController.deleteDeliveryRun(req));
  })
);
