import type { User } from '@tradeflow/db';
import type { AuthPayload } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      validatedBody?: unknown;
      validatedQuery?: unknown;
      auth?: AuthPayload;
      user?: User;
    }
  }
}

export {};
