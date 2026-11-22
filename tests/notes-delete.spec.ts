import request from 'supertest';
import { bearer, createTestApp, type TestApp } from './support/app';

interface NoteBody {
  id: string;
  title: string;
  version: number;
}

describe('DELETE /notes/:id', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });

  afterEach(() => t.db.close());

  const createNote = async (token: string, title = 'Plan') =>
    (
      await request(t.app)
        .post('/notes')
        .set(...bearer(token))
        .send({ title, body: '# Plan' })
    ).body as NoteBody;

  // Sends exactly the If-Match given, or none.
  const remove = (token: string, id: string, ifMatch?: string) => {
    const req = request(t.app)
      .delete(`/notes/${id}`)
      .set(...bearer(token));
    return ifMatch === undefined ? req : req.set('If-Match', ifMatch);
  };

  const status = async (token: string, id: string) =>
    (
      await request(t.app)
        .get(`/notes/${id}`)
        .set(...bearer(token))
    ).status;

  it('deletes the note for good', async () => {
    const { token } = await t.signUp();
    const note = await createNote(token);

    const res = await remove(token, note.id, '"1"');

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(await status(token, note.id)).toBe(404);
  });

  it('removes the note from the list and leaves the others', async () => {
    const { token } = await t.signUp();
    const keep = await createNote(token, 'keep');
    const gone = await createNote(token, 'gone');

    await remove(token, gone.id, '"1"');

    const list = await request(t.app)
      .get('/notes')
      .set(...bearer(token));
    expect((list.body as { items: NoteBody[] }).items.map((n) => n.id)).toEqual([keep.id]);
  });

  it('is gone for good: a second delete is a 404', async () => {
    const { token } = await t.signUp();
    const note = await createNote(token);
    await remove(token, note.id, '"1"');

    const again = await remove(token, note.id, '"1"');

    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: { code: 'note_not_found', message: 'Note not found' } });
  });

  it('deletes a note that has been edited, using its current version', async () => {
    const { token } = await t.signUp();
    const note = await createNote(token);
    t.clock.advanceMinutes(1);
    const edited = await request(t.app)
      .patch(`/notes/${note.id}`)
      .set(...bearer(token))
      .set('If-Match', '"1"')
      .send({ title: 'Edited' });

    const res = await remove(token, note.id, edited.headers['etag']);

    expect(res.status).toBe(204);
  });

  describe('keeping up to date', () => {
    it('refuses a delete made from an out-of-date version, and keeps the note', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);
      await request(t.app)
        .patch(`/notes/${note.id}`)
        .set(...bearer(token))
        .set('If-Match', '"1"')
        .send({ body: "someone's newer work" });

      const res = await remove(token, note.id, '"1"');

      expect(res.status).toBe(412);
      expect(res.body).toEqual({
        error: {
          code: 'version_conflict',
          message: 'The note has changed since you loaded it. Fetch it again.',
        },
      });
      const kept = await request(t.app)
        .get(`/notes/${note.id}`)
        .set(...bearer(token));
      expect(kept.body).toMatchObject({ body: "someone's newer work", version: 2 });
    });

    it('lets the client fetch the note again and then delete it', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);
      await request(t.app)
        .patch(`/notes/${note.id}`)
        .set(...bearer(token))
        .set('If-Match', '"1"')
        .send({ title: 'Changed' });
      expect((await remove(token, note.id, '"1"')).status).toBe(412);

      const fresh = await request(t.app)
        .get(`/notes/${note.id}`)
        .set(...bearer(token));
      const retry = await remove(token, note.id, fresh.headers['etag']);

      expect(retry.status).toBe(204);
    });

    it('refuses a version from the future', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await remove(token, note.id, '"9"');

      expect(res.status).toBe(412);
      expect(await status(token, note.id)).toBe(200);
    });

    it('requires If-Match', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await remove(token, note.id);

      expect(res.status).toBe(428);
      expect(res.body).toEqual({
        error: { code: 'precondition_required', message: "Send the note's ETag in If-Match" },
      });
      expect(await status(token, note.id)).toBe(200);
    });

    it.each([
      ['an unquoted version', '1'],
      ['a weak ETag', 'W/"1"'],
      ['a list of ETags', '"1", "2"'],
      ['any version (*)', '*'],
      ['text', '"abc"'],
    ])('rejects %s in If-Match and keeps the note', async (_label, ifMatch) => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await remove(token, note.id, ifMatch);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: 'invalid_if_match', message: 'If-Match must be one ETag, such as "3"' },
      });
      expect(await status(token, note.id)).toBe(200);
    });
  });

  describe('access', () => {
    it("answers someone else's note exactly like a note that does not exist", async () => {
      const owner = await t.signUp('ada@example.com');
      const other = await t.signUp('grace@example.com', 'Grace');
      const note = await createNote(owner.token);

      const someoneElses = await remove(other.token, note.id, '"1"');
      const missing = await remove(other.token, '00000000-0000-4000-8000-000000000000', '"1"');

      expect(someoneElses.status).toBe(404);
      expect(someoneElses.body).toEqual(missing.body);
    });

    it("leaves someone else's note in place", async () => {
      const owner = await t.signUp('ada@example.com');
      const other = await t.signUp('grace@example.com', 'Grace');
      const note = await createNote(owner.token);

      await remove(other.token, note.id, '"1"');

      expect(await status(owner.token, note.id)).toBe(200);
    });

    it('tells a stranger nothing, even with a wrong version or no If-Match', async () => {
      const owner = await t.signUp('ada@example.com');
      const other = await t.signUp('grace@example.com', 'Grace');
      const note = await createNote(owner.token);

      const wrongVersion = await remove(other.token, note.id, '"9"');
      const noHeader = await remove(other.token, note.id);

      expect(wrongVersion.status).toBe(404);
      expect(noHeader.status).toBe(404);
    });

    it.each([['not-a-uuid'], ['%00'], ['1'.repeat(300)]])(
      'reports a malformed id (%s) as not found',
      async (id) => {
        const { token } = await t.signUp();

        const res = await remove(token, id, '"1"');

        expect(res.status).toBe(404);
      },
    );

    it('does not let anyone delete a note with no owner', async () => {
      const { token } = await t.signUp();
      t.db
        .prepare(
          `INSERT INTO notes (id, owner_id, title, created_at, updated_at, body)
           VALUES ('11111111-1111-4111-8111-111111111111', NULL, 'Orphan', 'then', 'then', '')`,
        )
        .run();

      const res = await remove(token, '11111111-1111-4111-8111-111111111111', '"1"');

      expect(res.status).toBe(404);
      expect(t.db.prepare('SELECT COUNT(*) AS n FROM notes').get()).toEqual({ n: 1 });
    });

    it('requires authentication', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await request(t.app).delete(`/notes/${note.id}`).set('If-Match', '"1"');

      expect(res.status).toBe(401);
      expect(await status(token, note.id)).toBe(200);
    });

    it('stops working when the session expires', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(31);

      const res = await remove(token, note.id, '"1"');

      expect(res.status).toBe(401);
    });
  });
});
