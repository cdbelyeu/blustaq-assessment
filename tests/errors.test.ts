import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { errorHandler } from '../src/middleware/errors';

describe('error handling', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'No route for GET /nope' } });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'invalid_json', message: 'Request body is not valid JSON' },
    });
  });

  it('returns a generic 500 without leaking internals', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });
    app.use(errorHandler);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal', message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    consoleError.mockRestore();
  });
});
