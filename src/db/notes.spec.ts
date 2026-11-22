import { openDatabase, type Db } from './database';
import {
  createNoteRepository,
  LIST_NOTES_AFTER,
  LIST_NOTES_FIRST_PAGE,
  type NoteRepository,
  VersionConflictError,
} from './notes';
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

  describe('findById', () => {
    it('returns the whole note, body included', () => {
      const created = notes.create({ ownerId: owner.id, title: 'Plan', body: '# Plan' });

      expect(notes.findById(created.id)).toEqual(created);
    });

    it('returns undefined for an unknown id', () => {
      expect(notes.findById('missing')).toBeUndefined();
    });

    it('reports a note with no owner as having none', () => {
      db.prepare(
        `INSERT INTO notes (id, owner_id, title, created_at, updated_at, body)
         VALUES ('orphan', NULL, 'Orphan', 'then', 'then', '')`,
      ).run();

      expect(notes.findById('orphan')?.ownerId).toBeNull();
    });
  });

  describe('listByOwner', () => {
    const setUpdatedAt = (id: string, updatedAt: string) =>
      db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(updatedAt, id);

    it('lists newest edit first, leaving the body out', () => {
      const a = notes.create({ ownerId: owner.id, title: 'A', body: 'large body' });
      const b = notes.create({ ownerId: owner.id, title: 'B', body: 'large body' });
      setUpdatedAt(a.id, '2026-01-01T00:00:00.000Z');
      setUpdatedAt(b.id, '2026-01-02T00:00:00.000Z');

      const { items, next } = notes.listByOwner(owner.id, 10);

      expect(items.map((n) => n.title)).toEqual(['B', 'A']);
      expect(items[0]).not.toHaveProperty('body');
      expect(next).toBeUndefined();
    });

    it('breaks ties on the id, highest first', () => {
      const made = [1, 2, 3].map((n) =>
        notes.create({ ownerId: owner.id, title: `${n}`, body: '' }),
      );
      made.forEach((n) => setUpdatedAt(n.id, '2026-01-01T00:00:00.000Z'));

      const ids = notes.listByOwner(owner.id, 10).items.map((n) => n.id);

      expect(ids).toEqual(
        made
          .map((n) => n.id)
          .sort()
          .reverse(),
      );
    });

    it('pages without gaps or repeats, even when timestamps tie', () => {
      const made = Array.from({ length: 7 }, (_, n) =>
        notes.create({ ownerId: owner.id, title: `${n}`, body: '' }),
      );
      made.forEach((n) => setUpdatedAt(n.id, '2026-01-01T00:00:00.000Z'));

      const seen: string[] = [];
      let after;
      do {
        const page = notes.listByOwner(owner.id, 3, after);
        seen.push(...page.items.map((n) => n.id));
        after = page.next;
      } while (after);

      expect(seen).toEqual(
        made
          .map((n) => n.id)
          .sort()
          .reverse(),
      );
    });

    it('reports a next page only when more notes exist', () => {
      notes.create({ ownerId: owner.id, title: 'A', body: '' });
      notes.create({ ownerId: owner.id, title: 'B', body: '' });

      expect(notes.listByOwner(owner.id, 2).next).toBeUndefined();
      expect(notes.listByOwner(owner.id, 1).next).toBeDefined();
    });

    it("lists only the owner's notes", () => {
      const other = users.create({ email: 'g@example.com', displayName: 'G', passwordHash: 'h' });
      notes.create({ ownerId: owner.id, title: 'Mine', body: '' });
      notes.create({ ownerId: other.id, title: 'Theirs', body: '' });

      expect(notes.listByOwner(owner.id, 10).items.map((n) => n.title)).toEqual(['Mine']);
    });

    it.each([
      ['the first page', LIST_NOTES_FIRST_PAGE, (id: string) => [id, 21]],
      ['a later page', LIST_NOTES_AFTER, (id: string) => [id, '2026-01-01T00:00:00.000Z', 'x', 21]],
    ])('answers %s from the index with no sort step', (_label, sql, params) => {
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params(owner.id)) as {
        detail: string;
      }[];
      const text = plan.map((row) => row.detail).join(' ');

      expect(text).toContain('USING INDEX notes_owner_updated');
      expect(text).not.toContain('TEMP B-TREE');
    });
  });

  describe('update', () => {
    let now: Date;
    let editable: NoteRepository;

    beforeEach(() => {
      now = new Date('2026-01-01T00:00:00.000Z');
      editable = createNoteRepository(db, () => now);
    });

    const later = (minutes: number) => {
      now = new Date(now.getTime() + minutes * 60_000);
    };

    it('changes the title alone and keeps the body', () => {
      const note = editable.create({ ownerId: owner.id, title: 'Old', body: 'keep me' });
      later(5);

      const updated = editable.update(note, { title: 'New' }, note.version);

      expect(updated).toMatchObject({ title: 'New', body: 'keep me', version: 2 });
    });

    it('changes the body alone and keeps the title', () => {
      const note = editable.create({ ownerId: owner.id, title: 'Keep', body: 'old' });
      later(5);

      const updated = editable.update(note, { body: 'new' }, note.version);

      expect(updated).toMatchObject({ title: 'Keep', body: 'new', version: 2 });
    });

    it('can clear the body', () => {
      const note = editable.create({ ownerId: owner.id, title: 'T', body: 'text' });
      later(1);

      expect(editable.update(note, { body: '' }, note.version).body).toBe('');
    });

    it('raises the version by one and moves the edit time, but not the creation time', () => {
      const note = editable.create({ ownerId: owner.id, title: 'A', body: 'a' });
      later(5);

      const first = editable.update(note, { title: 'B' }, note.version);
      later(5);
      const second = editable.update(first, { title: 'C' }, first.version);

      expect([first.version, second.version]).toEqual([2, 3]);
      expect(first.updatedAt).toBe('2026-01-01T00:05:00.000Z');
      expect(second.updatedAt).toBe('2026-01-01T00:10:00.000Z');
      expect(second.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(second.ownerId).toBe(owner.id);
    });

    it('stores what it returns', () => {
      const note = editable.create({ ownerId: owner.id, title: 'A', body: 'a' });
      later(5);

      const updated = editable.update(note, { title: 'B', body: 'b' }, note.version);

      expect(editable.findById(note.id)).toEqual(updated);
    });

    it.each([
      ['nothing', {}],
      ['the same title', { title: 'Same' }],
      ['the same body', { body: 'text' }],
      ['both unchanged', { title: 'Same', body: 'text' }],
    ])('changes nothing when given %s', (_label, patch) => {
      const note = editable.create({ ownerId: owner.id, title: 'Same', body: 'text' });
      later(5);

      const result = editable.update(note, patch, note.version);

      expect(result).toEqual(note);
      expect(editable.findById(note.id)).toEqual(note);
    });

    it('raises the version once when one field changes and the other does not', () => {
      const note = editable.create({ ownerId: owner.id, title: 'Same', body: 'old' });
      later(5);

      const updated = editable.update(note, { title: 'Same', body: 'new' }, note.version);

      expect(updated.version).toBe(2);
    });

    it('refuses a change from an out-of-date version, and changes nothing', () => {
      const note = editable.create({ ownerId: owner.id, title: 'A', body: 'a' });
      later(1);
      const current = editable.update(note, { title: 'B' }, note.version);
      later(1);

      expect(() => editable.update(current, { title: 'C' }, 1)).toThrow(VersionConflictError);

      expect(editable.findById(note.id)).toEqual(current);
    });

    it('refuses an out-of-date version even when nothing would change', () => {
      const note = editable.create({ ownerId: owner.id, title: 'A', body: 'a' });
      later(1);
      const current = editable.update(note, { title: 'B' }, note.version);

      expect(() => editable.update(current, { title: 'B' }, 1)).toThrow(VersionConflictError);
    });

    it('refuses a version from the future', () => {
      const note = editable.create({ ownerId: owner.id, title: 'A', body: 'a' });

      expect(() => editable.update(note, { title: 'B' }, 2)).toThrow(VersionConflictError);
    });

    it('catches a stale copy even when the version it carries looks current', () => {
      const note = editable.create({ ownerId: owner.id, title: 'A', body: 'a' });
      later(1);
      editable.update(note, { title: 'B' }, note.version);
      later(1);

      // `note` is a stale copy: it still says version 1, but the stored note is at version 2.
      expect(() => editable.update(note, { title: 'C' }, note.version)).toThrow(
        VersionConflictError,
      );
      expect(editable.findById(note.id)).toMatchObject({ title: 'B', version: 2 });
    });

    it('moves an edited note to the top of the list', () => {
      const a = editable.create({ ownerId: owner.id, title: 'A', body: '' });
      later(1);
      editable.create({ ownerId: owner.id, title: 'B', body: '' });
      later(1);

      editable.update(a, { title: 'A edited' }, a.version);

      expect(editable.listByOwner(owner.id, 10).items.map((n) => n.title)).toEqual([
        'A edited',
        'B',
      ]);
    });
  });
});
