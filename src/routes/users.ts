import { Router } from 'express';
import type { UserRepository } from '../db/users';
import { createUserBody } from './schemas';

// Registration is open: anyone can create their own account.
export function createUsersRouter(users: UserRepository): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const user = users.create(createUserBody.parse(req.body));
    res.status(201).json(user);
  });

  return router;
}
