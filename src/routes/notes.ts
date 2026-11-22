import { Router } from 'express';
import type { NoteRepository } from '../db/notes';
import { createNoteBody } from './schemas';

// Mounted behind auth, so `req.user` is always the signed-in user.
export function createNotesRouter(notes: NoteRepository): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const input = createNoteBody.parse(req.body);
    const note = notes.create({ ownerId: req.user!.id, ...input });
    res.status(201).json(note);
  });

  return router;
}
