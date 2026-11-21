import request from 'supertest';
import { bearer, createTestApp, PASSWORD, type TestApp } from './support/app';

describe('users', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });

  afterEach(() => t.db.close());

  const register = (body: object) => request(t.app).post('/users').send(body);

  describe('POST /users', () => {
    it('registers a user without echoing the password', async () => {
      const res = await register({
        email: 'ada@example.com',
        displayName: 'Ada',
        password: PASSWORD,
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        email: 'ada@example.com',
        displayName: 'Ada',
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    });

    it('stores a salted hash, never the password', async () => {
      await register({ email: 'ada@example.com', displayName: 'Ada', password: PASSWORD });

      const row = t.db.prepare('SELECT password_hash FROM users').get() as {
        password_hash: string;
      };

      expect(row.password_hash).toMatch(/^scrypt\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
    });

    it('normalizes the email to lowercase and trims the name', async () => {
      const res = await register({
        email: 'Ada@Example.COM',
        displayName: '  Ada  ',
        password: PASSWORD,
      });

      expect(res.body).toMatchObject({ email: 'ada@example.com', displayName: 'Ada' });
    });

    it.each([
      ['a missing email', { displayName: 'Ada', password: PASSWORD }, 'email'],
      ['an invalid email', { email: 'nope', displayName: 'Ada', password: PASSWORD }, 'email'],
      [
        'a blank name',
        { email: 'a@example.com', displayName: '  ', password: PASSWORD },
        'displayName',
      ],
      ['a missing password', { email: 'a@example.com', displayName: 'Ada' }, 'password'],
      [
        'a short password',
        { email: 'a@example.com', displayName: 'Ada', password: 'short' },
        'password',
      ],
      [
        'an overlong password',
        { email: 'a@example.com', displayName: 'Ada', password: 'x'.repeat(129) },
        'password',
      ],
      [
        'an unknown field',
        { email: 'a@example.com', displayName: 'Ada', password: PASSWORD, role: 'admin' },
        '',
      ],
    ])('rejects %s with details', async (_label, body, path) => {
      const res = await register(body);

      expect(res.status).toBe(400);
      expect((res.body as { error: unknown }).error).toMatchObject({
        code: 'validation_failed',
        details: [expect.objectContaining({ path })],
      });
    });

    it('accepts passwords at the length limits, with spaces', async () => {
      const short = await register({
        email: 'a@example.com',
        displayName: 'A',
        password: ' abcdef ',
      });
      const long = await register({
        email: 'b@example.com',
        displayName: 'B',
        password: 'x'.repeat(128),
      });

      expect([short.status, long.status]).toEqual([201, 201]);
    });

    it('rejects a duplicate email regardless of case', async () => {
      await register({ email: 'ada@example.com', displayName: 'Ada', password: PASSWORD });

      const res = await register({
        email: 'ADA@example.com',
        displayName: 'Other',
        password: PASSWORD,
      });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: { code: 'email_taken', message: 'Email is already registered' },
      });
    });
  });

  describe('GET /me', () => {
    it('returns the signed-in user', async () => {
      const { id, token } = await t.signUp();

      const res = await request(t.app)
        .get('/me')
        .set(...bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, email: 'ada@example.com', displayName: 'Ada' });
      expect(JSON.stringify(res.body)).not.toContain('password');
    });
  });

  describe('PATCH /me', () => {
    it('updates the profile', async () => {
      const { token } = await t.signUp();

      const res = await request(t.app)
        .patch('/me')
        .set(...bearer(token))
        .send({ displayName: 'Ada Lovelace' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ displayName: 'Ada Lovelace', email: 'ada@example.com' });
      const reread = await request(t.app)
        .get('/me')
        .set(...bearer(token));
      expect(reread.body).toEqual(res.body);
    });

    it('does not change the password through the profile', async () => {
      const { token } = await t.signUp();

      const res = await request(t.app)
        .patch('/me')
        .set(...bearer(token))
        .send({ password: 'a brand new password' });

      expect(res.status).toBe(400);
      expect(await t.signIn('ada@example.com')).toBeDefined();
    });

    it('rejects an empty update', async () => {
      const { token } = await t.signUp();

      const res = await request(t.app)
        .patch('/me')
        .set(...bearer(token))
        .send({});

      expect(res.status).toBe(400);
    });

    it('rejects changing the email to one already registered', async () => {
      await t.signUp('ada@example.com');
      const { token } = await t.signUp('grace@example.com', 'Grace');

      const res = await request(t.app)
        .patch('/me')
        .set(...bearer(token))
        .send({ email: 'ada@example.com' });

      expect(res.status).toBe(409);
    });

    it('requires authentication', async () => {
      const res = await request(t.app).patch('/me').send({ displayName: 'x' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /me', () => {
    it('deletes the account and ends its sessions', async () => {
      const { token } = await t.signUp();

      const res = await request(t.app)
        .delete('/me')
        .set(...bearer(token));

      expect(res.status).toBe(204);
      expect(
        (
          await request(t.app)
            .get('/me')
            .set(...bearer(token))
        ).status,
      ).toBe(401);
      expect(t.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    });

    it('lets the email be registered again afterwards', async () => {
      const { token } = await t.signUp();
      await request(t.app)
        .delete('/me')
        .set(...bearer(token));

      const res = await register({
        email: 'ada@example.com',
        displayName: 'Ada',
        password: PASSWORD,
      });

      expect(res.status).toBe(201);
    });
  });
});
