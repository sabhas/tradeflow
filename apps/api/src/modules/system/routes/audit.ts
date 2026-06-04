import { Router } from 'express';
import { listAuditLogsQuerySchema } from '@tradeflow/shared';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as auditController from '../controllers/auditController';

export const auditRouter = Router();

auditRouter.get(
  '/',
  authMiddleware,
  requirePermission('audit', 'read'),
  validateQuery(listAuditLogsQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await auditController.listAuditLogs(req));
  })
);
