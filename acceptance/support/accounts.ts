import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';

export const PASSWORD = 'correct horse battery';

export const uniqueEmail = () => `user-${randomUUID()}@example.com`;

export async function register(request: APIRequestContext, displayName = 'Ada') {
  const email = uniqueEmail();
  const res = await request.post('/users', { data: { email, displayName, password: PASSWORD } });
  expect(res.status()).toBe(201);
  return { ...((await res.json()) as { id: string }), email };
}

export async function signIn(request: APIRequestContext, email: string, password = PASSWORD) {
  const res = await request.post('/sessions', { data: { email, password } });
  expect(res.status()).toBe(201);
  const { token } = (await res.json()) as { token: string };
  return { Authorization: `Bearer ${token}` };
}

// A registered and signed-in user, ready to make authenticated requests.
export async function signedInUser(request: APIRequestContext) {
  const user = await register(request);
  return { ...user, headers: await signIn(request, user.email) };
}
