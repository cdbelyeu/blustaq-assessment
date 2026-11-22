import request from 'supertest';
import { bearer, createTestApp, type TestApp } from './support/app';

interface NoteBody {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

describe('PATCH /notes/:id', () => {
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
    ).body as NoteBody;

  // A well-behaved client: it reads the note, then sends the version it saw in If-Match.
  const patch = async (token: string, id: string, input: object) => {
    const current = await request(t.app)
      .get(`/notes/${id}`)
      .set(...bearer(token));
    const version = current.status === 200 ? (current.body as NoteBody).version : 1;
    return patchWith(token, id, input, `"${version}"`);
  };

  // Sends exactly the If-Match given, or none.
  const patchWith = (token: string, id: string, input: object, ifMatch?: string) => {
    const req = request(t.app)
      .patch(`/notes/${id}`)
      .set(...bearer(token));
    return (ifMatch === undefined ? req : req.set('If-Match', ifMatch)).send(input);
  };

  const read = async (token: string, id: string) =>
    (
      await request(t.app)
        .get(`/notes/${id}`)
        .set(...bearer(token))
    ).body as NoteBody;

  describe('editing', () => {
    it('changes the title and keeps everything else', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token, 'Old', 'keep me');
      t.clock.advanceMinutes(5);

      const res = await patch(token, note.id, { title: 'New' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ...note,
        title: 'New',
        version: 2,
        updatedAt: '2026-01-01T00:05:00.000Z',
      });
    });

    it('changes the body and keeps the title', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token, 'Keep', 'old');
      t.clock.advanceMinutes(5);

      const res = await patch(token, note.id, { body: 'new' });

      expect(res.body).toMatchObject({ title: 'Keep', body: 'new', version: 2 });
    });

    it('changes both at once as a single new version', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);

      const res = await patch(token, note.id, { title: 'T2', body: 'B2' });

      expect(res.body).toMatchObject({ title: 'T2', body: 'B2', version: 2 });
    });

    it('lets the body be cleared', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);

      const res = await patch(token, note.id, { body: '' });

      expect(res.status).toBe(200);
      expect((res.body as NoteBody).body).toBe('');
    });

    it('keeps Markdown exactly as sent', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);
      const body = '# Notes\r\n\r\n- café \u{1F680}\n\n```ts\nconst x = 1;\n```\n';

      const res = await patch(token, note.id, { body });

      expect((res.body as NoteBody).body).toBe(body);
    });

    it('trims the title', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);

      const res = await patch(token, note.id, { title: '  Spaced  ' });

      expect((res.body as NoteBody).title).toBe('Spaced');
    });

    it('stores the edit, so reading it back gives the same note', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(3);

      const res = await patch(token, note.id, { title: 'Changed', body: 'Changed body' });

      expect(await read(token, note.id)).toEqual(res.body);
    });

    it('raises the version by one on every real change', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      const versions: number[] = [];
      for (const title of ['B', 'C', 'D']) {
        t.clock.advanceMinutes(1);
        versions.push(((await patch(token, note.id, { title })).body as NoteBody).version);
      }

      expect(versions).toEqual([2, 3, 4]);
    });

    it('moves the edited note to the top of the list', async () => {
      const { token } = await t.signUp();
      const first = await createNote(token, 'first');
      t.clock.advanceMinutes(1);
      await createNote(token, 'second');
      t.clock.advanceMinutes(1);

      await patch(token, first.id, { title: 'first, edited' });

      const list = await request(t.app)
        .get('/notes')
        .set(...bearer(token));
      expect((list.body as { items: { title: string }[] }).items.map((n) => n.title)).toEqual([
        'first, edited',
        'second',
      ]);
    });
  });

  describe('saving without a change', () => {
    it.each([
      ['the same title', { title: 'Plan' }],
      ['the same body', { body: '# Plan' }],
      ['both unchanged', { title: 'Plan', body: '# Plan' }],
      ['a title that only differs by surrounding spaces', { title: '  Plan  ' }],
    ])('leaves the note as it was for %s', async (_label, input) => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(10);

      const res = await patch(token, note.id, input);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(note);
      expect(await read(token, note.id)).toEqual(note);
    });

    it("does not move the note in the list or make others' copies look stale", async () => {
      const { token } = await t.signUp();
      const first = await createNote(token, 'first');
      t.clock.advanceMinutes(1);
      await createNote(token, 'second');
      t.clock.advanceMinutes(1);

      await patch(token, first.id, { title: 'first' });

      const list = await request(t.app)
        .get('/notes')
        .set(...bearer(token));
      expect((list.body as { items: { title: string }[] }).items.map((n) => n.title)).toEqual([
        'second',
        'first',
      ]);
    });

    it('counts a change in one field even when the other is unchanged', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token, 'Same', 'old');
      t.clock.advanceMinutes(1);

      const res = await patch(token, note.id, { title: 'Same', body: 'new' });

      expect((res.body as NoteBody).version).toBe(2);
    });
  });

  describe('validation', () => {
    it('requires at least one field', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patch(token, note.id, {});

      expect(res.status).toBe(400);
      expect((res.body as { error: unknown }).error).toMatchObject({
        code: 'validation_failed',
        details: [{ path: '', message: 'Provide at least one of: title, body' }],
      });
    });

    it.each([
      ['a blank title', { title: '   ' }, 'title'],
      ['a title over 200 characters', { title: 'x'.repeat(201) }, 'title'],
      ['a null title', { title: null }, 'title'],
      ['a body that is not text', { body: 42 }, 'body'],
      ['a null body', { body: null }, 'body'],
      ['a body over 100 KB', { body: 'a'.repeat(100 * 1024 + 1) }, 'body'],
      ['an owner', { ownerId: 'someone' }, ''],
      ['a version', { version: 9 }, ''],
      ['an id', { id: 'other' }, ''],
      ['a creation time', { createdAt: '2020-01-01T00:00:00.000Z' }, ''],
    ])('rejects %s and changes nothing', async (_label, input, path) => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patch(token, note.id, input);

      expect(res.status).toBe(400);
      const { details } = (res.body as { error: { details: { path: string }[] } }).error;
      expect(details.map((d) => d.path)).toContain(path);
      expect(await read(token, note.id)).toEqual(note);
    });

    it('accepts a title of exactly 200 characters and a body of exactly 100 KB', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);

      const res = await patch(token, note.id, {
        title: 'x'.repeat(200),
        body: 'a'.repeat(100 * 1024),
      });

      expect(res.status).toBe(200);
    });

    it('rejects a request far over the size limit with 413', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patch(token, note.id, { body: 'a'.repeat(300 * 1024) });

      expect(res.status).toBe(413);
    });
  });

  describe('access', () => {
    it("answers someone else's note exactly like a note that does not exist", async () => {
      const owner = await t.signUp('ada@example.com');
      const other = await t.signUp('grace@example.com', 'Grace');
      const note = await createNote(owner.token);

      const someoneElses = await patch(other.token, note.id, { title: 'Hijacked' });
      const missing = await patch(other.token, '00000000-0000-4000-8000-000000000000', {
        title: 'Hijacked',
      });

      expect(someoneElses.status).toBe(404);
      expect(someoneElses.body).toEqual(missing.body);
      expect(someoneElses.body).toEqual({
        error: { code: 'note_not_found', message: 'Note not found' },
      });
    });

    it("leaves someone else's note unchanged", async () => {
      const owner = await t.signUp('ada@example.com');
      const other = await t.signUp('grace@example.com', 'Grace');
      const note = await createNote(owner.token);
      t.clock.advanceMinutes(5);

      await patch(other.token, note.id, { title: 'Hijacked', body: 'Hijacked' });

      expect(await read(owner.token, note.id)).toEqual(note);
    });

    it('does not reveal a note exists, even when the request is invalid', async () => {
      const owner = await t.signUp('ada@example.com');
      const other = await t.signUp('grace@example.com', 'Grace');
      const note = await createNote(owner.token);

      const res = await patch(other.token, note.id, { title: '' });

      expect(res.status).toBe(404);
    });

    it.each([['not-a-uuid'], ['%00'], ['1'.repeat(300)]])(
      'reports a malformed id (%s) as not found',
      async (id) => {
        const { token } = await t.signUp();

        const res = await patch(token, id, { title: 'x' });

        expect(res.status).toBe(404);
      },
    );

    it('does not let anyone edit a note with no owner', async () => {
      const { token } = await t.signUp();
      t.db
        .prepare(
          `INSERT INTO notes (id, owner_id, title, created_at, updated_at, body)
           VALUES ('11111111-1111-4111-8111-111111111111', NULL, 'Orphan', 'then', 'then', '')`,
        )
        .run();

      const res = await patch(token, '11111111-1111-4111-8111-111111111111', { title: 'Mine now' });

      expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await request(t.app).patch(`/notes/${note.id}`).send({ title: 'x' });

      expect(res.status).toBe(401);
    });

    it('stops working when the session expires', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(31);

      const res = await patch(token, note.id, { title: 'x' });

      expect(res.status).toBe(401);
    });
  });

  describe('concurrent edits', () => {
    it('hands back the new ETag with every edit, so the next edit can follow on', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);

      const first = await patchWith(token, note.id, { title: 'B' }, '"1"');
      const second = await patchWith(token, note.id, { title: 'C' }, first.headers['etag']);

      expect(first.headers['etag']).toBe('"2"');
      expect(second.status).toBe(200);
      expect(second.headers['etag']).toBe('"3"');
    });

    it('refuses an edit made from an out-of-date version, and overwrites nothing', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token, 'Plan', 'original');
      t.clock.advanceMinutes(1);
      // Two people open the note at version 1. The first saves.
      await patchWith(token, note.id, { body: "first writer's text" }, '"1"');
      t.clock.advanceMinutes(1);

      const second = await patchWith(token, note.id, { body: "second writer's text" }, '"1"');

      expect(second.status).toBe(412);
      expect(second.body).toEqual({
        error: {
          code: 'version_conflict',
          message: 'The note has changed since you loaded it. Fetch it again.',
        },
      });
      expect(await read(token, note.id)).toMatchObject({
        body: "first writer's text",
        version: 2,
      });
    });

    it('lets the second writer reload, reapply and succeed', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);
      await patchWith(token, note.id, { title: 'First' }, '"1"');
      const refused = await patchWith(token, note.id, { body: 'Mine' }, '"1"');
      expect(refused.status).toBe(412);

      const fresh = await request(t.app)
        .get(`/notes/${note.id}`)
        .set(...bearer(token));
      t.clock.advanceMinutes(1);
      const retry = await patchWith(token, note.id, { body: 'Mine' }, fresh.headers['etag']);

      expect(retry.status).toBe(200);
      expect(retry.body).toMatchObject({ title: 'First', body: 'Mine', version: 3 });
    });

    it('refuses a version from the future', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patchWith(token, note.id, { title: 'B' }, '"7"');

      expect(res.status).toBe(412);
    });

    it('refuses a stale version even when the edit would change nothing', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token, 'Plan', 'text');
      t.clock.advanceMinutes(1);
      await patchWith(token, note.id, { title: 'Newer' }, '"1"');

      const res = await patchWith(token, note.id, { title: 'Newer' }, '"1"');

      expect(res.status).toBe(412);
    });

    it('accepts a no-change edit at the current version', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patchWith(token, note.id, { title: note.title }, '"1"');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(note);
      expect(res.headers['etag']).toBe('"1"');
    });

    it('requires If-Match', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patchWith(token, note.id, { title: 'B' });

      expect(res.status).toBe(428);
      expect(res.body).toEqual({
        error: { code: 'precondition_required', message: "Send the note's ETag in If-Match" },
      });
      expect(await read(token, note.id)).toEqual(note);
    });

    it.each([
      ['an unquoted version', '1'],
      ['a weak ETag', 'W/"1"'],
      ['a list of ETags', '"1", "2"'],
      ['any version (*)', '*'],
      ['text', '"abc"'],
      ['an empty value', ''],
      ['a negative version', '"-1"'],
    ])('rejects %s in If-Match without changing the note', async (_label, ifMatch) => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patchWith(token, note.id, { title: 'B' }, ifMatch);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: 'invalid_if_match', message: 'If-Match must be one ETag, such as "3"' },
      });
      expect(await read(token, note.id)).toEqual(note);
    });

    it('checks the request body before the version, so an invalid edit is a 400', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await patchWith(token, note.id, { title: '' }, '"9"');

      expect(res.status).toBe(400);
    });

    it('tells a stranger nothing, even with a wrong version or no If-Match', async () => {
      const owner = await t.signUp('ada@example.com');
      const other = await t.signUp('grace@example.com', 'Grace');
      const note = await createNote(owner.token);

      const wrongVersion = await patchWith(other.token, note.id, { title: 'x' }, '"9"');
      const noHeader = await patchWith(other.token, note.id, { title: 'x' });

      expect(wrongVersion.status).toBe(404);
      expect(noHeader.status).toBe(404);
    });
  });

  describe('ETag', () => {
    it('is the version, as a strong ETag, on a new note and on a read', async () => {
      const { token } = await t.signUp();
      const created = await request(t.app)
        .post('/notes')
        .set(...bearer(token))
        .send({ title: 'Plan', body: '' });
      const id = (created.body as NoteBody).id;

      const fetched = await request(t.app)
        .get(`/notes/${id}`)
        .set(...bearer(token));

      expect(created.headers['etag']).toBe('"1"');
      expect(fetched.headers['etag']).toBe('"1"');
    });

    it('moves on after an edit, and stays put after a no-change edit', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);

      const edited = await patchWith(token, note.id, { title: 'B' }, '"1"');
      const unchanged = await patchWith(token, note.id, { title: 'B' }, '"2"');

      expect(edited.headers['etag']).toBe('"2"');
      expect(unchanged.headers['etag']).toBe('"2"');
    });

    it('lets a client skip re-downloading a note that has not changed', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);

      const res = await request(t.app)
        .get(`/notes/${note.id}`)
        .set(...bearer(token))
        .set('If-None-Match', '"1"');

      expect(res.status).toBe(304);
    });

    it('sends the note again once it has changed', async () => {
      const { token } = await t.signUp();
      const note = await createNote(token);
      t.clock.advanceMinutes(1);
      await patchWith(token, note.id, { title: 'B' }, '"1"');

      const res = await request(t.app)
        .get(`/notes/${note.id}`)
        .set(...bearer(token))
        .set('If-None-Match', '"1"');

      expect(res.status).toBe(200);
      expect(res.headers['etag']).toBe('"2"');
    });
  });
});
