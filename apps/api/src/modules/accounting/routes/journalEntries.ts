import { Router } from 'express';
import { z } from 'zod';
import { createJournalEntrySchema, updateJournalEntrySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { getValidatedBody, validateBody } from '../../../shared/middleware/validate';
import { asyncHandler } from '../../../shared/utils/asyncHandler';
import { sendControllerResult } from '../../../shared/utils/controllerResult';
import * as journalEntriesController from '../controllers/journalEntriesController';

export const journalEntriesRouter = Router();
journalEntriesRouter.use(authMiddleware, loadUser);

journalEntriesRouter.get(
  '/',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await journalEntriesController.listJournalEntries(req));
  })
);

journalEntriesRouter.get(
  '/:id',
  requirePermission('accounting', 'read'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await journalEntriesController.getJournalEntry(req));
  })
);

journalEntriesRouter.post(
  '/',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'JournalEntry', getNewValue: (req) => req.body }),
  validateBody(createJournalEntrySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await journalEntriesController.createJournalEntry(req, getValidatedBody(req)));
  })
);

journalEntriesRouter.patch(
  '/:id',
  requirePermission('accounting', 'write'),
  auditMiddleware({
    entity: 'JournalEntry',
    getEntityId: (req) => req.params.id,
    getNewValue: (req) => req.body,
  }),
  validateBody(updateJournalEntrySchema),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await journalEntriesController.updateJournalEntry(req, getValidatedBody(req)));
  })
);

journalEntriesRouter.delete(
  '/:id',
  requirePermission('accounting', 'write'),
  auditMiddleware({
    entity: 'JournalEntry',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => journalEntriesController.getJournalEntrySnapshotForAudit(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await journalEntriesController.deleteJournalEntry(req));
  })
);

journalEntriesRouter.post(
  '/:id/post',
  requirePermission('accounting', 'write'),
  asyncHandler(async (req, res) => {
    sendControllerResult(res, await journalEntriesController.postJournalEntry(req));
  })
);

const reverseJournalBodySchema = z.object({
  entryDate: z.string().optional(),
});

journalEntriesRouter.post(
  '/:id/reverse',
  requirePermission('accounting', 'write'),
  asyncHandler(async (req, res) => {
    const parsed = reverseJournalBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    sendControllerResult(res, await journalEntriesController.reverseJournalEntry(req, parsed.data.entryDate));
  })
);
