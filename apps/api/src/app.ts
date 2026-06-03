import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { registerAuthRoutes } from './modules/auth';
import { registerSystemRoutes } from './modules/system';
import { registerMastersRoutes } from './modules/masters';
import { registerAccountingRoutes } from './modules/accounting';
import { registerInventoryRoutes } from './modules/inventory';
import { registerSalesRoutes } from './modules/sales';
import { registerPurchasesRoutes } from './modules/purchases';
import { registerReportsRoutes } from './modules/reports';
import { registerSettingsRoutes } from './modules/settings';
import { requestIdMiddleware } from './shared/middleware/requestId';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler';
import { logger } from './logger';
import { mountSwagger } from './swagger';

export const app = express();

app.use(requestIdMiddleware);
app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({ requestId: req.requestId }),
  })
);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  })
);
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests', message: 'Rate limit exceeded' },
  })
);

mountSwagger(app);

registerSystemRoutes(app);
registerAuthRoutes(app);
registerMastersRoutes(app);
registerInventoryRoutes(app);
registerSalesRoutes(app);
registerPurchasesRoutes(app);
registerReportsRoutes(app);
registerAccountingRoutes(app);
registerSettingsRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);
