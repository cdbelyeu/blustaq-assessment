import { randomUUID } from 'node:crypto';
import { test as it, expect, type APIRequestContext } from '@playwright/test';

const uniqueEmail = () => `user-${randomUUID()}@example.com`;

async function register(request: APIRequestContext, displayName = 'Ada') {
  const res = await request.post('/users', { data: { email: uniqueEmail(), displayName } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; email: string };
}

it.describe('MVP-10: a team member can create and manage their own account', () => {
  it('registers, reads, renames and deletes their account', async ({ request }) => {
    const { id, email } = await register(request);
    const headers = { 'X-User-Id': id };

    const me = await request.get('/me', { headers });
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ id, email, displayName: 'Ada' });

    const renamed = await request.patch('/me', { headers, data: { displayName: 'Ada L' } });
    expect(renamed.status()).toBe(200);
    expect(await renamed.json()).toMatchObject({ displayName: 'Ada L' });

    expect((await request.delete('/me', { headers })).status()).toBe(204);
    expect((await request.get('/me', { headers })).status()).toBe(401);
  });

  it('refuses to register an email twice', async ({ request }) => {
    const { email } = await register(request);

    const res = await request.post('/users', { data: { email, displayName: 'Copy' } });

    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'email_taken' } });
  });

  it('explains what is wrong with an invalid registration', async ({ request }) => {
    const res = await request.post('/users', { data: { email: 'nope', displayName: '' } });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details.map((d) => d.path).sort()).toEqual(['displayName', 'email']);
  });

  it('keeps account endpoints closed to anonymous callers', async ({ request }) => {
    expect((await request.get('/me')).status()).toBe(401);
  });
});
