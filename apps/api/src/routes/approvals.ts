import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as approvalsController from '../controllers/approvalsController';

export const approvalsRouter = Router();
approvalsRouter.use(authMiddleware, loadUser);

const reviewBodySchema = z.object({
  note: z.string().max(2000).optional(),
});

approvalsRouter.get(
  '/',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await approvalsController.listApprovalRequests(req));
  })
);

approvalsRouter.post(
  '/:id/approve',
  requirePermission('accounting', 'write'),
  asyncHandler(async (req, res) => {
    const parsed = reviewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await approvalsController.approveApprovalRequest(req, parsed.data));
  })
);

approvalsRouter.post(
  '/:id/reject',
  requirePermission('accounting', 'write'),
  asyncHandler(async (req, res) => {
    const parsed = reviewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await approvalsController.rejectApprovalRequest(req, parsed.data));
  })
);
