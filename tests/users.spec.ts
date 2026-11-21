import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { silentLogger } from './support/logs';

describe('users', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp({ db, logger: silentLogger() });
  });

  afterEach(() => db.close());

  const register = async (email = 'ada@example.com', displayName = 'Ada') =>
    (await request(app).post('/users').send({ email, displayName })).body as { id: string };

  describe('POST /users', () => {
    it('registers a user', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'ada@example.com', displayName: 'Ada' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        email: 'ada@example.com',
        displayName: 'Ada',
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
    });

    it('normalizes the email to lowercase and trims the name', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'Ada@Example.COM', displayName: '  Ada  ' });

      expect(res.body).toMatchObject({ email: 'ada@example.com', displayName: 'Ada' });
    });

    it.each([
      ['a missing email', { displayName: 'Ada' }, 'email'],
      ['an invalid email', { email: 'not-an-email', displayName: 'Ada' }, 'email'],
      ['a blank name', { email: 'ada@example.com', displayName: '   ' }, 'displayName'],
      [
        'an overlong name',
        { email: 'ada@example.com', displayName: 'x'.repeat(101) },
        'displayName',
      ],
      ['an unknown field', { email: 'ada@example.com', displayName: 'Ada', role: 'admin' }, ''],
    ])('rejects %s with details', async (_label, body, path) => {
      const res = await request(app).post('/users').send(body);

      expect(res.status).toBe(400);
      expect((res.body as { error: unknown }).error).toMatchObject({
        code: 'validation_failed',
        details: [expect.objectContaining({ path })],
      });
    });

    it('rejects a duplicate email regardless of case', async () => {
      await register('ada@example.com');

      const res = await request(app)
        .post('/users')
        .send({ email: 'ADA@example.com', displayName: 'Other' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: { code: 'email_taken', message: 'Email is already registered' },
      });
    });
  });

  describe('authentication stub', () => {
    it.each([
      ['no header', undefined],
      ['an unknown user id', 'no-such-user'],
    ])('returns 401 for %s', async (_label, id) => {
      const req = request(app).get('/me');
      const res = await (id ? req.set('X-User-Id', id) : req);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'unauthorized', message: 'Authentication required' },
      });
    });
  });

  describe('GET /me', () => {
    it('returns the signed-in user', async () => {
      const { id } = await register();

      const res = await request(app).get('/me').set('X-User-Id', id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, email: 'ada@example.com', displayName: 'Ada' });
    });
  });

  describe('PATCH /me', () => {
    it('updates the profile', async () => {
      const { id } = await register();

      const res = await request(app)
        .patch('/me')
        .set('X-User-Id', id)
        .send({ displayName: 'Ada Lovelace' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ displayName: 'Ada Lovelace', email: 'ada@example.com' });
      const reread = await request(app).get('/me').set('X-User-Id', id);
      expect(reread.body).toEqual(res.body);
    });

    it('rejects an empty update', async () => {
      const { id } = await register();

      const res = await request(app).patch('/me').set('X-User-Id', id).send({});

      expect(res.status).toBe(400);
    });

    it('rejects changing the email to one already registered', async () => {
      await register('ada@example.com');
      const { id } = await register('grace@example.com', 'Grace');

      const res = await request(app)
        .patch('/me')
        .set('X-User-Id', id)
        .send({ email: 'ada@example.com' });

      expect(res.status).toBe(409);
    });

    it('requires authentication', async () => {
      const res = await request(app).patch('/me').send({ displayName: 'x' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /me', () => {
    it('deletes the account', async () => {
      const { id } = await register();

      const res = await request(app).delete('/me').set('X-User-Id', id);

      expect(res.status).toBe(204);
      expect((await request(app).get('/me').set('X-User-Id', id)).status).toBe(401);
    });

    it('lets the email be registered again afterwards', async () => {
      const { id } = await register();
      await request(app).delete('/me').set('X-User-Id', id);

      const res = await request(app)
        .post('/users')
        .send({ email: 'ada@example.com', displayName: 'Ada' });

      expect(res.status).toBe(201);
    });
  });
});
