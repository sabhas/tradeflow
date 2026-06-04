import { Router } from 'express';
import { z } from 'zod';
import {
  createJournalEntrySchema,
  listJournalEntriesQuerySchema,
  updateJournalEntrySchema,
} from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../../../shared/middleware/auth';
import { auditMiddleware } from '../../../shared/middleware/audit';
import { validateBody, validateQuery } from '../../../shared/middleware/validate';
import { handle, handleBody } from '../../../shared/utils/handleRoute';
import { withStatus } from '../../../shared/utils/controllerResult';
import * as journalEntriesController from '../controllers/journalEntriesController';

export const journalEntriesRouter = Router();
journalEntriesRouter.use(authMiddleware, loadUser);

journalEntriesRouter.get(
  '/',
  requirePermission('accounting', 'read'),
  validateQuery(listJournalEntriesQuerySchema),
  handle(journalEntriesController.listJournalEntries)
);

journalEntriesRouter.get(
  '/:id',
  requirePermission('accounting', 'read'),
  handle(journalEntriesController.getJournalEntry)
);

journalEntriesRouter.post(
  '/',
  requirePermission('accounting', 'write'),
  auditMiddleware({ entity: 'JournalEntry', getNewValue: (req) => req.body }),
  validateBody(createJournalEntrySchema),
  handleBody(journalEntriesController.createJournalEntry)
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
  handleBody(journalEntriesController.updateJournalEntry)
);

journalEntriesRouter.delete(
  '/:id',
  requirePermission('accounting', 'write'),
  auditMiddleware({
    entity: 'JournalEntry',
    getEntityId: (req) => req.params.id,
    getOldValue: async (req) => journalEntriesController.getJournalEntrySnapshotForAudit(req.params.id),
  }),
  handle(journalEntriesController.deleteJournalEntry)
);

journalEntriesRouter.post(
  '/:id/post',
  requirePermission('accounting', 'write'),
  handle(journalEntriesController.postJournalEntry)
);

const reverseJournalBodySchema = z.object({
  entryDate: z.string().optional(),
});

journalEntriesRouter.post(
  '/:id/reverse',
  requirePermission('accounting', 'write'),
  handle(async (req) => {
    const parsed = reverseJournalBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return withStatus(400, { error: 'Invalid input', details: parsed.error.flatten() });
    }
    return journalEntriesController.reverseJournalEntry(req, parsed.data.entryDate);
  })
);
