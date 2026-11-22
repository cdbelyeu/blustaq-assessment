import { Router } from 'express';
import type { Db } from '../db/database';
import type { Logger } from '../logger';

const SELECT_HEALTH_CHECK = `
  SELECT message
  FROM health_check
  WHERE id = 1
`;

export function createHealthRouter(db: Db, logger: Logger): Router {
  const router = Router();

  // Liveness: the process is up and serving requests.
  router.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: the database is reachable and migrated.
  router.get('/db', (_req, res) => {
    try {
      db.prepare(SELECT_HEALTH_CHECK).get();
      res.json({ status: 'ok' });
    } catch (err) {
      logger.error({ err }, 'database health check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
