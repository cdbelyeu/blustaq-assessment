import { test as it, expect } from '@playwright/test';
import { PASSWORD, register, signedInUser, uniqueEmail } from './support/accounts';

it.describe('MVP-10: a team member can create and manage their own account', () => {
  it('registers, reads, renames and deletes their account', async ({ request }) => {
    const { id, email, headers } = await signedInUser(request);

    const me = await request.get('/me', { headers });
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ id, email, displayName: 'Ada' });

    const renamed = await request.patch('/me', { headers, data: { displayName: 'Ada L' } });
    expect(renamed.status()).toBe(200);
    expect(await renamed.json()).toMatchObject({ displayName: 'Ada L' });

    expect((await request.delete('/me', { headers })).status()).toBe(204);
    expect((await request.get('/me', { headers })).status()).toBe(401);
  });

  it('never returns the password or anything derived from it', async ({ request }) => {
    const email = uniqueEmail();

    const res = await request.post('/users', {
      data: { email, displayName: 'Ada', password: PASSWORD },
    });

    const text = await res.text();
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('password');
  });

  it('refuses to register an email twice', async ({ request }) => {
    const { email } = await register(request);

    const res = await request.post('/users', {
      data: { email, displayName: 'Copy', password: PASSWORD },
    });

    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'email_taken' } });
  });

  it('explains what is wrong with an invalid registration', async ({ request }) => {
    const res = await request.post('/users', {
      data: { email: 'nope', displayName: '', password: 'short' },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details.map((d) => d.path).sort()).toEqual([
      'displayName',
      'email',
      'password',
    ]);
  });

  it('keeps account endpoints closed to anonymous callers', async ({ request }) => {
    const res = await request.get('/me');

    expect(res.status()).toBe(401);
    expect(res.headers()['www-authenticate']).toBe('Bearer');
  });
});
