import { Router } from 'express';
import { listAuditLogsQuerySchema } from '@tradeflow/shared';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { handle } from '../../../shared/utils/handleRoute';
import * as auditController from '../controllers/auditController';

export const auditRouter = Router();

auditRouter.get(
  '/',
  authMiddleware,
  requirePermission('audit', 'read'),
  validateQuery(listAuditLogsQuerySchema),
  handle(auditController.listAuditLogs)
);
