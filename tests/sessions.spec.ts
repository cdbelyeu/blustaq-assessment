import request from 'supertest';
import { bearer, createTestApp, PASSWORD, type TestApp } from './support/app';

describe('sessions', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp(30);
  });

  afterEach(() => t.db.close());

  const signIn = (body: object) => request(t.app).post('/sessions').send(body);
  const me = (token: string) =>
    request(t.app)
      .get('/me')
      .set(...bearer(token));

  describe('POST /sessions', () => {
    it('signs in and returns a token that expires in 30 minutes', async () => {
      await t.signUp();
      const res = await signIn({ email: 'ada@example.com', password: PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
        expiresAt: '2026-01-01T00:30:00.000Z',
      });
    });

    it('treats the email case-insensitively', async () => {
      await t.signUp('ada@example.com');

      const res = await signIn({ email: 'ADA@Example.com', password: PASSWORD });

      expect(res.status).toBe(201);
    });

    it('gives each sign-in its own token', async () => {
      await t.signUp();

      const a = await signIn({ email: 'ada@example.com', password: PASSWORD });
      const b = await signIn({ email: 'ada@example.com', password: PASSWORD });

      expect((a.body as { token: string }).token).not.toBe((b.body as { token: string }).token);
      expect((await me((a.body as { token: string }).token)).status).toBe(200);
      expect((await me((b.body as { token: string }).token)).status).toBe(200);
    });

    it('stores only a hash of the token', async () => {
      await t.signUp();
      const res = await signIn({ email: 'ada@example.com', password: PASSWORD });

      const rows = t.db.prepare('SELECT token_hash FROM sessions').all() as {
        token_hash: string;
      }[];

      expect(rows.map((r) => r.token_hash)).not.toContain((res.body as { token: string }).token);
    });

    it('answers a wrong password and an unknown email identically', async () => {
      await t.signUp();

      const wrongPassword = await signIn({
        email: 'ada@example.com',
        password: 'not the password',
      });
      const unknownEmail = await signIn({ email: 'nobody@example.com', password: PASSWORD });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body).toEqual({
        error: { code: 'invalid_credentials', message: 'Invalid email or password' },
      });
    });

    it('does not let an account from before passwords sign in', async () => {
      t.db
        .prepare(
          `INSERT INTO users (id, email, display_name, created_at, updated_at)
           VALUES ('legacy', 'old@example.com', 'Old', 'then', 'then')`,
        )
        .run();

      const res = await signIn({ email: 'old@example.com', password: PASSWORD });

      expect(res.status).toBe(401);
    });

    it.each([
      ['a missing password', { email: 'ada@example.com' }],
      ['an empty password', { email: 'ada@example.com', password: '' }],
      ['an overlong password', { email: 'ada@example.com', password: 'x'.repeat(129) }],
      ['an invalid email', { email: 'nope', password: PASSWORD }],
    ])('rejects %s as a bad request', async (_label, body) => {
      const res = await signIn(body);

      expect(res.status).toBe(400);
    });
  });

  describe('expiry', () => {
    it('keeps working up to the expiry time and stops at it', async () => {
      const { token } = await t.signUp();

      t.clock.advanceMinutes(29.99);
      expect((await me(token)).status).toBe(200);

      t.clock.advanceMinutes(0.01);
      const res = await me(token);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'unauthorized', message: 'Authentication required' },
      });
    });

    it('does not extend with use', async () => {
      const { token } = await t.signUp();

      t.clock.advanceMinutes(20);
      await me(token);
      t.clock.advanceMinutes(11);

      expect((await me(token)).status).toBe(401);
    });

    it('lets the user sign in again afterwards', async () => {
      const { token } = await t.signUp();
      t.clock.advanceMinutes(31);
      expect((await me(token)).status).toBe(401);

      const fresh = await t.signIn('ada@example.com');

      expect((await me(fresh)).status).toBe(200);
    });

    it('honours a different configured lifetime', async () => {
      t.db.close();
      t = createTestApp(5);
      const { token } = await t.signUp();

      t.clock.advanceMinutes(6);

      expect((await me(token)).status).toBe(401);
    });
  });

  describe('authentication', () => {
    it.each([
      ['no Authorization header', undefined],
      ['a token that was never issued', 'Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'],
      ['the wrong scheme', 'Basic YWRhOnNlY3JldA=='],
      ['a bare token without a scheme', 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'],
      ['an empty bearer token', 'Bearer '],
    ])('rejects %s and says how to authenticate', async (_label, header) => {
      const req = request(t.app).get('/me');
      const res = await (header === undefined ? req : req.set('Authorization', header));

      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
    });

    it('no longer accepts the old X-User-Id header', async () => {
      const { id } = await t.signUp();

      const res = await request(t.app).get('/me').set('X-User-Id', id);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /sessions/current', () => {
    it('ends the session straight away', async () => {
      const { token } = await t.signUp();

      const res = await request(t.app)
        .delete('/sessions/current')
        .set(...bearer(token));

      expect(res.status).toBe(204);
      expect((await me(token)).status).toBe(401);
    });

    it("leaves the same user's other sessions alone", async () => {
      const { token } = await t.signUp();
      const other = await t.signIn('ada@example.com');

      await request(t.app)
        .delete('/sessions/current')
        .set(...bearer(token));

      expect((await me(other)).status).toBe(200);
    });

    it('requires a live session', async () => {
      const res = await request(t.app).delete('/sessions/current');

      expect(res.status).toBe(401);
    });
  });
});
