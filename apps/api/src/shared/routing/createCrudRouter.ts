import { Router, type Request } from 'express';
import type { ZodSchema } from 'zod';
import { paginationQuerySchema } from '@tradeflow/shared';
import { authMiddleware, loadUser, requirePermission } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { validateBody, validateQuery } from '../middleware/validate';
import { handle, handleBody } from '../utils/handleRoute';
import type { ControllerResult } from '../utils/controllerResult';

export type CrudController = {
  list: (req: Request) => Promise<ControllerResult>;
  get?: (req: Request) => Promise<ControllerResult>;
  /** Body is validated by validateBody before the handler runs. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (req: Request, body: any) => Promise<ControllerResult>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (req: Request, body: any) => Promise<ControllerResult>;
  delete?: (req: Request) => Promise<ControllerResult>;
  getSnapshotForAudit?: (id: string) => Promise<unknown> | unknown;
};

export type CrudRouterConfig = {
  permission: { module: string; read: string; write: string };
  auditEntity: string;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  listQuerySchema?: ZodSchema;
  controller: CrudController;
  includeGet?: boolean;
  includeDelete?: boolean;
};

export function createCrudRouter(config: CrudRouterConfig): Router {
  const router = Router();
  router.use(authMiddleware, loadUser);

  const listQuery = config.listQuerySchema ?? paginationQuerySchema;
  const { permission, auditEntity, createSchema, updateSchema, controller } = config;
  const includeGet = config.includeGet ?? !!controller.get;
  const includeDelete = config.includeDelete ?? !!controller.delete;

  router.get(
    '/',
    requirePermission(permission.module, permission.read),
    validateQuery(listQuery),
    handle(controller.list)
  );

  if (includeGet && controller.get) {
    router.get('/:id', requirePermission(permission.module, permission.read), handle(controller.get));
  }

  router.post(
    '/',
    requirePermission(permission.module, permission.write),
    auditMiddleware({ entity: auditEntity, getNewValue: (req) => req.body }),
    validateBody(createSchema),
    handleBody(controller.create)
  );

  router.patch(
    '/:id',
    requirePermission(permission.module, permission.write),
    auditMiddleware({
      entity: auditEntity,
      getEntityId: (req) => req.params.id,
      getOldValue: controller.getSnapshotForAudit
        ? async (req) => controller.getSnapshotForAudit!(req.params.id)
        : undefined,
      getNewValue: (req) => req.body,
    }),
    validateBody(updateSchema),
    handleBody(controller.update)
  );

  if (includeDelete && controller.delete) {
    router.delete(
      '/:id',
      requirePermission(permission.module, permission.write),
      auditMiddleware({
        entity: auditEntity,
        getEntityId: (req) => req.params.id,
        getOldValue: controller.getSnapshotForAudit
          ? async (req) => controller.getSnapshotForAudit!(req.params.id)
          : undefined,
      }),
      handle(controller.delete)
    );
  }

  return router;
}
