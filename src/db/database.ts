import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`;

const SELECT_APPLIED_MIGRATIONS = `
  SELECT name
  FROM schema_migrations
`;

const INSERT_MIGRATION = `
  INSERT INTO schema_migrations (name, applied_at)
  VALUES (?, ?)
`;

export function openDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

// Applies numbered .sql files in order, once each, so the schema evolves one migration per change.
function migrate(db: Db): void {
  db.exec(CREATE_MIGRATIONS_TABLE);

  const applied = new Set(
    db
      .prepare<[], { name: string }>(SELECT_APPLIED_MIGRATIONS)
      .all()
      .map((row) => row.name),
  );

  const pending = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql') && !applied.has(file))
    .sort();

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare(INSERT_MIGRATION).run(file, new Date().toISOString());
    })();
  }
}
