import './loadEnv';
import { BaseEntity } from 'typeorm';
import { dataSource } from '@tradeflow/db';
import { app } from './app';
import { config } from './config';
import { logger } from './logger';

async function main() {
  try {
    await dataSource.initialize();
    BaseEntity.useDataSource(dataSource);
    logger.info('Database connected');

    app.listen(config.PORT, () => {
      logger.info({ port: config.PORT }, `API listening on http://localhost:${config.PORT}`);
      logger.info(`Swagger UI: http://localhost:${config.PORT}/api-docs`);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start');
    process.exit(1);
  }
}

main();
