import type { Express } from 'express';
import { authRouter } from './routes/auth';

export function registerAuthRoutes(app: Express): void {
  app.use('/auth', authRouter);
}
