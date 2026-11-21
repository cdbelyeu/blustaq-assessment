import request from 'supertest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { capturingLogger, silentLogger } from './support/logs';

describe('health endpoints', () => {
  let db: Db;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  describe('GET /health', () => {
    it('reports the process is up', async () => {
      const res = await request(createApp({ db, logger: silentLogger() })).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('stays up when the database is down', async () => {
      db.close();

      const res = await request(createApp({ db, logger: silentLogger() })).get('/health');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /health/db', () => {
    it('reports ok when the database is reachable and migrated', async () => {
      const res = await request(createApp({ db, logger: silentLogger() })).get('/health/db');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('returns 503 without leaking details and logs the failure', async () => {
      db.close();
      const { logger, entries } = capturingLogger();

      const res = await request(createApp({ db, logger })).get('/health/db');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'unavailable' });
      expect(entries()).toEqual([
        expect.objectContaining({ level: 50, msg: 'database health check failed' }),
      ]);
    });
  });
});
