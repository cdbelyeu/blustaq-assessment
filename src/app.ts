import express from 'express';
import type { Db } from './db/database';
import { createUserRepository } from './db/users';
import type { Logger } from './logger';
import { createAuthStub } from './middleware/auth';
import { createErrorHandler, notFoundHandler } from './middleware/errors';
import { createHealthRouter } from './routes/health';
import { createMeRouter } from './routes/me';
import { createUsersRouter } from './routes/users';

export interface AppDependencies {
  db: Db;
  logger: Logger;
}

export function createApp({ db, logger }: AppDependencies): express.Express {
  const users = createUserRepository(db);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', createHealthRouter(db, logger));
  app.use('/users', createUsersRouter(users));
  app.use('/me', createAuthStub(users), createMeRouter(users));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
