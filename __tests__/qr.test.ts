/**
 * The QR encoder, checked module for module against a different one.
 *
 * A hand-written encoder is only worth having if it is right, and "the
 * picture looks like a QR code" is not evidence — a wrong Reed-Solomon
 * block, a mask off by one or a transposed placement all produce something
 * that looks exactly like a QR code and scans as nothing. So the fixtures in
 * `fixtures/qrReference.ts` come from the `qrcode` npm package, which this
 * app does not depend on, and every module is compared.
 */
import {
  encodeQr,
  encodeQrWithMask,
  isAlphanumeric,
  QrNotAlphanumeric,
  QrTooLong,
} from '../src/sync/qr';
import { QR_REFERENCE } from './fixtures/qrReference';
import { encode } from '../src/sync/pairingCode';

/** The matrix as the fixtures write it, so a failure prints a readable diff. */
function draw(modules: boolean[][]): string[] {
  return modules.map(row => row.map(dark => (dark ? '#' : '.')).join(''));
}

describe('against an independent encoder', () => {
  it.each(QR_REFERENCE)(
    'reproduces $name exactly, version and mask included',
    reference => {
      const code = encodeQr(reference.text);
      expect(code.version).toBe(reference.version);
      expect(code.size).toBe(reference.rows.length);
      // The mask is a quality heuristic rather than a correctness property —
      // all eight scan, because the number is in the format bits. It is
      // pinned anyway: a change to the penalty rules should be a decision
      // somebody made, not something that drifts.
      expect(code.mask).toBe(reference.mask);
      expect(draw(code.modules)).toEqual(reference.rows);
    },
  );

  it('produces the same modules when told which mask to use', () => {
    for (const reference of QR_REFERENCE) {
      const code = encodeQrWithMask(reference.text, reference.mask);
      expect(draw(code.modules)).toEqual(reference.rows);
    }
  });
});

describe('the shape of the thing', () => {
  const code = encodeQr(QR_REFERENCE[2].text);

  it('is square, with the side the version implies', () => {
    expect(code.size).toBe(code.version * 4 + 17);
    expect(code.modules).toHaveLength(code.size);
    for (const row of code.modules) expect(row).toHaveLength(code.size);
  });

  it('has three finders and the dark module every valid symbol has', () => {
    const finder = (cx: number, cy: number) => {
      // Centre dark, ring light, ring dark: the 1:1:3:1:1 core.
      expect(code.modules[cy][cx]).toBe(true);
      expect(code.modules[cy - 2][cx]).toBe(false);
      expect(code.modules[cy - 3][cx]).toBe(true);
    };
    finder(3, 3);
    finder(code.size - 4, 3);
    finder(3, code.size - 4);
    expect(code.modules[code.size - 8][8]).toBe(true);
  });

  it('has the timing pattern running between the finders', () => {
    for (let i = 8; i < code.size - 8; i++) {
      expect(code.modules[6][i]).toBe(i % 2 === 0);
      expect(code.modules[i][6]).toBe(i % 2 === 0);
    }
  });
});

describe('what it refuses', () => {
  it('takes every character a pairing code can contain', () => {
    // Not a claim about QR in general — a claim about this app's one input.
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) key[i] = i * 11 + 1;
    const code = encode(key);
    expect(isAlphanumeric(code)).toBe(true);
    expect(() => encodeQr(code)).not.toThrow();
  });

  it('throws on lowercase rather than quietly changing the payload', () => {
    // Upper-casing here would produce a QR that scans to something the user
    // did not give us, and they would have no way to notice.
    expect(() => encodeQr('mhrb-abcdef')).toThrow(QrNotAlphanumeric);
    expect(isAlphanumeric('mhrb')).toBe(false);
  });

  it('throws on characters outside the alphanumeric set', () => {
    expect(() => encodeQr('MHRB_ABC')).toThrow(QrNotAlphanumeric);
    expect(() => encodeQr('MHRB-ÅÄÖ')).toThrow(QrNotAlphanumeric);
  });

  it('throws rather than truncating past what version 6 carries', () => {
    expect(() => encodeQr('A'.repeat(154))).not.toThrow();
    expect(() => encodeQr('A'.repeat(155))).toThrow(QrTooLong);
  });
});

describe('version selection', () => {
  it.each([
    [20, 1],
    [21, 2],
    [38, 2],
    [39, 3],
    [61, 3],
    [62, 4],
    [90, 4],
    [91, 5],
    [122, 5],
    [123, 6],
    [154, 6],
  ])('puts %i characters in version %i', (length, version) => {
    // The alphanumeric capacities at level M, straight from the standard.
    // Getting one of these wrong makes an over-full symbol that still draws.
    expect(encodeQr('A'.repeat(length)).version).toBe(version);
  });

  it('puts a real pairing code in version 4', () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) key[i] = 200 - i * 5;
    expect(encodeQr(encode(key)).version).toBe(4);
  });
});
