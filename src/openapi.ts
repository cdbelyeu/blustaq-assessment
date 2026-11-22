import { z } from 'zod';
import {
  createNoteBody,
  createSessionBody,
  createUserBody,
  errorResponse,
  healthResponse,
  noteListResponse,
  noteResponse,
  noteSummaryResponse,
  sessionResponse,
  updateNoteBody,
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
const noteExample = {
  id: '9b1f6c2e-47d3-4e0a-8c55-1d2a7e3b6f04',
  ownerId: userExample.id,
  title: 'Sprint planning',
  body: '# Sprint planning\n\n- Review the backlog\n- Agree the goal',
  version: 1,
  createdAt: '2026-11-21T22:05:00.000Z',
  updatedAt: '2026-11-21T22:05:00.000Z',
};
const noteSummaryExample = {
  id: noteExample.id,
  ownerId: noteExample.ownerId,
  title: noteExample.title,
  version: noteExample.version,
  createdAt: noteExample.createdAt,
  updatedAt: noteExample.updatedAt,
};
const noteListExample = {
  items: [
    { ...noteSummaryExample, id: 'c4a8d1f0-2b6e-4f37-9a10-5e8b3c7d2a91', title: 'Retro notes' },
    noteSummaryExample,
  ],
  nextCursor: 'MjAyNi0xMS0yMVQyMjowNTowMC4wMDBafDliMWY2YzJlLTQ3ZDMtNGUwYS04YzU1LTFkMmE3ZTNiNmYwNA',
};
const sessionExample = {
  token: 'q8Zr0h2n6mXk4V9yT1wLpB3sD7fGjC5aE-uHiOcNdMg',
  expiresAt: '2026-11-21T22:32:27.000Z',
};
const errorExample = (code: string, message: string) => ({ error: { code, message } });
const errorRef = (name: string): Json => ({ $ref: `#/components/responses/${name}` });
const signedIn = [{ BearerAuth: [] }];

const etagHeader: Json = {
  ETag: {
    description: "The note's version as a strong ETag. Send it back in `If-Match` when editing.",
    schema: { type: 'string', example: '"1"' },
  },
};
const withEtag = (base: Json, extra: Json = {}): Json => ({
  ...base,
  headers: { ...etagHeader, ...extra },
});

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
      { name: 'Notes', description: 'Your notes. Markdown is stored as sent.' },
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
      '/notes': {
        get: {
          tags: ['Notes'],
          summary: 'List your notes',
          description:
            'Newest edit first. Bodies are left out; fetch a note to read it. Pass `nextCursor` ' +
            'back as `cursor` to get the following page; it is `null` on the last page.',
          security: signedIn,
          parameters: [
            {
              name: 'limit',
              in: 'query',
              description: 'Notes per page.',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'cursor',
              in: 'query',
              description: 'The `nextCursor` from the previous page.',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': response('One page of your notes.', ref('NoteList'), noteListExample),
            '400': errorRef('ValidationFailed'),
            '401': errorRef('Unauthorized'),
          },
        },
        post: {
          tags: ['Notes'],
          summary: 'Create a note',
          description:
            'The note is private to you. The body is Markdown, at most 100 KB (UTF-8), and may be empty.',
          security: signedIn,
          requestBody: {
            required: true,
            content: json(ref('CreateNoteRequest'), {
              title: 'Sprint planning',
              body: '# Sprint planning\n\n- Review the backlog\n- Agree the goal',
            }),
          },
          responses: {
            '201': withEtag(response('The new note.', ref('Note'), noteExample), {
              Location: {
                description: 'Where to read the note.',
                schema: { type: 'string', example: `/notes/${noteExample.id}` },
              },
            }),
            '400': errorRef('ValidationFailed'),
            '401': errorRef('Unauthorized'),
            '413': errorRef('PayloadTooLarge'),
          },
        },
      },
      '/notes/{id}': {
        get: {
          tags: ['Notes'],
          summary: 'Get a note',
          description:
            'Returns the whole note, including its body. A note that is not yours is reported as ' +
            'not found, the same as one that does not exist.',
          security: signedIn,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': withEtag(response('The note.', ref('Note'), noteExample)),
            '401': errorRef('Unauthorized'),
            '404': errorRef('NoteNotFound'),
          },
        },
        patch: {
          tags: ['Notes'],
          summary: 'Edit a note',
          description:
            'Send only the fields to change; at least one is required. **`If-Match` is required**: ' +
            'send the `ETag` from the note you last read. If someone else has saved since, the ' +
            'edit is refused with `412` and nothing is overwritten; fetch the note again and ' +
            'reapply your change. `version` and `updatedAt` change only if a value actually ' +
            'changed: saving the same content again is a no-op and returns the note as it was.',
          security: signedIn,
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            {
              name: 'If-Match',
              in: 'header',
              required: true,
              description: 'The note\'s ETag from your last read, such as `"3"`.',
              schema: { type: 'string', example: '"1"' },
            },
          ],
          requestBody: {
            required: true,
            content: json(ref('UpdateNoteRequest'), { title: 'Sprint planning (agreed)' }),
          },
          responses: {
            '200': withEtag(
              response('The note after the edit.', ref('Note'), {
                ...noteExample,
                title: 'Sprint planning (agreed)',
                version: 2,
                updatedAt: '2026-11-21T22:20:00.000Z',
              }),
            ),
            '400': errorRef('ValidationFailed'),
            '401': errorRef('Unauthorized'),
            '404': errorRef('NoteNotFound'),
            '412': errorRef('VersionConflict'),
            '413': errorRef('PayloadTooLarge'),
            '428': errorRef('PreconditionRequired'),
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
        CreateNoteRequest: schemaOf(createNoteBody, 'input'),
        UpdateNoteRequest: schemaOf(updateNoteBody, 'input'),
        Note: schemaOf(noteResponse, 'output'),
        NoteSummary: schemaOf(noteSummaryResponse, 'output'),
        NoteList: schemaOf(noteListResponse, 'output'),
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
        NoteNotFound: response(
          'No such note, or it is not yours.',
          ref('Error'),
          errorExample('note_not_found', 'Note not found'),
        ),
        VersionConflict: response(
          'The note changed since the `ETag` you sent. Nothing was overwritten.',
          ref('Error'),
          errorExample(
            'version_conflict',
            'The note has changed since you loaded it. Fetch it again.',
          ),
        ),
        PreconditionRequired: response(
          '`If-Match` is missing.',
          ref('Error'),
          errorExample('precondition_required', "Send the note's ETag in If-Match"),
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
