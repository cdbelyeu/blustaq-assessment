import { z } from 'zod';
import {
  createUserBody,
  errorResponse,
  healthResponse,
  updateUserBody,
  userResponse,
} from './routes/schemas';

type Json = Record<string, unknown>;

// Schemas come from the same Zod definitions that validate requests, so they cannot drift.
function schemaOf(schema: z.ZodType, io: 'input' | 'output'): Json {
  const jsonSchema = z.toJSONSchema(schema, { io });
  delete jsonSchema.$schema;
  return jsonSchema;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json, example?: unknown): Json => ({
  'application/json': { schema, ...(example === undefined ? {} : { example }) },
});
const response = (description: string, schema?: Json, example?: unknown): Json => ({
  description,
  ...(schema ? { content: json(schema, example) } : {}),
});

// Without explicit examples, Swagger UI invents values from each schema's regex and format.
const userExample = {
  id: '3f6c1d0e-8a52-4c1b-9d57-2b8e4a7f9c10',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  createdAt: '2026-11-21T22:02:27.000Z',
  updatedAt: '2026-11-21T22:02:27.000Z',
};
const errorExample = (code: string, message: string) => ({ error: { code, message } });
const errorRef = (name: string): Json => ({ $ref: `#/components/responses/${name}` });
const signedIn = [{ UserId: [] }];

export function buildOpenApiDocument(): Json {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Team Notes API',
      version: '0.1.0',
      description:
        'A note-taking service shared among small teams. Use **Authorize** to set the `X-User-Id` ' +
        'header, then **Try it out** on any endpoint.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Accounts', description: 'Create and manage your own account.' },
      { name: 'Health', description: 'Is the service up, and can it reach its data?' },
    ],
    paths: {
      '/users': {
        post: {
          tags: ['Accounts'],
          summary: 'Register a new account',
          description:
            'Open to anyone. Copy the returned `id` into **Authorize** to act as this user.',
          requestBody: {
            required: true,
            content: json(ref('CreateUserRequest'), {
              email: 'ada@example.com',
              displayName: 'Ada Lovelace',
            }),
          },
          responses: {
            '201': response('The new account.', ref('User'), userExample),
            '400': errorRef('ValidationFailed'),
            '409': errorRef('EmailTaken'),
          },
        },
      },
      '/me': {
        get: {
          tags: ['Accounts'],
          summary: 'Get your account',
          security: signedIn,
          responses: {
            '200': response('Your account.', ref('User'), userExample),
            '401': errorRef('Unauthorized'),
          },
        },
        patch: {
          tags: ['Accounts'],
          summary: 'Update your account',
          description: 'Send only the fields to change. At least one is required.',
          security: signedIn,
          requestBody: {
            required: true,
            content: json(ref('UpdateUserRequest'), { displayName: 'Ada L.' }),
          },
          responses: {
            '200': response('Your updated account.', ref('User'), {
              ...userExample,
              displayName: 'Ada L.',
            }),
            '400': errorRef('ValidationFailed'),
            '401': errorRef('Unauthorized'),
            '409': errorRef('EmailTaken'),
          },
        },
        delete: {
          tags: ['Accounts'],
          summary: 'Delete your account',
          security: signedIn,
          responses: { '204': response('Account deleted.'), '401': errorRef('Unauthorized') },
        },
      },
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness',
          description: 'The process is up and serving requests. Does not touch the database.',
          responses: { '200': response('Service is up.', ref('Health'), { status: 'ok' }) },
        },
      },
      '/health/db': {
        get: {
          tags: ['Health'],
          summary: 'Readiness',
          description: 'The database is reachable and migrated.',
          responses: {
            '200': response('Database is reachable.', ref('Health'), { status: 'ok' }),
            '503': response('Database is unavailable.', ref('Health'), { status: 'unavailable' }),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        UserId: {
          type: 'apiKey',
          in: 'header',
          name: 'X-User-Id',
          description:
            'Temporary: paste the `id` returned by `POST /users`. Replaced by bearer tokens.',
        },
      },
      schemas: {
        User: schemaOf(userResponse, 'output'),
        CreateUserRequest: schemaOf(createUserBody, 'input'),
        UpdateUserRequest: schemaOf(updateUserBody, 'input'),
        Error: schemaOf(errorResponse, 'output'),
        Health: schemaOf(healthResponse, 'output'),
      },
      responses: {
        Unauthorized: response(
          'Missing or unknown `X-User-Id`.',
          ref('Error'),
          errorExample('unauthorized', 'Authentication required'),
        ),
        ValidationFailed: response(
          'The request body is invalid; `details` lists each problem.',
          ref('Error'),
          {
            error: {
              code: 'validation_failed',
              message: 'Request is invalid',
              details: [{ path: 'email', message: 'Invalid email address' }],
            },
          },
        ),
        EmailTaken: response(
          'That email is already registered.',
          ref('Error'),
          errorExample('email_taken', 'Email is already registered'),
        ),
      },
    },
  };
}
