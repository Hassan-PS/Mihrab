/**
 * The pairing code, which is the whole trust model in one string.
 *
 * Worth testing hard: it is the only thing standing between "these two
 * devices are mine" and "this device is someone else's". A code that decodes
 * to the wrong key silently is the failure that matters, so most of what is
 * below is about refusing rather than accepting.
 */
import {
  CODE_PREFIX,
  KEY_BYTES,
  decode,
  encode,
  isValid,
  normalize,
} from '../src/sync/pairingCode';

function keyOf(seed: number): Uint8Array {
  const out = new Uint8Array(KEY_BYTES);
  for (let i = 0; i < KEY_BYTES; i++) out[i] = (seed + i * 31) & 0xff;
  return out;
}

describe('encoding', () => {
  it('round-trips every byte of the key', () => {
    for (const seed of [0, 1, 7, 128, 254]) {
      const key = keyOf(seed);
      const result = decode(encode(key));
      expect(result.ok).toBe(true);
      if (result.ok) expect(Array.from(result.key)).toEqual(Array.from(key));
    }
  });

  it('survives a key that is all zeroes and one that is all ones', () => {
    for (const fill of [0x00, 0xff]) {
      const key = new Uint8Array(KEY_BYTES).fill(fill);
      const result = decode(encode(key));
      expect(result.ok).toBe(true);
      if (result.ok) expect(Array.from(result.key)).toEqual(Array.from(key));
    }
  });

  it('is grouped, prefixed and free of the ambiguous letters', () => {
    const code = encode(keyOf(3));
    expect(code.startsWith(`${CODE_PREFIX}-`)).toBe(true);
    // I, L, O and U are the ones people confuse with 1, 1, 0 and each other.
    expect(code.replace(/-/g, '')).not.toMatch(/[ILOU]/);
    expect(code.split('-').slice(1).every(g => g.length === 6)).toBe(true);
  });

  it('refuses to encode anything that is not a key', () => {
    expect(() => encode(new Uint8Array(16))).toThrow();
    expect(() => encode(new Uint8Array(33))).toThrow();
  });
});

describe('what a user will actually paste', () => {
  const key = keyOf(11);
  const code = encode(key);

  it.each([
    ['as shown', code],
    ['lower case', code.toLowerCase()],
    ['no hyphens', code.replace(/-/g, '')],
    ['spaces instead of hyphens', code.replace(/-/g, ' ')],
    ['wrapped in whitespace', `\n  ${code}\t`],
    ['without the prefix', code.slice(CODE_PREFIX.length + 1)],
  ])('accepts it %s', (_label, input) => {
    const result = decode(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Array.from(result.key)).toEqual(Array.from(key));
  });

  it('reads O as 0 and I or L as 1, which is what Crockford is for', () => {
    const body = code.replace(/-/g, '').slice(CODE_PREFIX.length);
    // Round-trip through the confusable characters and back.
    const confused = body.replace(/0/g, 'O').replace(/1/g, 'l');
    expect(normalize(confused)).toBe(normalize(body));
  });
});

describe('refusing, and saying why', () => {
  const code = encode(keyOf(5));

  it('reports an empty field as empty rather than invalid', () => {
    expect(decode('')).toEqual({ ok: false, reason: 'empty' });
    expect(decode('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports a string that is not a code at all', () => {
    // `U` is the one letter Crockford leaves out that normalization does NOT
    // map onto something else, so it is the honest test of "not our alphabet".
    // "hello there" is a poor one: every letter in it either survives or maps
    // to a digit, so it fails on length, which is the correct answer for a
    // string that looks like a truncated code.
    expect(decode('UUUU')).toEqual({ ok: false, reason: 'bad-characters' });
    expect(decode('hello there')).toEqual({
      ok: false,
      reason: 'wrong-length',
    });
  });

  it('reports a truncated paste as a length problem, not a typo', () => {
    expect(decode(code.slice(0, 30))).toEqual({
      ok: false,
      reason: 'wrong-length',
    });
  });

  it('catches a single mistyped character', () => {
    const body = code.replace(/-/g, '').slice(CODE_PREFIX.length);
    let caught = 0;
    for (let i = 0; i < body.length; i++) {
      const wrong = body[i] === '2' ? '3' : '2';
      const typo = body.slice(0, i) + wrong + body.slice(i + 1);
      const result = decode(typo);
      if (!result.ok && result.reason === 'checksum') caught++;
      // The one thing that must never happen: a typo that decodes cleanly to
      // a DIFFERENT key, pairing the user with a device that is not theirs.
      expect(result.ok).toBe(false);
    }
    expect(caught).toBe(body.length);
  });

  it('catches two adjacent characters swapped', () => {
    const body = code.replace(/-/g, '').slice(CODE_PREFIX.length);
    let checked = 0;
    for (let i = 0; i < body.length - 1; i++) {
      if (body[i] === body[i + 1]) continue;
      const swapped =
        body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2);
      expect(decode(swapped).ok).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('isValid agrees with decode', () => {
    expect(isValid(code)).toBe(true);
    expect(isValid('nope')).toBe(false);
  });
});
