import { Router } from 'express';
import type { NoteRepository } from '../db/notes';
import { ApiError } from '../errors';
import { decodeCursor, encodeCursor } from '../pagination';
import { canRead } from '../policies/notes';
import { createNoteBody, listNotesQuery } from './schemas';

// Mounted behind auth, so `req.user` is always the signed-in user.
export function createNotesRouter(notes: NoteRepository): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const input = createNoteBody.parse(req.body);
    const note = notes.create({ ownerId: req.user!.id, ...input });
    res.status(201).location(`/notes/${note.id}`).json(note);
  });

  router.get('/', (req, res) => {
    const { limit, cursor } = listNotesQuery.parse(req.query);
    const page = notes.listByOwner(req.user!.id, limit, cursor ? decodeCursor(cursor) : undefined);
    res.json({ items: page.items, nextCursor: page.next ? encodeCursor(page.next) : null });
  });

  router.get('/:id', (req, res) => {
    const note = notes.findById(req.params.id);
    if (!note || !canRead(req.user!, note)) {
      throw new ApiError(404, 'note_not_found', 'Note not found');
    }
    res.json(note);
  });

  return router;
}
