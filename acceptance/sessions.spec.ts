import { test as it, expect } from '@playwright/test';
import { PASSWORD, register, signIn, uniqueEmail } from './support/accounts';

it.describe('MVP-5: a team member signs in, and their access ends on its own', () => {
  it('signs in and gets a token that lasts about 30 minutes', async ({ request }) => {
    const { email } = await register(request);

    const res = await request.post('/sessions', { data: { email, password: PASSWORD } });

    expect(res.status()).toBe(201);
    const { token, expiresAt } = (await res.json()) as { token: string; expiresAt: string };
    expect(token.length).toBeGreaterThanOrEqual(43);
    const minutes = (new Date(expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('uses the token to act as the signed-in user', async ({ request }) => {
    const { id, email } = await register(request);
    const headers = await signIn(request, email);

    const me = await request.get('/me', { headers });

    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ id });
  });

  it('ends the session immediately on sign out', async ({ request }) => {
    const { email } = await register(request);
    const headers = await signIn(request, email);
    const otherDevice = await signIn(request, email);

    expect((await request.delete('/sessions/current', { headers })).status()).toBe(204);

    expect((await request.get('/me', { headers })).status()).toBe(401);
    expect((await request.get('/me', { headers: otherDevice })).status()).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async ({ request }) => {
    const { email } = await register(request);

    const wrongPassword = await request.post('/sessions', {
      data: { email, password: 'not the password' },
    });
    const unknownEmail = await request.post('/sessions', {
      data: { email: uniqueEmail(), password: PASSWORD },
    });

    expect(wrongPassword.status()).toBe(401);
    expect(unknownEmail.status()).toBe(401);
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
  });

  it('rejects requests that only name a user', async ({ request }) => {
    const { id } = await register(request);

    const res = await request.get('/me', { headers: { 'X-User-Id': id } });

    expect(res.status()).toBe(401);
  });

  it('rejects a made-up token', async ({ request }) => {
    const res = await request.get('/me', { headers: { Authorization: 'Bearer not-a-real-token' } });

    expect(res.status()).toBe(401);
  });
});
