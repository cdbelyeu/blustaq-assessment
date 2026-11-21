import { Router } from 'express';
import type { PasswordHasher } from '../auth/passwords';
import type { UserRepository } from '../db/users';
import { createUserBody } from './schemas';

// Registration is open: anyone can create their own account.
export function createUsersRouter(users: UserRepository, hasher: PasswordHasher): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { password, ...profile } = createUserBody.parse(req.body);
    const user = users.create({ ...profile, passwordHash: await hasher.hash(password) });
    res.status(201).json(user);
  });

  return router;
}
