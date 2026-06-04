import { Router } from 'express';
import {
  patchCompanyAccountingSettingsSchema,
  patchCompanyProfileSchema,
  patchGeneralSettingsSchema,
  periodLockQuerySchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import * as companySettingsController from '../controllers/companySettingsController';

export const companySettingsRouter = Router();
companySettingsRouter.use(authMiddleware, loadUser);

companySettingsRouter.get(
  '/',
  requirePermission('settings', 'read'),
  handle(companySettingsController.getGeneral)
);

companySettingsRouter.patch(
  '/',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  validateBody(patchGeneralSettingsSchema),
  handleBody(companySettingsController.patchGeneral)
);

companySettingsRouter.get(
  '/company',
  requirePermission('settings', 'read'),
  handle(companySettingsController.getCompanyProfile)
);

companySettingsRouter.patch(
  '/company',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  validateBody(patchCompanyProfileSchema),
  handleBody(companySettingsController.patchCompanyProfile)
);

companySettingsRouter.get(
  '/accounting/period-lock-warnings',
  requirePermission('accounting', 'read'),
  validateQuery(periodLockQuerySchema),
  handle(companySettingsController.getPeriodLockWarnings)
);

companySettingsRouter.get(
  '/accounting',
  requirePermission('accounting', 'read'),
  handle(companySettingsController.getAccounting)
);

companySettingsRouter.patch(
  '/accounting',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  validateBody(patchCompanyAccountingSettingsSchema),
  handleBody(companySettingsController.patchAccounting)
);
