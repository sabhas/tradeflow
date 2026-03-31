import { Router } from 'express';
import { dataSource } from '@tradeflow/db';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await dataSource.query('SELECT 1');
    res.json({ status: 'ok', api: 'up', database: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', api: 'up', database: 'down' });
  }
});
