import type { User } from '../db/users';

declare global {
  namespace Express {
    interface Request {
      // Set by the auth middleware on routes that require a signed-in user.
      user?: User;
    }
  }
}
