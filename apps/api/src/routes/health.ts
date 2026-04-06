import { Router } from 'express';
import { asyncHandler } from '../controllers/asyncHandler';
import { sendControllerResult } from '../controllers/controllerResult';
import * as healthController from '../controllers/healthController';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendControllerResult(res, await healthController.getHealth());
  })
);
