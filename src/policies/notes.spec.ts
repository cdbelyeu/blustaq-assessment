import type { Note } from '../db/notes';
import type { User } from '../db/users';
import { canRead } from './notes';

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
