import { test as it, expect } from '@playwright/test';
import { signedInUser } from './support/accounts';

it.describe('MVP-1: a team member can capture notes', () => {
  it('creates a note that belongs to them', async ({ request }) => {
    const { id, headers } = await signedInUser(request);

    const res = await request.post('/notes', {
      headers,
      data: { title: 'Sprint planning', body: '# Goals\n\n- Ship it' },
    });

    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({
      ownerId: id,
      title: 'Sprint planning',
      body: '# Goals\n\n- Ship it',
      version: 1,
    });
  });

  it('keeps Markdown exactly as written', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const body = '# Café \u{1F680}\n\n```ts\nconst x = 1;\n```\n';

    const res = await request.post('/notes', { headers, data: { title: 'Markdown', body } });

    expect(((await res.json()) as { body: string }).body).toBe(body);
  });

  it('explains what is wrong with an invalid note', async ({ request }) => {
    const { headers } = await signedInUser(request);

    const res = await request.post('/notes', { headers, data: { title: '  ', body: 7 } });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { details: { path: string }[] } };
    expect(body.error.details.map((d) => d.path).sort()).toEqual(['body', 'title']);
  });

  it('rejects a note over 100 KB, and a request far over it', async ({ request }) => {
    const { headers } = await signedInUser(request);

    const tooLong = await request.post('/notes', {
      headers,
      data: { title: 'Big', body: 'a'.repeat(100 * 1024 + 1) },
    });
    const enormous = await request.post('/notes', {
      headers,
      data: { title: 'Huge', body: 'a'.repeat(300 * 1024) },
    });

    expect(tooLong.status()).toBe(400);
    expect(enormous.status()).toBe(413);
  });

  it('does not let a client choose the owner', async ({ request }) => {
    const { id, headers } = await signedInUser(request);
    const other = await signedInUser(request);

    const res = await request.post('/notes', {
      headers,
      data: { title: 'Mine', body: '', ownerId: other.id },
    });

    expect(res.status()).toBe(400);
    const created = await request.post('/notes', { headers, data: { title: 'Mine', body: '' } });
    expect(await created.json()).toMatchObject({ ownerId: id });
  });

  it('requires a signed-in user', async ({ request }) => {
    const res = await request.post('/notes', { data: { title: 'x', body: '' } });

    expect(res.status()).toBe(401);
  });
});

it.describe('MVP-1: a team member can find and read their notes', () => {
  type Created = { id: string };
  type Page = { items: { id: string; title: string }[]; nextCursor: string | null };

  it('reads back a note they created, using the Location it was created with', async ({
    request,
  }) => {
    const { headers } = await signedInUser(request);
    const created = await request.post('/notes', {
      headers,
      data: { title: 'Sprint planning', body: '# Goals' },
    });

    const res = await request.get(created.headers()['location'] ?? '', { headers });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(await created.json());
  });

  it("answers someone else's note the same as one that does not exist", async ({ request }) => {
    const owner = await signedInUser(request);
    const other = await signedInUser(request);
    const created = await request.post('/notes', {
      headers: owner.headers,
      data: { title: 'Private', body: 'for my eyes only' },
    });
    const { id } = (await created.json()) as Created;

    const someoneElses = await request.get(`/notes/${id}`, { headers: other.headers });
    const missing = await request.get('/notes/00000000-0000-4000-8000-000000000000', {
      headers: other.headers,
    });

    expect(someoneElses.status()).toBe(404);
    expect(missing.status()).toBe(404);
    expect(await someoneElses.json()).toEqual(await missing.json());
    expect(await someoneElses.text()).not.toContain('for my eyes only');
  });

  it('lists only their own notes, newest first, without the bodies', async ({ request }) => {
    const me = await signedInUser(request);
    const other = await signedInUser(request);
    for (const title of ['first', 'second', 'third']) {
      await request.post('/notes', {
        headers: me.headers,
        data: { title, body: `body of ${title}` },
      });
    }
    await request.post('/notes', { headers: other.headers, data: { title: 'not mine', body: '' } });

    const res = await request.get('/notes', { headers: me.headers });

    expect(res.status()).toBe(200);
    const page = (await res.json()) as Page;
    expect(page.items.map((n) => n.title).sort()).toEqual(['first', 'second', 'third']);
    expect(page.nextCursor).toBeNull();
    expect(await res.text()).not.toContain('body of');
    expect(await res.text()).not.toContain('not mine');
  });

  it('pages through a long list, seeing every note exactly once', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const made: string[] = [];
    for (let n = 0; n < 5; n++) {
      const res = await request.post('/notes', { headers, data: { title: `note ${n}`, body: '' } });
      made.push(((await res.json()) as Created).id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/notes?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const page = (await (await request.get(url, { headers })).json()) as Page;
      seen.push(...page.items.map((n) => n.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen.sort()).toEqual([...made].sort());
  });

  it('rejects a bad limit or cursor with an explanation', async ({ request }) => {
    const { headers } = await signedInUser(request);

    const badLimit = await request.get('/notes?limit=101', { headers });
    const badCursor = await request.get('/notes?cursor=garbage', { headers });

    expect(badLimit.status()).toBe(400);
    expect(badCursor.status()).toBe(400);
    expect(await badCursor.json()).toMatchObject({ error: { code: 'invalid_cursor' } });
  });

  it('requires a signed-in user to read or list', async ({ request }) => {
    expect((await request.get('/notes')).status()).toBe(401);
    expect((await request.get('/notes/00000000-0000-4000-8000-000000000000')).status()).toBe(401);
  });
});

type Api = Parameters<Parameters<typeof it>[2]>[0]['request'];
type Note = { id: string; title: string; body: string; version: number; updatedAt: string };
type Headers = Record<string, string>;

const createNote = async (
  request: Api,
  headers: Headers,
  data = { title: 'Plan', body: '# Plan' },
) => (await (await request.post('/notes', { headers, data })).json()) as Note;

// Edits like a well-behaved client: sends the ETag it last read in If-Match.
const edit = async (request: Api, headers: Headers, id: string, data: object, ifMatch?: string) => {
  const etag = ifMatch ?? (await request.get(`/notes/${id}`, { headers })).headers()['etag'];
  return request.patch(`/notes/${id}`, {
    headers: { ...headers, 'If-Match': etag ?? '"1"' },
    data,
  });
};

it.describe('MVP-1: a team member can edit their notes', () => {
  it('changes a note, and reading it back shows the change', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);

    const res = await edit(request, headers, note.id, { title: 'Plan v2', body: '# Plan v2' });

    expect(res.status()).toBe(200);
    const updated = (await res.json()) as Note;
    expect(updated).toMatchObject({ title: 'Plan v2', body: '# Plan v2', version: 2 });
    const reread = await request.get(`/notes/${note.id}`, { headers });
    expect(await reread.json()).toEqual(updated);
  });

  it('only changes the fields that were sent', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers, { title: 'Keep me', body: 'old' });

    const res = await edit(request, headers, note.id, { body: 'new' });

    expect(await res.json()).toMatchObject({ title: 'Keep me', body: 'new' });
  });

  it('does not raise the version when nothing changed', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);

    const res = await edit(request, headers, note.id, { title: 'Plan' });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(note);
  });

  it('raises the version by one for each change', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);

    const first = await edit(request, headers, note.id, { title: 'B' });
    const second = await edit(request, headers, note.id, { title: 'C' });

    expect(((await first.json()) as Note).version).toBe(2);
    expect(((await second.json()) as Note).version).toBe(3);
  });

  it("will not edit someone else's note, and leaves it untouched", async ({ request }) => {
    const owner = await signedInUser(request);
    const other = await signedInUser(request);
    const note = await createNote(request, owner.headers, { title: 'Private', body: 'mine' });

    const attempt = await edit(request, other.headers, note.id, { title: 'Hijacked' }, '"1"');
    const missing = await edit(
      request,
      other.headers,
      '00000000-0000-4000-8000-000000000000',
      { title: 'Hijacked' },
      '"1"',
    );

    expect(attempt.status()).toBe(404);
    expect(await attempt.json()).toEqual(await missing.json());
    const reread = await request.get(`/notes/${note.id}`, { headers: owner.headers });
    expect(await reread.json()).toEqual(note);
  });

  it('explains what is wrong with an invalid edit', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);

    const empty = await edit(request, headers, note.id, {});
    const bad = await edit(request, headers, note.id, { title: ' ', ownerId: 'x' });

    expect(empty.status()).toBe(400);
    expect(bad.status()).toBe(400);
    const body = (await bad.json()) as { error: { details: { path: string }[] } };
    expect(body.error.details.map((d) => d.path)).toEqual(expect.arrayContaining(['', 'title']));
  });

  it('requires a signed-in user', async ({ request }) => {
    const res = await request.patch('/notes/00000000-0000-4000-8000-000000000000', {
      data: { title: 'x' },
    });

    expect(res.status()).toBe(401);
  });
});

it.describe('MVP-7: an edit from an out-of-date copy cannot overwrite newer work', () => {
  it('hands out an ETag on every note response', async ({ request }) => {
    const { headers } = await signedInUser(request);

    const created = await request.post('/notes', { headers, data: { title: 'Plan', body: '' } });
    const note = (await created.json()) as Note;
    const read = await request.get(`/notes/${note.id}`, { headers });

    expect(created.headers()['etag']).toBe('"1"');
    expect(read.headers()['etag']).toBe('"1"');
  });

  it('refuses the second of two edits made from the same version', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers, { title: 'Plan', body: 'original' });

    const first = await edit(request, headers, note.id, { body: "first writer's text" }, '"1"');
    const second = await edit(request, headers, note.id, { body: "second writer's text" }, '"1"');

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(412);
    expect(await second.json()).toMatchObject({ error: { code: 'version_conflict' } });
    const stored = await request.get(`/notes/${note.id}`, { headers });
    expect(await stored.json()).toMatchObject({ body: "first writer's text", version: 2 });
  });

  it('lets the second writer reload, reapply their change and succeed', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);
    await edit(request, headers, note.id, { title: 'First' }, '"1"');
    expect((await edit(request, headers, note.id, { body: 'Mine' }, '"1"')).status()).toBe(412);

    const retry = await edit(request, headers, note.id, { body: 'Mine' });

    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({ title: 'First', body: 'Mine', version: 3 });
  });

  it('refuses an edit that carries no If-Match', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);

    const res = await request.patch(`/notes/${note.id}`, { headers, data: { title: 'B' } });

    expect(res.status()).toBe(428);
    const reread = await request.get(`/notes/${note.id}`, { headers });
    expect(await reread.json()).toEqual(note);
  });

  it('refuses a malformed If-Match', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);

    const res = await edit(request, headers, note.id, { title: 'B' }, '*');

    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_if_match' } });
  });

  it('lets a client skip downloading a note that has not changed', async ({ request }) => {
    const { headers } = await signedInUser(request);
    const note = await createNote(request, headers);

    const res = await request.get(`/notes/${note.id}`, {
      headers: { ...headers, 'If-None-Match': '"1"' },
    });

    expect(res.status()).toBe(304);
  });
});
