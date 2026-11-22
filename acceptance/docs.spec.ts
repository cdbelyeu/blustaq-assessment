import { test as it, expect } from '@playwright/test';

it.describe('MVP-11: a client developer can explore the API interactively', () => {
  it('publishes the API description as OpenAPI', async ({ request }) => {
    const res = await request.get('/openapi.json');

    expect(res.status()).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/users',
        '/sessions',
        '/sessions/current',
        '/me',
        '/notes',
        '/notes/{id}',
        '/health',
        '/health/db',
      ]),
    );
  });

  it('serves a page where requests can be tried out', async ({ request }) => {
    const res = await request.get('/docs/');

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    expect(await res.text()).toContain('Swagger UI');
  });
});
