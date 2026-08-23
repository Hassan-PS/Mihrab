/**
 * UTF-8 by hand, checked against node's — which is the implementation we are
 * not allowed to use on a device but are perfectly entitled to test against.
 */
import { utf8Decode, utf8Encode } from '../src/sync/secureRandom';

const SAMPLES = [
  '',
  'Fajr',
  'missed fajr, overslept',
  'Öğle', // Turkish, two-byte
  'صلاة الفجر', // Arabic
  'बुकमार्क', // Devanagari
  '晨礼', // three-byte
  '🕌🤲🏽', // four-byte, and a skin-tone modifier
  'mixed: Fajr صلاة 晨礼 🕌 done',
  JSON.stringify({ note: 'på moskén — kl. 05:15 🕌' }),
];

describe('round trip', () => {
  it.each(SAMPLES)('survives %p', text => {
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });

  it('produces exactly the bytes node produces', () => {
    for (const text of SAMPLES) {
      expect(Array.from(utf8Encode(text))).toEqual(
        Array.from(Buffer.from(text, 'utf8')),
      );
    }
  });

  it('reads exactly what node reads', () => {
    for (const text of SAMPLES) {
      expect(utf8Decode(new Uint8Array(Buffer.from(text, 'utf8')))).toBe(text);
    }
  });

  it('handles a payload the size of a real snapshot', () => {
    const big = JSON.stringify(
      Array.from({ length: 5000 }, (_, i) => ({
        date: '2026-08-23',
        note: `يوم ${i} — at the masjid 🕌`,
      })),
    );
    expect(utf8Decode(utf8Encode(big))).toBe(big);
  });
});

describe('malformed input', () => {
  it('replaces a lone surrogate rather than throwing', () => {
    // A snapshot that fails to seal is worse than one carrying a U+FFFD in
    // a note the user typed on a keyboard that produced half a pair.
    const lone = 'note \ud800 here';
    expect(() => utf8Encode(lone)).not.toThrow();
    expect(utf8Decode(utf8Encode(lone))).toBe('note � here');
  });

  it('replaces a truncated sequence rather than throwing', () => {
    // Only reachable after secretbox has authenticated the payload, so this
    // means a bug rather than an attacker — and losing one character beats
    // losing the whole snapshot.
    expect(utf8Decode(Uint8Array.from([0xe6, 0x99]))).toBe('�');
    expect(utf8Decode(Uint8Array.from([0x41, 0xff, 0x42]))).toBe('A�B');
  });

  it('rejects an over-long encoding of ASCII', () => {
    // 0xC0 0x81 is a non-shortest form of U+0001; decoders that accept it
    // have historically been a security problem.
    expect(utf8Decode(Uint8Array.from([0xc0, 0x81]))).toBe('��');
  });
});
