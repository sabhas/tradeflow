import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
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
