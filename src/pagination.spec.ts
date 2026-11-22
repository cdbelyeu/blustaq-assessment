import { ApiError } from './errors';
import { decodeCursor, encodeCursor } from './pagination';

const cursor = {
  updatedAt: '2026-01-01T00:30:00.000Z',
  id: '9b1f6c2e-47d3-4e0a-8c55-1d2a7e3b6f04',
};
const encode = (text: string) => Buffer.from(text).toString('base64url');

describe('page cursor', () => {
  it('survives a round trip', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('is a url-safe string', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['random bytes', 'AAAA////'],
    ['a missing id', encode('2026-01-01T00:30:00.000Z')],
    ['an empty id', encode('2026-01-01T00:30:00.000Z|')],
    ['extra parts', encode(`${cursor.updatedAt}|${cursor.id}|more`)],
    ['a bad timestamp', encode(`yesterday|${cursor.id}`)],
    ['a timestamp without milliseconds', encode(`2026-01-01T00:30:00Z|${cursor.id}`)],
    ['a bad id', encode(`${cursor.updatedAt}|not-a-uuid`)],
    ['an upper-case id', encode(`${cursor.updatedAt}|${cursor.id.toUpperCase()}`)],
  ])('rejects %s', (_label, value) => {
    expect(() => decodeCursor(value)).toThrow(ApiError);
    expect(() => decodeCursor(value)).toThrow('Cursor is invalid');
  });
});
