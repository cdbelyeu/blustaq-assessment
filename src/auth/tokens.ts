import { createHash, randomBytes } from 'node:crypto';

// 256 bits of randomness, so a fast hash is enough to protect what is stored.
export const generateToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
