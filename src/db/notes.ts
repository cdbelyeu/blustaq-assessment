import { randomUUID } from 'node:crypto';
import { systemClock, type Clock } from '../clock';
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

export interface NoteRepository {
  create(input: { ownerId: string; title: string; body: string }): Note;
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

export function createNoteRepository(db: Db, clock: Clock = systemClock): NoteRepository {
  const insert = db.prepare(INSERT_NOTE);

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
  };
}
