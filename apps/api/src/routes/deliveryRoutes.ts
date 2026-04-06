import { Router } from 'express';
import {
  createDeliveryRouteSchema,
  updateDeliveryRouteSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as deliveryRoutesController from '../controllers/deliveryRoutesController';

export const deliveryRoutesRouter = Router();
deliveryRoutesRouter.use(authMiddleware, loadUser);

deliveryRoutesRouter.get(
  '/',
  requirePermission('logistics.routes', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRoutesController.listDeliveryRoutes(req));
  })
);

deliveryRoutesRouter.post(
  '/',
  requirePermission('logistics.routes', 'write'),
  auditMiddleware({ entity: 'DeliveryRoute', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createDeliveryRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await deliveryRoutesController.createDeliveryRoute(req, parsed.data));
  })
);

deliveryRoutesRouter.get(
  '/:id/stops',
  requirePermission('logistics.routes', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRoutesController.listRouteStops(req));
  })
);

deliveryRoutesRouter.get(
  '/:id',
  requirePermission('logistics.routes', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRoutesController.getDeliveryRoute(req));
  })
);

deliveryRoutesRouter.patch(
  '/:id',
  requirePermission('logistics.routes', 'write'),
  auditMiddleware({
    entity: 'DeliveryRoute',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateDeliveryRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await deliveryRoutesController.updateDeliveryRoute(req, parsed.data));
  })
);

deliveryRoutesRouter.delete(
  '/:id',
  requirePermission('logistics.routes', 'write'),
  auditMiddleware({ entity: 'DeliveryRoute', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryRoutesController.deleteDeliveryRoute(req));
  })
);
