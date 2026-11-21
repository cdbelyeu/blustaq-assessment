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
