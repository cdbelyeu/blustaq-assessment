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
