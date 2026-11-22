import { openDatabase, type Db } from './database';
import { createNoteRepository, type NoteRepository } from './notes';
import { createUserRepository, type User, type UserRepository } from './users';

describe('note repository', () => {
  let db: Db;
  let users: UserRepository;
  let notes: NoteRepository;
  let owner: User;

  beforeEach(() => {
    db = openDatabase(':memory:');
    users = createUserRepository(db);
    notes = createNoteRepository(db);
    owner = users.create({ email: 'ada@example.com', displayName: 'Ada', passwordHash: 'h' });
  });

  afterEach(() => db.close());

  it('creates a note at version 1 with matching timestamps', () => {
    const note = notes.create({ ownerId: owner.id, title: 'Plan', body: '# Plan' });

    expect(note).toMatchObject({ ownerId: owner.id, title: 'Plan', body: '# Plan', version: 1 });
    expect(note.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(note.createdAt).toBe(note.updatedAt);
  });

  it('stores the note exactly as given', () => {
    const body = '# Title\n\n- café \u{1F680}\n\n    indented\n';
    const note = notes.create({ ownerId: owner.id, title: 'Plan', body });

    const row = db.prepare('SELECT title, body, version FROM notes WHERE id = ?').get(note.id);

    expect(row).toEqual({ title: 'Plan', body, version: 1 });
  });

  it('refuses an owner that does not exist', () => {
    expect(() => notes.create({ ownerId: 'no-such-user', title: 'x', body: '' })).toThrow(
      /FOREIGN KEY/,
    );
  });

  it('is deleted with its owner', () => {
    notes.create({ ownerId: owner.id, title: 'Plan', body: '' });
    notes.create({ ownerId: owner.id, title: 'More', body: '' });

    users.delete(owner.id);

    expect(db.prepare('SELECT COUNT(*) AS n FROM notes').get()).toEqual({ n: 0 });
  });

  it('keeps the body as the last column', () => {
    const columns = db.prepare('PRAGMA table_info(notes)').all() as { name: string }[];

    expect(columns.at(-1)?.name).toBe('body');
  });

  it('serves "my notes, newest edit first" from the owner index without a sort step', () => {
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id, title
         FROM notes
         WHERE owner_id = ?
         ORDER BY updated_at DESC, id DESC
         LIMIT 20`,
      )
      .all(owner.id) as { detail: string }[];
    const text = plan.map((row) => row.detail).join(' ');

    expect(text).toContain('USING INDEX notes_owner_updated');
    expect(text).not.toContain('TEMP B-TREE');
  });
});
