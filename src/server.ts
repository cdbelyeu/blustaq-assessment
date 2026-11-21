import { createApp } from './app';
import { openDatabase } from './db/database';
import { createLogger } from './logger';

const port = Number(process.env.PORT ?? 3000);
const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
const db = openDatabase(process.env.DATABASE_PATH ?? 'notes.db');

createApp({ db, logger }).listen(port, () => {
  logger.info({ port }, 'team-notes-api listening');
});
