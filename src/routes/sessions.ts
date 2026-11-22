import type { RequestHandler } from 'express';
import { Router } from 'express';
import type { PasswordHasher } from '../auth/passwords';
import { generateToken, hashToken } from '../auth/tokens';
import type { SessionRepository } from '../db/sessions';
import type { UserRepository } from '../db/users';
import { ApiError } from '../errors';
import type { Clock } from '../clock';
import { createSessionBody } from './schemas';

interface Options {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  clock: Clock;
  ttlMinutes: number;
  requireAuth: RequestHandler;
}

export function createSessionsRouter(o: Options): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { email, password } = createSessionBody.parse(req.body);
    const found = o.users.findCredentialsByEmail(email);
    const valid = await o.hasher.verify(password, found?.passwordHash);
    // One response for an unknown email and a wrong password, so neither can be told apart.
    if (!found || !valid) {
      throw new ApiError(401, 'invalid_credentials', 'Invalid email or password');
    }

    const token = generateToken();
    const now = o.clock();
    const expiresAt = new Date(now.getTime() + o.ttlMinutes * 60_000);
    o.sessions.create({
      tokenHash: hashToken(token),
      userId: found.user.id,
      createdAt: now,
      expiresAt,
    });
    res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
  });

  router.delete('/current', o.requireAuth, (req, res) => {
    o.sessions.delete(req.sessionTokenHash!);
    res.status(204).end();
  });

  return router;
}
