import { openDatabase, type Db } from './database';
import { createSessionRepository, type SessionRepository } from './sessions';
import { createUserRepository, type User, type UserRepository } from './users';

describe('session repository', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const minutesAfter = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

  let db: Db;
  let users: UserRepository;
  let sessions: SessionRepository;
  let user: User;

  beforeEach(() => {
    db = openDatabase(':memory:');
    users = createUserRepository(db);
    sessions = createSessionRepository(db);
    user = users.create({ email: 'ada@example.com', displayName: 'Ada', passwordHash: 'h' });
    sessions.create({
      tokenHash: 'abc',
      userId: user.id,
      createdAt: start,
      expiresAt: minutesAfter(30),
    });
  });

  afterEach(() => db.close());

  it('finds the user behind a live session', () => {
    expect(sessions.findUser('abc', minutesAfter(1))).toEqual(user);
  });

  it('finds nothing for an unknown token', () => {
    expect(sessions.findUser('nope', minutesAfter(1))).toBeUndefined();
  });

  it('stops finding a session at the moment it expires', () => {
    expect(sessions.findUser('abc', minutesAfter(30))).toBeUndefined();
    expect(sessions.findUser('abc', minutesAfter(29.99))).toEqual(user);
  });

  it('keeps expired sessions in the table', () => {
    sessions.findUser('abc', minutesAfter(60));

    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
  });

  it('deletes a session', () => {
    sessions.delete('abc');

    expect(sessions.findUser('abc', minutesAfter(1))).toBeUndefined();
  });

  it('is removed with its user', () => {
    users.delete(user.id);

    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  });
});
