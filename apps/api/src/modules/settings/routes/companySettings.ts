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
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as companySettingsController from '../controllers/companySettingsController';

export const companySettingsRouter = Router();
companySettingsRouter.use(authMiddleware, loadUser);

companySettingsRouter.get(
  '/',
  requirePermission('settings', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await companySettingsController.getGeneral(req));
  })
);

companySettingsRouter.patch(
  '/',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  validateBody(patchGeneralSettingsSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await companySettingsController.patchGeneral(req, getValidatedBody(req)));
  })
);

companySettingsRouter.get(
  '/company',
  requirePermission('settings', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await companySettingsController.getCompanyProfile(req));
  })
);

companySettingsRouter.patch(
  '/company',
  requirePermission('settings', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  validateBody(patchCompanyProfileSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(
      res,
      await companySettingsController.patchCompanyProfile(req, getValidatedBody(req))
    );
  })
);

companySettingsRouter.get(
  '/accounting/period-lock-warnings',
  requirePermission('accounting', 'read'),
  validateQuery(periodLockQuerySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await companySettingsController.getPeriodLockWarnings(req));
  })
);

companySettingsRouter.get(
  '/accounting',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await companySettingsController.getAccounting(req));
  })
);

companySettingsRouter.patch(
  '/accounting',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'CompanySettings', getNewValue: (req) => req.body }),
  validateBody(patchCompanyAccountingSettingsSchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await companySettingsController.patchAccounting(req, getValidatedBody(req)));
  })
);
