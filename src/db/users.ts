import { randomUUID } from 'node:crypto';
import { ApiError } from '../errors';
import type { Db } from './database';

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPatch {
  email?: string;
  displayName?: string;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export class EmailTakenError extends ApiError {
  constructor() {
    super(409, 'email_taken', 'Email is already registered');
  }
}

export interface UserRepository {
  create(input: { email: string; displayName: string }): User;
  findById(id: string): User | undefined;
  update(user: User, patch: UserPatch): User;
  delete(id: string): void;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Not `instanceof Error`: errors from the native SQLite module can come from another realm.
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  err.code === 'SQLITE_CONSTRAINT_UNIQUE';

export function createUserRepository(db: Db): UserRepository {
  const insert = db.prepare(
    'INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const selectById = db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?');
  const updateById = db.prepare(
    'UPDATE users SET email = ?, display_name = ?, updated_at = ? WHERE id = ?',
  );
  const deleteById = db.prepare('DELETE FROM users WHERE id = ?');

  return {
    create({ email, displayName }) {
      const now = new Date().toISOString();
      const user: User = { id: randomUUID(), email, displayName, createdAt: now, updatedAt: now };
      try {
        insert.run(user.id, email, displayName, now, now);
      } catch (err) {
        throw isUniqueViolation(err) ? new EmailTakenError() : err;
      }
      return user;
    },

    findById(id) {
      const row = selectById.get(id);
      return row && toUser(row);
    },

    update(user, patch) {
      const updated: User = {
        ...user,
        email: patch.email ?? user.email,
        displayName: patch.displayName ?? user.displayName,
        updatedAt: new Date().toISOString(),
      };
      try {
        updateById.run(updated.email, updated.displayName, updated.updatedAt, user.id);
      } catch (err) {
        throw isUniqueViolation(err) ? new EmailTakenError() : err;
      }
      return updated;
    },

    delete(id) {
      deleteById.run(id);
    },
  };
}
