import { randomUUID } from 'node:crypto';
import { systemClock, type Clock } from '../clock';
import { ApiError } from '../errors';
import type { Db } from './database';

export interface Note {
  id: string;
  ownerId: string | null;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type NoteSummary = Omit<Note, 'body'>;

export interface PageCursor {
  updatedAt: string;
  id: string;
}

export interface NotePage {
  items: NoteSummary[];
  // Where the next page starts, or undefined on the last page.
  next: PageCursor | undefined;
}

export interface NotePatch {
  title?: string;
  body?: string;
}

export class VersionConflictError extends ApiError {
  constructor() {
    super(412, 'version_conflict', 'The note has changed since you loaded it. Fetch it again.');
  }
}

export interface NoteRepository {
  create(input: { ownerId: string; title: string; body: string }): Note;
  findById(id: string): Note | undefined;
  // Changes only the fields given, and only if the note is still at `expectedVersion`; otherwise
  // throws VersionConflictError. If nothing differs, the note is returned untouched: no new
  // version and no new edit time.
  update(note: Note, patch: NotePatch, expectedVersion: number): Note;
  // Removes the note for good, but only if it is still at `expectedVersion`; otherwise throws
  // VersionConflictError.
  delete(note: Note, expectedVersion: number): void;
  // Newest edit first, then by id, so the order is total even when timestamps tie.
  listByOwner(ownerId: string, limit: number, after?: PageCursor): NotePage;
}

interface SummaryRow {
  id: string;
  owner_id: string | null;
  title: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface NoteRow extends SummaryRow {
  body: string;
}

const INSERT_NOTE = `
  INSERT INTO notes (
    id,
    owner_id,
    title,
    version,
    created_at,
    updated_at,
    body
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_NOTE_BY_ID = `
  SELECT id,
         owner_id,
         title,
         version,
         created_at,
         updated_at,
         body
  FROM notes
  WHERE id = ?
`;

// The version check and the change are one statement, so nothing can slip in between them.
const UPDATE_NOTE = `
  UPDATE notes
  SET title = ?,
      body = ?,
      version = version + 1,
      updated_at = ?
  WHERE id = ?
    AND version = ?
  RETURNING id,
            owner_id,
            title,
            version,
            created_at,
            updated_at,
            body
`;

const DELETE_NOTE = `
  DELETE FROM notes
  WHERE id = ?
    AND version = ?
`;

// The list queries leave out body, so a page never reads the large column.
// Exported so a test can check their query plans against the real statements.
export const LIST_NOTES_FIRST_PAGE = `
  SELECT id,
         owner_id,
         title,
         version,
         created_at,
         updated_at
  FROM notes
  WHERE owner_id = ?
  ORDER BY updated_at DESC, id DESC
  LIMIT ?
`;

export const LIST_NOTES_AFTER = `
  SELECT id,
         owner_id,
         title,
         version,
         created_at,
         updated_at
  FROM notes
  WHERE owner_id = ?
    AND (updated_at, id) < (?, ?)
  ORDER BY updated_at DESC, id DESC
  LIMIT ?
`;

const toSummary = (row: SummaryRow): NoteSummary => ({
  id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toNote = (row: NoteRow): Note => ({ ...toSummary(row), body: row.body });

export function createNoteRepository(db: Db, clock: Clock = systemClock): NoteRepository {
  const insert = db.prepare(INSERT_NOTE);
  const selectById = db.prepare<[string], NoteRow>(SELECT_NOTE_BY_ID);
  const updateById = db.prepare<[string, string, string, string, number], NoteRow>(UPDATE_NOTE);
  const deleteById = db.prepare(DELETE_NOTE);
  const listFirstPage = db.prepare<[string, number], SummaryRow>(LIST_NOTES_FIRST_PAGE);
  const listAfter = db.prepare<[string, string, string, number], SummaryRow>(LIST_NOTES_AFTER);

  return {
    create({ ownerId, title, body }) {
      const now = clock().toISOString();
      const note: Note = {
        id: randomUUID(),
        ownerId,
        title,
        body,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      insert.run(note.id, ownerId, title, note.version, now, now, body);
      return note;
    },

    findById(id) {
      const row = selectById.get(id);
      return row && toNote(row);
    },

    update(note, patch, expectedVersion) {
      if (note.version !== expectedVersion) throw new VersionConflictError();

      const title = patch.title ?? note.title;
      const body = patch.body ?? note.body;
      if (title === note.title && body === note.body) return note;

      const row = updateById.get(title, body, clock().toISOString(), note.id, expectedVersion);
      // No row means the stored version is no longer the one expected.
      if (!row) throw new VersionConflictError();
      return toNote(row);
    },

    delete(note, expectedVersion) {
      if (note.version !== expectedVersion) throw new VersionConflictError();
      // No row deleted means the stored version is no longer the one expected.
      if (deleteById.run(note.id, expectedVersion).changes === 0) throw new VersionConflictError();
    },

    listByOwner(ownerId, limit, after) {
      // One extra row tells us whether another page exists.
      const rows = after
        ? listAfter.all(ownerId, after.updatedAt, after.id, limit + 1)
        : listFirstPage.all(ownerId, limit + 1);
      const items = rows.slice(0, limit).map(toSummary);
      const last = items.at(-1);
      const next =
        rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : undefined;
      return { items, next };
    },
  };
}
