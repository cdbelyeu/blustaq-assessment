import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { openDatabase } from '../src/db/database';
import { createErrorHandler } from '../src/middleware/errors';
import { capturingLogger, silentLogger } from './support/logs';

describe('error handling', () => {
  const db = openDatabase(':memory:');
  afterAll(() => db.close());

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(createApp({ db, logger: silentLogger() })).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'No route for GET /nope' } });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(createApp({ db, logger: silentLogger() }))
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'invalid_json', message: 'Request body is not valid JSON' },
    });
  });

  it('returns 413 for a request body over the size limit, without logging an error', async () => {
    const { logger, entries } = capturingLogger();
    const app = createApp({ db, logger });

    const res = await request(app)
      .post('/users')
      .send({
        email: 'a@example.com',
        displayName: 'x'.repeat(300_000),
        password: 'whatever long',
      });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'payload_too_large', message: 'Request body is too large' },
    });
    expect(entries()).toEqual([]);
  });

  it('returns a generic 500 without leaking internals, and logs the cause', async () => {
    const { logger, entries } = capturingLogger();
    const app = express();
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });
    app.use(createErrorHandler(logger));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal', message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      level: 50,
      msg: 'unhandled error',
      err: { message: 'database password is hunter2' },
    });
  });
});
