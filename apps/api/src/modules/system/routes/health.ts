import { Router } from 'express';
import { handle } from '../../../shared/utils/handleRoute';
import * as healthController from '../controllers/healthController';

export const healthRouter = Router();

healthRouter.get(
  '/',
  handle(() => healthController.getHealth())
);
