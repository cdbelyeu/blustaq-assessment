import request from 'supertest';
import { bearer, createTestApp, type TestApp } from './support/app';

interface Page {
  items: { id: string; title: string; ownerId: string }[];
  nextCursor: string | null;
}

describe('GET /notes', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });

  afterEach(() => t.db.close());

  const createNote = async (token: string, title: string) =>
    (
      await request(t.app)
        .post('/notes')
        .set(...bearer(token))
        .send({ title, body: `body of ${title}` })
    ).body as { id: string };

  const list = (token: string, query = '') =>
    request(t.app)
      .get(`/notes${query}`)
      .set(...bearer(token));

  // Reads every page of a list, returning the pages.
  const walk = async (token: string, limit: number): Promise<Page[]> => {
    const pages: Page[] = [];
    let cursor: string | null = null;
    do {
      const res = await list(token, `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
      const page = res.body as Page;
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor);
    return pages;
  };

  it('is empty for a user with no notes', async () => {
    const { token } = await t.signUp();

    const res = await list(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('lists the newest edit first and leaves the body out', async () => {
    const { id: ownerId, token } = await t.signUp();
    await createNote(token, 'first');
    t.clock.advanceMinutes(1);
    await createNote(token, 'second');
    t.clock.advanceMinutes(1);
    await createNote(token, 'third');

    const res = await list(token);

    const page = res.body as Page;
    expect(page.items.map((n) => n.title)).toEqual(['third', 'second', 'first']);
    expect(page.items[0]).toEqual({
      id: expect.any(String) as string,
      ownerId,
      title: 'third',
      version: 1,
      createdAt: '2026-01-01T00:02:00.000Z',
      updatedAt: '2026-01-01T00:02:00.000Z',
    });
    expect(JSON.stringify(res.body)).not.toContain('body of');
  });

  it('puts a note whose edit time moves forward back at the top', async () => {
    const { token } = await t.signUp();
    const first = await createNote(token, 'first');
    t.clock.advanceMinutes(1);
    await createNote(token, 'second');
    t.db
      .prepare('UPDATE notes SET updated_at = ? WHERE id = ?')
      .run('2026-01-01T01:00:00.000Z', first.id);

    const res = await list(token);

    expect((res.body as Page).items.map((n) => n.title)).toEqual(['first', 'second']);
  });

  it("never includes anyone else's notes", async () => {
    const ada = await t.signUp('ada@example.com');
    const grace = await t.signUp('grace@example.com', 'Grace');
    await createNote(ada.token, 'ada note');
    await createNote(grace.token, 'grace note');

    const adaList = (await list(ada.token)).body as Page;
    const graceList = (await list(grace.token)).body as Page;

    expect(adaList.items.map((n) => n.title)).toEqual(['ada note']);
    expect(graceList.items.map((n) => n.title)).toEqual(['grace note']);
  });

  it("cannot be steered into someone else's notes with their cursor", async () => {
    const ada = await t.signUp('ada@example.com');
    const grace = await t.signUp('grace@example.com', 'Grace');
    for (const n of [1, 2, 3]) await createNote(ada.token, `ada ${n}`);
    for (const n of [1, 2, 3]) await createNote(grace.token, `grace ${n}`);
    const adaPage = (await list(ada.token, '?limit=1')).body as Page;

    const res = await list(grace.token, `?limit=10&cursor=${adaPage.nextCursor}`);

    expect((res.body as Page).items.every((n) => n.title.startsWith('grace'))).toBe(true);
  });

  describe('pagination', () => {
    it('defaults to 20 per page', async () => {
      const { token } = await t.signUp();
      for (let n = 0; n < 25; n++) await createNote(token, `note ${n}`);

      const page = (await list(token)).body as Page;

      expect(page.items).toHaveLength(20);
      expect(page.nextCursor).not.toBeNull();
    });

    it('walks every note exactly once, with a null cursor on the last page', async () => {
      const { token } = await t.signUp();
      const made: string[] = [];
      for (let n = 0; n < 7; n++) {
        made.push((await createNote(token, `note ${n}`)).id);
        t.clock.advanceMinutes(1);
      }

      const pages = await walk(token, 3);

      expect(pages.map((p) => p.items.length)).toEqual([3, 3, 1]);
      expect(pages.at(-1)?.nextCursor).toBeNull();
      expect(pages.flatMap((p) => p.items.map((n) => n.id))).toEqual([...made].reverse());
    });

    it('keeps a stable order when notes share an edit time', async () => {
      const { token } = await t.signUp();
      const made: string[] = [];
      for (let n = 0; n < 7; n++) made.push((await createNote(token, `note ${n}`)).id);

      const seen = (await walk(token, 2)).flatMap((p) => p.items.map((n) => n.id));

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
      expect(seen).toEqual([...made].sort().reverse());
    });

    it('has no next page when the last page is exactly full', async () => {
      const { token } = await t.signUp();
      await createNote(token, 'a');
      await createNote(token, 'b');

      const page = (await list(token, '?limit=2')).body as Page;

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('accepts limits from 1 to 100', async () => {
      const { token } = await t.signUp();

      const statuses = await Promise.all(
        ['1', '100'].map(async (limit) => (await list(token, `?limit=${limit}`)).status),
      );

      expect(statuses).toEqual([200, 200]);
    });

    it.each([['0'], ['101'], ['-1'], ['abc'], ['1.5'], ['']])(
      'rejects the limit "%s"',
      async (limit) => {
        const { token } = await t.signUp();

        const res = await list(token, `?limit=${limit}`);

        expect(res.status).toBe(400);
        expect((res.body as { error: unknown }).error).toMatchObject({
          code: 'validation_failed',
          details: [expect.objectContaining({ path: 'limit' })],
        });
      },
    );

    it.each([['garbage'], ['AAAA'], [Buffer.from('2026|nope').toString('base64url')]])(
      'rejects the cursor "%s"',
      async (cursor) => {
        const { token } = await t.signUp();

        const res = await list(token, `?cursor=${cursor}`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          error: { code: 'invalid_cursor', message: 'Cursor is invalid' },
        });
      },
    );

    it('rejects parameters it does not know', async () => {
      const { token } = await t.signUp();

      const res = await list(token, '?scope=team');

      expect(res.status).toBe(400);
    });
  });

  it('requires authentication', async () => {
    const res = await request(t.app).get('/notes');

    expect(res.status).toBe(401);
  });

  it('stops working when the session expires', async () => {
    const { token } = await t.signUp();
    t.clock.advanceMinutes(31);

    const res = await list(token);

    expect(res.status).toBe(401);
  });
});
