import SwaggerParser from '@apidevtools/swagger-parser';
import type { Express } from 'express';
import type { OpenAPI } from 'openapi-types';
import request from 'supertest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { buildOpenApiDocument } from '../src/openapi';
import { errorResponse, healthResponse, userResponse } from '../src/routes/schemas';
import { silentLogger } from './support/logs';

describe('API documentation', () => {
  let db: Db;
  let app: Express;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp({ db, logger: silentLogger() });
  });

  afterEach(() => db.close());

  it('serves the OpenAPI document as JSON', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ openapi: '3.1.0', info: { title: 'Team Notes API' } });
  });

  it('serves an interactive UI', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Swagger UI');
  });

  it('is a valid OpenAPI document', async () => {
    const document = structuredClone(buildOpenApiDocument()) as unknown as OpenAPI.Document;

    await expect(SwaggerParser.validate(document)).resolves.toBeDefined();
  });

  it('documents only operations the service actually routes', async () => {
    const { paths } = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> };

    for (const [path, operations] of Object.entries(paths)) {
      for (const method of Object.keys(operations)) {
        const res = await request(app)[method as 'get'](path);

        // Only the router's own fallback uses this code; a real 404 for a resource has its own.
        const unrouted =
          res.status === 404 &&
          (res.body as { error?: { code: string } }).error?.code === 'not_found';
        expect({ operation: `${method.toUpperCase()} ${path}`, unrouted }).toEqual({
          operation: `${method.toUpperCase()} ${path}`,
          unrouted: false,
        });
      }
    }
  });

  it('gives every documented response an example that matches its schema', () => {
    const shapes: Record<string, { parse: (value: unknown) => unknown }> = {
      User: userResponse,
      Error: errorResponse,
      Health: healthResponse,
    };
    const doc = buildOpenApiDocument() as {
      paths: Record<string, Record<string, { responses: Record<string, Response> }>>;
      components: { responses: Record<string, Response> };
    };
    type Response = {
      content?: { 'application/json': { schema: { $ref: string }; example?: unknown } };
    };
    const responses = [
      ...Object.values(doc.components.responses),
      ...Object.values(doc.paths).flatMap((ops) =>
        Object.values(ops).flatMap((op) => Object.values(op.responses)),
      ),
    ].filter((r) => r.content);

    expect(responses.length).toBeGreaterThan(0);
    for (const { content } of responses) {
      const media = content!['application/json'];
      const shape = shapes[media.schema.$ref.split('/').pop()!]!;
      expect(media.example).toBeDefined();
      expect(() => shape.parse(media.example)).not.toThrow();
    }
  });

  describe('real responses match the documented shapes', () => {
    it('for a registered user', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'ada@example.com', displayName: 'Ada' });

      expect(userResponse.safeParse(res.body).success).toBe(true);
      const me = await request(app)
        .get('/me')
        .set('X-User-Id', (res.body as { id: string }).id);
      expect(userResponse.safeParse(me.body).success).toBe(true);
    });

    it('for validation, conflict and authentication errors', async () => {
      const invalid = await request(app).post('/users').send({ email: 'nope' });
      await request(app).post('/users').send({ email: 'a@example.com', displayName: 'A' });
      const duplicate = await request(app)
        .post('/users')
        .send({ email: 'a@example.com', displayName: 'A' });
      const anonymous = await request(app).get('/me');

      for (const res of [invalid, duplicate, anonymous]) {
        expect(errorResponse.safeParse(res.body).success).toBe(true);
      }
    });

    it('for health checks', async () => {
      const up = await request(app).get('/health');
      const readiness = await request(app).get('/health/db');

      expect(healthResponse.safeParse(up.body).success).toBe(true);
      expect(healthResponse.safeParse(readiness.body).success).toBe(true);
    });
  });
});
