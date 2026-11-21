import { test as it, expect } from '@playwright/test';

it.describe('MVP-9: operator can tell the service is up', () => {
  it('responds ok to the health check', async ({ request }) => {
    const res = await request.get('/health');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns a JSON 404 for unknown routes', async ({ request }) => {
    const res = await request.get('/does-not-exist');

    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
  });
});

it.describe('MVP-9: operator can tell the service can reach its data', () => {
  it('responds ok to the database health check', async ({ request }) => {
    const res = await request.get('/health/db');

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
