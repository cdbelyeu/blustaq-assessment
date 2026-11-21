import request from 'supertest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';

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
      const res = await request(createApp({ db })).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('stays up when the database is down', async () => {
      db.close();

      const res = await request(createApp({ db })).get('/health');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /health/db', () => {
    it('reports ok when the database is reachable and migrated', async () => {
      const res = await request(createApp({ db })).get('/health/db');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('returns 503 without leaking details when the database is unavailable', async () => {
      db.close();
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await request(createApp({ db })).get('/health/db');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'unavailable' });
      consoleError.mockRestore();
    });
  });
});
