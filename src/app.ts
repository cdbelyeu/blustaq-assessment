import express from 'express';
import type { Db } from './db/database';
import type { Logger } from './logger';
import { createHealthRouter } from './routes/health';
import { createErrorHandler, notFoundHandler } from './middleware/errors';

export interface AppDependencies {
  db: Db;
  logger: Logger;
}

export function createApp({ db, logger }: AppDependencies): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', createHealthRouter(db, logger));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
