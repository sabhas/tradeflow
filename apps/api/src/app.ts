import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { auditRouter } from './routes/audit';

export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/audit-logs', auditRouter);
