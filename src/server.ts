import { createApp } from './app';
import { openDatabase } from './db/database';
import { createLogger } from './logger';

const port = Number(process.env.PORT ?? 3000);
const sessionTtlMinutes = Number(process.env.SESSION_TTL_MINUTES ?? 30);
if (!(sessionTtlMinutes > 0)) {
  throw new Error(
    `SESSION_TTL_MINUTES must be a positive number, got "${process.env.SESSION_TTL_MINUTES}"`,
  );
}

const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
const db = openDatabase(process.env.DATABASE_PATH ?? 'notes.db');

createApp({ db, logger, sessionTtlMinutes }).listen(port, () => {
  logger.info({ port, sessionTtlMinutes }, 'team-notes-api listening');
});
