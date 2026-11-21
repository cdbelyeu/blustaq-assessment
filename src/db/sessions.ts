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

export function createSessionRepository(db: Db): SessionRepository {
  const insert = db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  );
  // ISO 8601 UTC strings sort the same way as the times they describe.
  const selectUser = db.prepare<[string, string], UserRow>(
    `SELECT u.id, u.email, u.display_name, u.created_at, u.updated_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  );
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');

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
