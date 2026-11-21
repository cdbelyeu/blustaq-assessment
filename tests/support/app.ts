import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createPasswordHasher } from '../../src/auth/passwords';
import { openDatabase, type Db } from '../../src/db/database';
import { silentLogger } from './logs';

// Same hashing code as production with the cost turned right down, so tests stay fast.
const cheapHasher = createPasswordHasher({ N: 16, r: 1, p: 1 });

export const PASSWORD = 'correct horse battery';

export interface TestClock {
  now: () => Date;
  advanceMinutes: (minutes: number) => void;
}

export function createTestClock(start = new Date('2026-01-01T00:00:00.000Z')): TestClock {
  let time = start.getTime();
  return {
    now: () => new Date(time),
    advanceMinutes: (minutes) => {
      time += minutes * 60_000;
    },
  };
}

export interface SignedUpUser {
  id: string;
  email: string;
  token: string;
}

export interface TestApp {
  app: Express;
  db: Db;
  clock: TestClock;
  signUp: (email?: string, displayName?: string) => Promise<SignedUpUser>;
  signIn: (email: string, password?: string) => Promise<string>;
}

export function createTestApp(sessionTtlMinutes = 30): TestApp {
  const db = openDatabase(':memory:');
  const clock = createTestClock();
  const app = createApp({
    db,
    logger: silentLogger(),
    clock: clock.now,
    passwordHasher: cheapHasher,
    sessionTtlMinutes,
  });

  const signIn: TestApp['signIn'] = async (email, password = PASSWORD) => {
    const res = await request(app).post('/sessions').send({ email, password });
    return (res.body as { token: string }).token;
  };

  const signUp: TestApp['signUp'] = async (email = 'ada@example.com', displayName = 'Ada') => {
    const res = await request(app).post('/users').send({ email, displayName, password: PASSWORD });
    const { id } = res.body as { id: string };
    return { id, email, token: await signIn(email) };
  };

  return { app, db, clock, signUp, signIn };
}

export const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];
