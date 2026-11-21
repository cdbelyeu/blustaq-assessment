import { z } from 'zod';

const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const displayName = z.string().trim().min(1).max(100);

export const createUserBody = z.strictObject({ email, displayName });

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

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export const healthResponse = z.object({ status: z.enum(['ok', 'unavailable']) });
