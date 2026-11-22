import type { Db } from './database';
import type { User } from './users';

export interface SessionRepository {
  create(session: { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date }): void;
  // Expired sessions are ignored here; they are never deleted.
  findUser(tokenHash: string, now: Date): User | undefined;
  delete(tokenHash: string): void;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

const INSERT_SESSION = `
  INSERT INTO sessions (
    token_hash,
    user_id,
    created_at,
    expires_at
  )
  VALUES (?, ?, ?, ?)
`;

// Expired sessions match nothing. ISO 8601 UTC strings sort the same way as the times they describe.
const SELECT_USER_BY_LIVE_SESSION = `
  SELECT u.id,
         u.email,
         u.display_name,
         u.created_at,
         u.updated_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ?
    AND s.expires_at > ?
`;

const DELETE_SESSION = `
  DELETE FROM sessions
  WHERE token_hash = ?
`;

export function createSessionRepository(db: Db): SessionRepository {
  const insert = db.prepare(INSERT_SESSION);
  const selectUser = db.prepare<[string, string], UserRow>(SELECT_USER_BY_LIVE_SESSION);
  const remove = db.prepare(DELETE_SESSION);

  return {
    create({ tokenHash, userId, createdAt, expiresAt }) {
      insert.run(tokenHash, userId, createdAt.toISOString(), expiresAt.toISOString());
    },

    findUser(tokenHash, now) {
      const row = selectUser.get(tokenHash, now.toISOString());
      return (
        row && {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      );
    },

    delete(tokenHash) {
      remove.run(tokenHash);
    },
  };
}
