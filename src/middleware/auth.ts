import type { RequestHandler } from 'express';
import { hashToken } from '../auth/tokens';
import type { SessionRepository } from '../db/sessions';
import type { Clock } from '../clock';
import { ApiError } from '../errors';

const BEARER = /^Bearer (\S+)$/;

export function createAuth(sessions: SessionRepository, clock: Clock): RequestHandler {
  return (req, res, next) => {
    const token = BEARER.exec(req.header('Authorization') ?? '')?.[1];
    const tokenHash = token && hashToken(token);
    const user = tokenHash ? sessions.findUser(tokenHash, clock()) : undefined;
    if (!tokenHash || !user) {
      res.set('WWW-Authenticate', 'Bearer');
      throw new ApiError(401, 'unauthorized', 'Authentication required');
    }
    req.user = user;
    req.sessionTokenHash = tokenHash;
    next();
  };
}
