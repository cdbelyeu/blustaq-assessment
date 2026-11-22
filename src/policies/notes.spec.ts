import type { Note } from '../db/notes';
import type { User } from '../db/users';
import { canDelete, canEdit, canRead } from './notes';

const user = (id: string): User => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  createdAt: 'then',
  updatedAt: 'then',
});

const note = (ownerId: string | null): Note => ({
  id: 'n1',
  ownerId,
  title: 'Plan',
  body: '',
  version: 1,
  createdAt: 'then',
  updatedAt: 'then',
});

describe('note access policy', () => {
  it('lets the owner read their note', () => {
    expect(canRead(user('ada'), note('ada'))).toBe(true);
  });

  it("does not let anyone else read someone's note", () => {
    expect(canRead(user('grace'), note('ada'))).toBe(false);
  });

  it('does not let anyone read a note with no owner', () => {
    expect(canRead(user('ada'), note(null))).toBe(false);
  });
});

describe('note edit policy', () => {
  it('lets the owner edit their note', () => {
    expect(canEdit(user('ada'), note('ada'))).toBe(true);
  });

  it("does not let anyone else edit someone's note", () => {
    expect(canEdit(user('grace'), note('ada'))).toBe(false);
  });

  it('does not let anyone edit a note with no owner', () => {
    expect(canEdit(user('ada'), note(null))).toBe(false);
  });
});

describe('note delete policy', () => {
  it('lets the owner delete their note', () => {
    expect(canDelete(user('ada'), note('ada'))).toBe(true);
  });

  it("does not let anyone else delete someone's note", () => {
    expect(canDelete(user('grace'), note('ada'))).toBe(false);
  });

  it('does not let anyone delete a note with no owner', () => {
    expect(canDelete(user('ada'), note(null))).toBe(false);
  });
});
