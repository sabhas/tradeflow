import { Router } from 'express';
import { z } from 'zod';
import { listApprovalsQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
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
  handle(approvalsController.listApprovalRequests)
);

approvalsRouter.post(
  '/:id/approve',
  requirePermission('accounting', 'write'),
  validateBody(reviewBodySchema),
  handleBody(approvalsController.approveApprovalRequest)
);

approvalsRouter.post(
  '/:id/reject',
  requirePermission('accounting', 'write'),
  validateBody(reviewBodySchema),
  handleBody(approvalsController.rejectApprovalRequest)
);
