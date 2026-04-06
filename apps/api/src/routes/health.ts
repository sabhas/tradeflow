import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendControllerResult } from '../utils/controllerResult';
import * as healthController from '../controllers/healthController';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendControllerResult(res, await healthController.getHealth());
  })
);
