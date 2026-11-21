import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  // A missing hash (no such account) still does the full work, so timing does not reveal it.
  verify(password: string, stored: string | undefined): Promise<boolean>;
}

// OWASP's scrypt recommendation: N=2^15, r=8, p=3 (about 170 ms on a development laptop).
export const DEFAULT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const derive = (password: string, salt: Buffer, { N, r, p }: ScryptCost): Promise<Buffer> => {
  const options: ScryptOptions = { N, r, p, maxmem: 128 * N * r * 2 };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
};

// Stored as `scrypt$N$r$p$salt$key`, so the cost can be raised later without breaking old hashes.
function parse(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | undefined {
  const [scheme, N, r, p, salt, key, ...rest] = stored.split('$');
  if (scheme !== 'scrypt' || !N || !r || !p || !salt || !key || rest.length > 0) return undefined;
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  return { cost, salt: Buffer.from(salt, 'base64url'), key: Buffer.from(key, 'base64url') };
}

export function createPasswordHasher(cost: ScryptCost = DEFAULT_COST): PasswordHasher {
  const decoy = randomBytes(SALT_LENGTH);

  return {
    async hash(password) {
      const salt = randomBytes(SALT_LENGTH);
      const key = await derive(password, salt, cost);
      return [
        'scrypt',
        cost.N,
        cost.r,
        cost.p,
        salt.toString('base64url'),
        key.toString('base64url'),
      ].join('$');
    },

    async verify(password, stored) {
      const parsed = stored === undefined ? undefined : parse(stored);
      const key = await derive(password, parsed?.salt ?? decoy, parsed?.cost ?? cost);
      return (
        parsed !== undefined && key.length === parsed.key.length && timingSafeEqual(key, parsed.key)
      );
    },
  };
}
