import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { createPasswordHasher, type PasswordHasher } from './auth/passwords';
import type { Db } from './db/database';
import { createNoteRepository } from './db/notes';
import { createSessionRepository } from './db/sessions';
import { createUserRepository } from './db/users';
import type { Logger } from './logger';
import { systemClock, type Clock } from './clock';
import { createAuth } from './middleware/auth';
import { createErrorHandler, notFoundHandler } from './middleware/errors';
import { buildOpenApiDocument } from './openapi';
import { createHealthRouter } from './routes/health';
import { createMeRouter } from './routes/me';
import { createNotesRouter } from './routes/notes';
import { createSessionsRouter } from './routes/sessions';
import { createUsersRouter } from './routes/users';

export interface AppDependencies {
  db: Db;
  logger: Logger;
  // Seams for tests: a controllable clock and a cheap password hash.
  clock?: Clock;
  passwordHasher?: PasswordHasher;
  sessionTtlMinutes?: number;
}

export function createApp({
  db,
  logger,
  clock = systemClock,
  passwordHasher = createPasswordHasher(),
  sessionTtlMinutes = 30,
}: AppDependencies): express.Express {
  const users = createUserRepository(db, clock);
  const sessions = createSessionRepository(db);
  const notes = createNoteRepository(db, clock);
  const requireAuth = createAuth(sessions, clock);

  const app = express();
  app.disable('x-powered-by');
  // Above the 100 KB note cap, so the field rules decide what is too big; beyond this is a 413.
  app.use(express.json({ limit: '256kb' }));

  const openApiDocument = buildOpenApiDocument();
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { swaggerOptions: { persistAuthorization: true } }),
  );

  app.use('/health', createHealthRouter(db, logger));
  app.use('/users', createUsersRouter(users, passwordHasher));
  app.use(
    '/sessions',
    createSessionsRouter({
      users,
      sessions,
      hasher: passwordHasher,
      clock,
      ttlMinutes: sessionTtlMinutes,
      requireAuth,
    }),
  );
  app.use('/me', requireAuth, createMeRouter(users));
  app.use('/notes', requireAuth, createNotesRouter(notes));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
