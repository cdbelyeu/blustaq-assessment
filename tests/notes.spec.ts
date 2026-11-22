import request from 'supertest';
import { bearer, createTestApp, type TestApp } from './support/app';

describe('notes', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });

  afterEach(() => t.db.close());

  const create = (token: string, body: object) =>
    request(t.app)
      .post('/notes')
      .set(...bearer(token))
      .send(body);

  describe('POST /notes', () => {
    it('creates a private note owned by the caller', async () => {
      const { id, token } = await t.signUp();

      const res = await create(token, { title: 'Sprint planning', body: '# Goals' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        ownerId: id,
        title: 'Sprint planning',
        body: '# Goals',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('stores Markdown exactly as sent', async () => {
      const { token } = await t.signUp();
      const body = '# Notes\r\n\r\n- café \u{1F680}\n\n```ts\nconst x = 1;\n```\n<b>raw html</b>\n';

      const res = await create(token, { title: 'Markdown', body });

      expect((res.body as { body: string }).body).toBe(body);
    });

    it('trims the title and accepts an empty body', async () => {
      const { token } = await t.signUp();

      const res = await create(token, { title: '  Ideas  ', body: '' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ title: 'Ideas', body: '' });
    });

    it('gives every note its own id', async () => {
      const { token } = await t.signUp();

      const a = await create(token, { title: 'A', body: '' });
      const b = await create(token, { title: 'B', body: '' });

      expect((a.body as { id: string }).id).not.toBe((b.body as { id: string }).id);
    });

    it.each([
      ['a missing title', { body: 'x' }, 'title'],
      ['a blank title', { title: '   ', body: 'x' }, 'title'],
      ['a title over 200 characters', { title: 'x'.repeat(201), body: 'x' }, 'title'],
      ['a missing body', { title: 'x' }, 'body'],
      ['a body that is not text', { title: 'x', body: 42 }, 'body'],
      ['an owner supplied by the client', { title: 'x', body: '', ownerId: 'someone' }, ''],
      ['a version supplied by the client', { title: 'x', body: '', version: 9 }, ''],
    ])('rejects %s with details', async (_label, input, path) => {
      const { token } = await t.signUp();

      const res = await create(token, input);

      expect(res.status).toBe(400);
      expect((res.body as { error: unknown }).error).toMatchObject({
        code: 'validation_failed',
        details: [expect.objectContaining({ path })],
      });
    });

    it('accepts a title of exactly 200 characters', async () => {
      const { token } = await t.signUp();

      const res = await create(token, { title: 'x'.repeat(200), body: '' });

      expect(res.status).toBe(201);
    });

    it('measures the body cap in bytes, not characters', async () => {
      const { token } = await t.signUp();
      const limit = 100 * 1024;

      const exactly = await create(token, { title: 'x', body: 'a'.repeat(limit) });
      const oneOver = await create(token, { title: 'x', body: 'a'.repeat(limit + 1) });
      // 51,201 two-byte characters is only half the character count but over the byte cap.
      const multibyte = await create(token, { title: 'x', body: 'é'.repeat(limit / 2 + 1) });

      expect(exactly.status).toBe(201);
      expect(oneOver.status).toBe(400);
      expect(multibyte.status).toBe(400);
      expect((oneOver.body as { error: unknown }).error).toMatchObject({
        details: [{ path: 'body', message: 'Must be at most 100 KB (UTF-8)' }],
      });
    });

    it('rejects a request far over the cap with 413 before reading it all', async () => {
      const { token } = await t.signUp();

      const res = await create(token, { title: 'x', body: 'a'.repeat(300 * 1024) });

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        error: { code: 'payload_too_large', message: 'Request body is too large' },
      });
    });

    it('requires authentication', async () => {
      const res = await request(t.app).post('/notes').send({ title: 'x', body: '' });

      expect(res.status).toBe(401);
    });

    it('stops working when the session expires', async () => {
      const { token } = await t.signUp();
      t.clock.advanceMinutes(31);

      const res = await create(token, { title: 'x', body: '' });

      expect(res.status).toBe(401);
    });

    it("is removed with the owner's account", async () => {
      const { token } = await t.signUp();
      await create(token, { title: 'A', body: '' });
      await create(token, { title: 'B', body: '' });

      await request(t.app)
        .delete('/me')
        .set(...bearer(token));

      expect(t.db.prepare('SELECT COUNT(*) AS n FROM notes').get()).toEqual({ n: 0 });
    });
  });
});
