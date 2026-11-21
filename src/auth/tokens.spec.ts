import { generateToken, hashToken } from './tokens';

describe('session tokens', () => {
  it('generates a url-safe token carrying 256 bits', () => {
    const token = generateToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));

    expect(tokens.size).toBe(1000);
  });

  it('hashes deterministically to something that is not the token', () => {
    const token = generateToken();

    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });
});
