import { createPasswordHasher, DEFAULT_COST } from './passwords';

const hasher = createPasswordHasher({ N: 16, r: 1, p: 1 });

describe('password hasher', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hasher.hash('correct horse battery');

    expect(await hasher.verify('correct horse battery', stored)).toBe(true);
    expect(await hasher.verify('correct horse batterz', stored)).toBe(false);
  });

  it('never stores the password itself', async () => {
    const stored = await hasher.hash('correct horse battery');

    expect(stored).not.toContain('correct horse battery');
    expect(stored).toMatch(/^scrypt\$16\$1\$1\$/);
  });

  it('salts every hash, so equal passwords hash differently', async () => {
    const [a, b] = await Promise.all([hasher.hash('same password'), hasher.hash('same password')]);

    expect(a).not.toBe(b);
  });

  it('treats equivalent Unicode spellings of a password as the same', async () => {
    const stored = await hasher.hash('café au lait');

    expect(await hasher.verify('café au lait', stored)).toBe(true);
  });

  it('verifies against the cost recorded in the hash, not the current setting', async () => {
    const stored = await hasher.hash('correct horse battery');

    expect(await createPasswordHasher(DEFAULT_COST).verify('correct horse battery', stored)).toBe(
      true,
    );
  });

  it.each([
    ['no stored hash', undefined],
    ['an empty hash', ''],
    ['a hash from another scheme', 'bcrypt$10$abc$def'],
    ['a hash with extra parts', 'scrypt$16$1$1$aaa$bbb$ccc'],
  ])('rejects %s', async (_label, stored) => {
    expect(await hasher.verify('correct horse battery', stored)).toBe(false);
  });

  it('uses the production cost by default', () => {
    expect(DEFAULT_COST).toEqual({ N: 32768, r: 8, p: 3 });
  });
});
