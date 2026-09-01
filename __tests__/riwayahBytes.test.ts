/**
 * What a muṣḥaf costs the reader, in the units the screen claims.
 *
 * "Manage downloads" reported the Warsh text as 829 KB when the files on
 * disk came to about 1.4 MB, because the size was `String.length` — UTF-16
 * code units — and an Arabic muṣḥaf is almost entirely three-byte
 * characters that count as one unit each. A screen whose whole job is to
 * tell someone what they can free up has to be right about it.
 *
 * Counted by hand because Hermes has no `TextEncoder`; `hermesGlobals`
 * pins that. Node's Buffer is used HERE only as the independent answer to
 * check against — it is not available to the app.
 */
import { utf8Length } from '../src/quran/riwayahStore';

const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

describe('measuring a muṣḥaf', () => {
  it('counts ASCII as one byte a character', () => {
    expect(utf8Length('')).toBe(0);
    expect(utf8Length('pages.json')).toBe(10);
    expect(utf8Length('{"1:1":"x"}')).toBe(11);
  });

  it('counts Qur’anic Arabic as two bytes a character, not one', () => {
    // U+0628 ba, U+064E fatha, U+0651 shadda — letters and marks alike
    // sit in U+0600–U+06FF, one UTF-16 unit and two UTF-8 bytes.
    const word = '\u0628\u064E\u0651';
    expect(word.length).toBe(3);
    expect(utf8Length(word)).toBe(6);
    expect(utf8Length(word)).toBe(bytes(word));
  });

  it('counts three bytes above the two-byte range', () => {
    // U+FDFD, the basmalah ligature, and U+06DE's neighbourhood is not
    // the only thing a muṣḥaf carries.
    expect(utf8Length('\uFDFD')).toBe(3);
    expect(utf8Length('\uFDFD')).toBe(bytes('\uFDFD'));
  });

  it('counts two-byte characters as two', () => {
    // U+00E9 é, U+0416 Ж — both above ASCII and below the 0x800 line.
    expect(utf8Length('éЖ')).toBe(4);
    expect(utf8Length('éЖ')).toBe(bytes('éЖ'));
  });

  it('counts a surrogate pair as one four-byte character', () => {
    const pair = '🔖'; // U+1F516
    expect(pair.length).toBe(2);
    expect(utf8Length(pair)).toBe(4);
    expect(utf8Length(pair)).toBe(bytes(pair));
  });

  it('does not fall over on a lone surrogate', () => {
    // Truncated data should still produce a number, not a crash.
    expect(utf8Length('\uD83D')).toBe(3);
    expect(utf8Length('a\uDC16b')).toBe(5);
  });

  it('agrees with the platform on a realistic muṣḥaf blob', () => {
    // A stand-in for text.json: keys in ASCII, values fully vocalised.
    const map: Record<string, string> = {};
    for (let i = 1; i <= 200; i++) {
      map[`2:${i}`] =
        'بِسْمِ ٱللَّهِ ' +
        'ٱلرَّحْمَٰنِ';
    }
    const blob = JSON.stringify(map);
    expect(utf8Length(blob)).toBe(bytes(blob));
    // And the point of the exercise: it is well clear of the code-unit
    // count the screen used to show.
    expect(utf8Length(blob)).toBeGreaterThan(blob.length * 1.5);
  });
});
