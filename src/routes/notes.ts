import { Router, type Request, type Response } from 'express';
import type { NoteRepository } from '../db/notes';
import { ApiError } from '../errors';
import { decodeCursor, encodeCursor } from '../pagination';
import { canDelete, canEdit, canRead } from '../policies/notes';
import { createNoteBody, listNotesQuery, updateNoteBody } from './schemas';

// The ETag of a note is its version, as a strong ETag. Set explicitly so Express's automatic
// weak ETags, which describe the response bytes, are not used for notes.
const setEtag = (res: Response, note: { version: number }): void => {
  res.set('ETag', `"${note.version}"`);
};

const IF_MATCH = /^"(\d+)"$/;

function expectedVersion(req: Request): number {
  const header = req.header('If-Match');
  if (header === undefined) {
    throw new ApiError(428, 'precondition_required', "Send the note's ETag in If-Match");
  }
  const match = IF_MATCH.exec(header);
  if (!match) {
    throw new ApiError(400, 'invalid_if_match', 'If-Match must be one ETag, such as "3"');
  }
  return Number(match[1]);
}

// Mounted behind auth, so `req.user` is always the signed-in user.
export function createNotesRouter(notes: NoteRepository): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const input = createNoteBody.parse(req.body);
    const note = notes.create({ ownerId: req.user!.id, ...input });
    setEtag(res, note);
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
    setEtag(res, note);
    res.json(note);
  });

  router.patch('/:id', (req, res) => {
    const note = notes.findById(req.params.id);
    if (!note || !canEdit(req.user!, note)) {
      throw new ApiError(404, 'note_not_found', 'Note not found');
    }
    const patch = updateNoteBody.parse(req.body);
    const updated = notes.update(note, patch, expectedVersion(req));
    setEtag(res, updated);
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const note = notes.findById(req.params.id);
    if (!note || !canDelete(req.user!, note)) {
      throw new ApiError(404, 'note_not_found', 'Note not found');
    }
    notes.delete(note, expectedVersion(req));
    res.status(204).end();
  });

  return router;
}
