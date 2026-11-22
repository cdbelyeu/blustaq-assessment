import request from 'supertest';
import { bearer, createTestApp, type TestApp } from './support/app';

describe('GET /notes/:id', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });

  afterEach(() => t.db.close());

  const createNote = async (token: string, title = 'Plan', body = '# Plan') =>
    (
      await request(t.app)
        .post('/notes')
        .set(...bearer(token))
        .send({ title, body })
    ).body as { id: string };

  const read = (token: string, id: string) =>
    request(t.app)
      .get(`/notes/${id}`)
      .set(...bearer(token));

  it('returns the whole note to its owner', async () => {
    const { id: ownerId, token } = await t.signUp();
    const body = '# Plan\n\n- café \u{1F680}\n';
    const { id } = await createNote(token, 'Sprint planning', body);

    const res = await read(token, id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      ownerId,
      title: 'Sprint planning',
      body,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('points the Location of a new note at this endpoint', async () => {
    const { token } = await t.signUp();

    const created = await request(t.app)
      .post('/notes')
      .set(...bearer(token))
      .send({ title: 'Plan', body: '' });

    const read = await request(t.app)
      .get(created.headers['location'] as string)
      .set(...bearer(token));
    expect(read.status).toBe(200);
    expect((read.body as { id: string }).id).toBe((created.body as { id: string }).id);
  });

  it("answers someone else's note exactly like a note that does not exist", async () => {
    const owner = await t.signUp('ada@example.com');
    const other = await t.signUp('grace@example.com', 'Grace');
    const { id } = await createNote(owner.token);

    const someoneElses = await read(other.token, id);
    const missing = await read(other.token, '00000000-0000-4000-8000-000000000000');

    expect(someoneElses.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(someoneElses.body).toEqual(missing.body);
    expect(someoneElses.body).toEqual({
      error: { code: 'note_not_found', message: 'Note not found' },
    });
  });

  it.each([['not-a-uuid'], ['%00'], ['..%2F..%2Fetc%2Fpasswd'], ['1'.repeat(300)]])(
    'reports a malformed id (%s) as not found',
    async (id) => {
      const { token } = await t.signUp();

      const res = await read(token, id);

      expect(res.status).toBe(404);
    },
  );

  it('does not show a note with no owner to anyone', async () => {
    const { token } = await t.signUp();
    t.db
      .prepare(
        `INSERT INTO notes (id, owner_id, title, created_at, updated_at, body)
         VALUES ('11111111-1111-4111-8111-111111111111', NULL, 'Orphan', 'then', 'then', '')`,
      )
      .run();

    const res = await read(token, '11111111-1111-4111-8111-111111111111');

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const { token } = await t.signUp();
    const { id } = await createNote(token);

    const res = await request(t.app).get(`/notes/${id}`);

    expect(res.status).toBe(401);
  });

  it('stops working when the session expires', async () => {
    const { token } = await t.signUp();
    const { id } = await createNote(token);
    t.clock.advanceMinutes(31);

    const res = await read(token, id);

    expect(res.status).toBe(401);
  });
});
