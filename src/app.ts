import express from 'express';
import type { Db } from './db/database';
import { createHealthRouter } from './routes/health';
import { errorHandler, notFoundHandler } from './middleware/errors';

export function createApp({ db }: { db: Db }): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', createHealthRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
