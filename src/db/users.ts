import { randomUUID } from 'node:crypto';
import { systemClock, type Clock } from '../clock';
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
  password_hash: string;
}

export class EmailTakenError extends ApiError {
  constructor() {
    super(409, 'email_taken', 'Email is already registered');
  }
}

export interface UserRepository {
  create(input: { email: string; displayName: string; passwordHash: string }): User;
  findById(id: string): User | undefined;
  findCredentialsByEmail(email: string): { user: User; passwordHash: string } | undefined;
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

const INSERT_USER = `
  INSERT INTO users (
    id,
    email,
    display_name,
    password_hash,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
`;

const SELECT_USER_BY_ID = `
  SELECT *
  FROM users
  WHERE id = ?
`;

const SELECT_USER_BY_EMAIL = `
  SELECT *
  FROM users
  WHERE email = ?
`;

const UPDATE_USER = `
  UPDATE users
  SET email = ?,
      display_name = ?,
      updated_at = ?
  WHERE id = ?
`;

const DELETE_USER = `
  DELETE FROM users
  WHERE id = ?
`;

export function createUserRepository(db: Db, clock: Clock = systemClock): UserRepository {
  const insert = db.prepare(INSERT_USER);
  const selectById = db.prepare<[string], UserRow>(SELECT_USER_BY_ID);
  const selectByEmail = db.prepare<[string], UserRow>(SELECT_USER_BY_EMAIL);
  const updateById = db.prepare(UPDATE_USER);
  const deleteById = db.prepare(DELETE_USER);

  return {
    create({ email, displayName, passwordHash }) {
      const now = clock().toISOString();
      const user: User = { id: randomUUID(), email, displayName, createdAt: now, updatedAt: now };
      try {
        insert.run(user.id, email, displayName, passwordHash, now, now);
      } catch (err) {
        throw isUniqueViolation(err) ? new EmailTakenError() : err;
      }
      return user;
    },

    findById(id) {
      const row = selectById.get(id);
      return row && toUser(row);
    },

    findCredentialsByEmail(email) {
      const row = selectByEmail.get(email);
      return row && { user: toUser(row), passwordHash: row.password_hash };
    },

    update(user, patch) {
      const updated: User = {
        ...user,
        email: patch.email ?? user.email,
        displayName: patch.displayName ?? user.displayName,
        updatedAt: clock().toISOString(),
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
