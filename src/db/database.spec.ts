import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './database';

describe('openDatabase', () => {
  it('creates the health_check table with its single static row', () => {
    const db = openDatabase(':memory:');

    const rows = db.prepare('SELECT id, message FROM health_check').all();

    expect(rows).toEqual([{ id: 1, message: 'ok' }]);
    db.close();
  });

  it('prevents a second health_check row', () => {
    const db = openDatabase(':memory:');

    expect(() =>
      db.prepare("INSERT INTO health_check (id, message) VALUES (2, 'x')").run(),
    ).toThrow(/CHECK constraint/);
    db.close();
  });

  it('applies each migration once, even when the database is reopened', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-'));
    const file = path.join(dir, 'test.db');

    openDatabase(file).close();
    const reopened = openDatabase(file);

    const applied = reopened.prepare('SELECT name FROM schema_migrations').all();
    expect(applied).toEqual([{ name: '001_health_check.sql' }, { name: '002_users.sql' }]);
    reopened.close();
    fs.rmSync(dir, { recursive: true });
  });
});
