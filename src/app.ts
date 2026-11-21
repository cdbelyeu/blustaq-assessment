import express from 'express';
import { healthRouter } from './routes/health';
import { errorHandler, notFoundHandler } from './middleware/errors';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
