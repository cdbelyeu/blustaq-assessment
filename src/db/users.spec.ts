import { openDatabase, type Db } from './database';
import { createUserRepository, EmailTakenError, type UserRepository } from './users';

describe('user repository', () => {
  let db: Db;
  let users: UserRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    users = createUserRepository(db);
  });

  afterEach(() => db.close());

  it('creates a user with an id and matching timestamps', () => {
    const user = users.create({ email: 'ada@example.com', displayName: 'Ada' });

    expect(user).toMatchObject({ email: 'ada@example.com', displayName: 'Ada' });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.createdAt).toBe(user.updatedAt);
    expect(users.findById(user.id)).toEqual(user);
  });

  it('returns undefined for an unknown id', () => {
    expect(users.findById('missing')).toBeUndefined();
  });

  it('rejects a duplicate email', () => {
    users.create({ email: 'ada@example.com', displayName: 'Ada' });

    expect(() => users.create({ email: 'ada@example.com', displayName: 'Other' })).toThrow(
      EmailTakenError,
    );
  });

  it('updates only the fields given and stores the change', () => {
    const user = users.create({ email: 'ada@example.com', displayName: 'Ada' });

    const updated = users.update(user, { displayName: 'Ada L' });

    expect(updated).toMatchObject({ email: 'ada@example.com', displayName: 'Ada L' });
    expect(users.findById(user.id)).toEqual(updated);
  });

  it('rejects changing an email to one that is taken', () => {
    users.create({ email: 'ada@example.com', displayName: 'Ada' });
    const grace = users.create({ email: 'grace@example.com', displayName: 'Grace' });

    expect(() => users.update(grace, { email: 'ada@example.com' })).toThrow(EmailTakenError);
  });

  it('rethrows unexpected database errors', () => {
    const user = users.create({ email: 'ada@example.com', displayName: 'Ada' });
    db.close();

    expect(() => users.update(user, { displayName: 'x' })).toThrow(/not open/);
    expect(() => users.create({ email: 'b@example.com', displayName: 'B' })).toThrow(/not open/);
  });

  it('deletes a user', () => {
    const user = users.create({ email: 'ada@example.com', displayName: 'Ada' });

    users.delete(user.id);

    expect(users.findById(user.id)).toBeUndefined();
  });
});
