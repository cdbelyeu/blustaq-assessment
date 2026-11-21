import { test, expect } from '@playwright/test';

test.describe('MVP-9: operator can tell the service is up', () => {
  test('health check responds with ok', async ({ request }) => {
    const res = await request.get('/health');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('unknown routes return a JSON 404', async ({ request }) => {
    const res = await request.get('/does-not-exist');

    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
  });
});

test.describe('MVP-9: operator can tell the service can reach its data', () => {
  test('database health check responds with ok', async ({ request }) => {
    const res = await request.get('/health/db');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
