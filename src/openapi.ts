import { z } from 'zod';
import {
  createSessionBody,
  createUserBody,
  errorResponse,
  healthResponse,
  sessionResponse,
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
const sessionExample = {
  token: 'q8Zr0h2n6mXk4V9yT1wLpB3sD7fGjC5aE-uHiOcNdMg',
  expiresAt: '2026-11-21T22:32:27.000Z',
};
const errorExample = (code: string, message: string) => ({ error: { code, message } });
const errorRef = (name: string): Json => ({ $ref: `#/components/responses/${name}` });
const signedIn = [{ BearerAuth: [] }];

export function buildOpenApiDocument(): Json {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Team Notes API',
      version: '0.1.0',
      description:
        'A note-taking service shared among small teams. To try it: register with `POST /users`, ' +
        'sign in with `POST /sessions`, paste the returned token into **Authorize**, then use ' +
        '**Try it out** on any endpoint. Sessions expire 30 minutes after sign-in.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Accounts', description: 'Create and manage your own account.' },
      { name: 'Sessions', description: 'Sign in to get a token, and sign out to end it.' },
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
              password: 'correct horse battery',
            }),
          },
          responses: {
            '201': response('The new account.', ref('User'), userExample),
            '400': errorRef('ValidationFailed'),
            '413': errorRef('PayloadTooLarge'),
            '409': errorRef('EmailTaken'),
          },
        },
      },
      '/sessions': {
        post: {
          tags: ['Sessions'],
          summary: 'Sign in',
          description:
            'Returns a bearer token, shown only once. It stops working at `expiresAt`, 30 minutes ' +
            'after sign-in, and cannot be extended: sign in again.',
          requestBody: {
            required: true,
            content: json(ref('CreateSessionRequest'), {
              email: 'ada@example.com',
              password: 'correct horse battery',
            }),
          },
          responses: {
            '201': response('A new session.', ref('Session'), sessionExample),
            '400': errorRef('ValidationFailed'),
            '413': errorRef('PayloadTooLarge'),
            '401': response(
              'Wrong email or password. The response is the same for both.',
              ref('Error'),
              errorExample('invalid_credentials', 'Invalid email or password'),
            ),
          },
        },
      },
      '/sessions/current': {
        delete: {
          tags: ['Sessions'],
          summary: 'Sign out',
          description: 'Ends the session this request is using, immediately.',
          security: signedIn,
          responses: { '204': response('Signed out.'), '401': errorRef('Unauthorized') },
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
            '413': errorRef('PayloadTooLarge'),
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
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'The `token` returned by `POST /sessions`.',
        },
      },
      schemas: {
        User: schemaOf(userResponse, 'output'),
        CreateUserRequest: schemaOf(createUserBody, 'input'),
        UpdateUserRequest: schemaOf(updateUserBody, 'input'),
        CreateSessionRequest: schemaOf(createSessionBody, 'input'),
        Session: schemaOf(sessionResponse, 'output'),
        Error: schemaOf(errorResponse, 'output'),
        Health: schemaOf(healthResponse, 'output'),
      },
      responses: {
        Unauthorized: response(
          'Missing, malformed, unknown or expired token.',
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
        PayloadTooLarge: response(
          'The request body is too large.',
          ref('Error'),
          errorExample('payload_too_large', 'Request body is too large'),
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
