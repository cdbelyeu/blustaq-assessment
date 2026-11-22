import { z } from 'zod';

const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const displayName = z.string().trim().min(1).max(100);

// Length is what matters; there are no composition rules. Not trimmed. The cap bounds hashing work.
const newPassword = z.string().min(8).max(128).meta({ format: 'password' });

export const createUserBody = z.strictObject({ email, displayName, password: newPassword });

const NOTE_BODY_MAX_BYTES = 100 * 1024;

const noteTitle = z.string().trim().min(1).max(200);
// Measured in UTF-8 bytes, not characters, so the cap holds for any script or emoji.
const noteBody = z
  .string()
  .refine((value) => Buffer.byteLength(value, 'utf8') <= NOTE_BODY_MAX_BYTES, {
    message: 'Must be at most 100 KB (UTF-8)',
  })
  .meta({ description: 'Markdown, stored as sent. At most 100 KB (UTF-8). May be empty.' });

export const createNoteBody = z.strictObject({ title: noteTitle, body: noteBody });

export const listNotesQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const createSessionBody = z.strictObject({
  email,
  password: z.string().min(1).max(128).meta({ format: 'password' }),
});

export const updateUserBody = z
  .strictObject({ email: email.optional(), displayName: displayName.optional() })
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field' });

// Response shapes. They exist for the API docs and for tests that check real responses match.
export const userResponse = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const noteResponse = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  title: z.string(),
  body: z.string(),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const noteSummaryResponse = noteResponse.omit({ body: true });

export const noteListResponse = z.object({
  items: z.array(noteSummaryResponse),
  nextCursor: z.string().nullable(),
});

export const sessionResponse = z.object({ token: z.string(), expiresAt: z.iso.datetime() });

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export const healthResponse = z.object({ status: z.enum(['ok', 'unavailable']) });
