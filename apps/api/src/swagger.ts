import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import { config } from './config';
import { createOpenApiDocument } from './openapi/document';

const serverUrl = `http://localhost:${config.PORT}`;

export const swaggerSpec = createOpenApiDocument(serverUrl);

export function mountSwagger(app: Express): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });
}
