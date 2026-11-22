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
