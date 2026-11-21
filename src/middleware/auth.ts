import type { RequestHandler } from 'express';
import { ApiError } from '../errors';
import type { UserRepository } from '../db/users';

// Temporary stand-in for bearer-token auth: the caller names themselves in X-User-Id.
// Replaced by token lookup in the auth step; routes only ever read `req.user`.
export function createAuthStub(users: UserRepository): RequestHandler {
  return (req, _res, next) => {
    const id = req.header('X-User-Id');
    const user = id ? users.findById(id) : undefined;
    if (!user) throw new ApiError(401, 'unauthorized', 'Authentication required');
    req.user = user;
    next();
  };
}
