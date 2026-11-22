import type { PageCursor } from './db/notes';
import { ApiError } from './errors';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Opaque to clients. Not signed: the query is always limited to the caller's own notes, so a
// forged cursor can only change where in their own list a page starts.
export const encodeCursor = ({ updatedAt, id }: PageCursor): string =>
  Buffer.from(`${updatedAt}|${id}`).toString('base64url');

export function decodeCursor(cursor: string): PageCursor {
  const [updatedAt, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!updatedAt || !id || rest.length > 0 || !ISO_UTC.test(updatedAt) || !UUID.test(id)) {
    throw new ApiError(400, 'invalid_cursor', 'Cursor is invalid');
  }
  return { updatedAt, id };
}
