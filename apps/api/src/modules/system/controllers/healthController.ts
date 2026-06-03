import { dataSource } from '@tradeflow/db';
import { ok, withStatus, type ControllerResult } from '../../../shared/utils/controllerResult';

export async function getHealth(): Promise<ControllerResult> {
  try {
    await dataSource.query('SELECT 1');
    return ok({ status: 'ok', api: 'up', database: 'up' });
  } catch {
    return withStatus(503, { status: 'degraded', api: 'up', database: 'down' });
  }
}
