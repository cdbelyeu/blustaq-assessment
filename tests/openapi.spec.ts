import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';
import request from 'supertest';
import { buildOpenApiDocument } from '../src/openapi';
import {
  errorResponse,
  healthResponse,
  noteResponse,
  sessionResponse,
  userResponse,
} from '../src/routes/schemas';
import { bearer, createTestApp, PASSWORD, type TestApp } from './support/app';

describe('API documentation', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });

  afterEach(() => t.db.close());

  it('serves the OpenAPI document as JSON', async () => {
    const res = await request(t.app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ openapi: '3.1.0', info: { title: 'Team Notes API' } });
  });

  it('serves an interactive UI', async () => {
    const res = await request(t.app).get('/docs/');

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
        const res = await request(t.app)[method as 'get'](path);

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
      Session: sessionResponse,
      Note: noteResponse,
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
    it('for a registered user and a session', async () => {
      const registered = await request(t.app)
        .post('/users')
        .send({ email: 'ada@example.com', displayName: 'Ada', password: PASSWORD });
      const session = await request(t.app)
        .post('/sessions')
        .send({ email: 'ada@example.com', password: PASSWORD });
      const me = await request(t.app)
        .get('/me')
        .set(...bearer((session.body as { token: string }).token));

      expect(userResponse.safeParse(registered.body).success).toBe(true);
      expect(sessionResponse.safeParse(session.body).success).toBe(true);
      expect(userResponse.safeParse(me.body).success).toBe(true);
    });

    it('for validation, conflict, credential and authentication errors', async () => {
      const body = { email: 'a@example.com', displayName: 'A', password: PASSWORD };
      const invalid = await request(t.app).post('/users').send({ email: 'nope' });
      await request(t.app).post('/users').send(body);
      const duplicate = await request(t.app).post('/users').send(body);
      const badLogin = await request(t.app)
        .post('/sessions')
        .send({ email: 'a@example.com', password: 'wrong password' });
      const anonymous = await request(t.app).get('/me');

      for (const res of [invalid, duplicate, badLogin, anonymous]) {
        expect(errorResponse.safeParse(res.body).success).toBe(true);
      }
    });

    it('for a created note', async () => {
      const { token } = await t.signUp();

      const res = await request(t.app)
        .post('/notes')
        .set(...bearer(token))
        .send({ title: 'Plan', body: '# Plan' });

      expect(noteResponse.safeParse(res.body).success).toBe(true);
    });

    it('for health checks', async () => {
      const up = await request(t.app).get('/health');
      const readiness = await request(t.app).get('/health/db');

      expect(healthResponse.safeParse(up.body).success).toBe(true);
      expect(healthResponse.safeParse(readiness.body).success).toBe(true);
    });
  });
});
