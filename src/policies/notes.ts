import type { Note } from '../db/notes';
import type { User } from '../db/users';

// The one place that decides who may do what with a note. A denial is answered as "not found",
// so nobody can tell a note they cannot see from one that does not exist.
export const canRead = (user: User, note: Note): boolean => note.ownerId === user.id;

export const canEdit = (user: User, note: Note): boolean => note.ownerId === user.id;

export const canDelete = (user: User, note: Note): boolean => note.ownerId === user.id;
