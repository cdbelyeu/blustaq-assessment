import { Router } from 'express';
import type { UserRepository } from '../db/users';
import { updateUserBody } from './schemas';

// Mounted behind auth, so `req.user` is always the signed-in user.
export function createMeRouter(users: UserRepository): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(req.user);
  });

  router.patch('/', (req, res) => {
    const patch = updateUserBody.parse(req.body);
    res.json(users.update(req.user!, patch));
  });

  router.delete('/', (req, res) => {
    users.delete(req.user!.id);
    res.status(204).end();
  });

  return router;
}
