import { Router } from 'express';
import type { Db } from '../db/database';

export function createHealthRouter(db: Db): Router {
  const router = Router();

  // Liveness: the process is up and serving requests.
  router.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: the database is reachable and migrated.
  router.get('/db', (_req, res) => {
    try {
      db.prepare('SELECT message FROM health_check WHERE id = 1').get();
      res.json({ status: 'ok' });
    } catch (err) {
      console.error('database health check failed', err);
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
