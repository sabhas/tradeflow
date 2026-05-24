import { Router } from 'express';
import {
  patchCompanyAccountingSettingsSchema,
  patchCompanyProfileSchema,
  patchGeneralSettingsSchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
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
  asyncHandler(async (req, res) => {
    const parsed = patchGeneralSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await companySettingsController.patchGeneral(req, parsed.data));
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
  asyncHandler(async (req, res) => {
    const parsed = patchCompanyProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await companySettingsController.patchCompanyProfile(req, parsed.data));
  })
);

companySettingsRouter.get(
  '/accounting/period-lock-warnings',
  requirePermission('accounting', 'read'),
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
  asyncHandler(async (req, res) => {
    const parsed = patchCompanyAccountingSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await companySettingsController.patchAccounting(req, parsed.data));
  })
);
