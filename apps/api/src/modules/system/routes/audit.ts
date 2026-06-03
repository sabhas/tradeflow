import { Router } from 'express';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as auditController from '../controllers/auditController';

export const auditRouter = Router();

auditRouter.get(
  '/',
  authMiddleware,
  requirePermission('audit', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await auditController.listAuditLogs(req));
  })
);
