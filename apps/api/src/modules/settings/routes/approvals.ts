import { Router } from 'express';
import { z } from 'zod';
import { listApprovalsQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as approvalsController from '../controllers/approvalsController';

export const approvalsRouter = Router();
approvalsRouter.use(authMiddleware, loadUser);

const reviewBodySchema = z.object({
  note: z.string().max(2000).optional(),
});

approvalsRouter.get(
  '/',
  requirePermission('accounting', 'read'),
  validateQuery(listApprovalsQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await approvalsController.listApprovalRequests(req));
  })
);

approvalsRouter.post(
  '/:id/approve',
  requirePermission('accounting', 'write'),
  validateBody(reviewBodySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await approvalsController.approveApprovalRequest(req, getValidatedBody(req)));
  })
);

approvalsRouter.post(
  '/:id/reject',
  requirePermission('accounting', 'write'),
  validateBody(reviewBodySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await approvalsController.rejectApprovalRequest(req, getValidatedBody(req)));
  })
);
