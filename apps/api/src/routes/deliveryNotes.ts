import { Router } from 'express';
import {
  createDeliveryNoteSchema,
  proofOfDeliverySchema,
  updateDeliveryNoteSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as deliveryNotesController from '../controllers/deliveryNotesController';

export const deliveryNotesRouter = Router();
deliveryNotesRouter.use(authMiddleware, loadUser);

deliveryNotesRouter.get(
  '/',
  requirePermission('logistics.deliveries', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryNotesController.listDeliveryNotes(req));
  })
);

deliveryNotesRouter.get(
  '/:id',
  requirePermission('logistics.deliveries', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryNotesController.getDeliveryNote(req));
  })
);

deliveryNotesRouter.post(
  '/',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryNote', getNewValue: (req) => req.body }),
  asyncHandler(async (req, res) => {
    const parsed = createDeliveryNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await deliveryNotesController.createDeliveryNote(req, parsed.data));
  })
);

deliveryNotesRouter.patch(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({
    entity: 'DeliveryNote',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  asyncHandler(async (req, res) => {
    const parsed = updateDeliveryNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await deliveryNotesController.updateDeliveryNote(req, parsed.data));
  })
);

deliveryNotesRouter.post(
  '/:id/pod',
  asyncHandler(async (req, res) => {
    const parsed = proofOfDeliverySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await deliveryNotesController.addProofOfDelivery(req, parsed.data));
  })
);

deliveryNotesRouter.delete(
  '/:id',
  requirePermission('logistics.deliveries', 'write'),
  auditMiddleware({ entity: 'DeliveryNote', getEntityId: (req) => req.params.id }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await deliveryNotesController.deleteDeliveryNote(req));
  })
);
