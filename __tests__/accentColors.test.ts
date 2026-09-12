/**
 * Custom accent colours — the shelf, and the maths the picker draws with.
 *
 * The picker itself is a drag surface over two SVG gradients and is not
 * worth a render harness; everything that can actually be wrong is in
 * here, pure, and that is where it is pinned. The cases that matter are
 * the ones where a colour is nearly right: a three-digit hex, a grey with
 * no hue, a duplicate saved twice, and a blob from a future build.
 */
import {
  ACCENT_MIN_CONTRAST,
  accentLegibility,
  addSavedAccent,
  coerceSavedAccents,
  contrast,
  hexToHsv,
  hsvToHex,
  HUE_STOPS,
  MAX_SAVED_ACCENTS,
  normaliseHex,
  removeSavedAccent,
} from '../src/settings/accentColors';

describe('reading a colour a person typed', () => {
  it('takes six digits, with or without the hash, in any case', () => {
    expect(normaliseHex('#22c55e')).toBe('#22C55E');
    expect(normaliseHex('22C55E')).toBe('#22C55E');
    expect(normaliseHex('  #22c55e  ')).toBe('#22C55E');
  });

  it('expands the three-digit shorthand', () => {
    // People type it, and a picker that rejects #f0a looks broken.
    expect(normaliseHex('#f0a')).toBe('#FF00AA');
    expect(normaliseHex('abc')).toBe('#AABBCC');
  });

  it('refuses anything else rather than guessing', () => {
    for (const bad of ['', '#', 'blue', '#12345', '#1234567', '#gggggg', '12 34 56']) {
      expect(normaliseHex(bad)).toBeNull();
    }
  });
});

describe('hsv round trip', () => {
  it('survives a round trip for the colours the app ships', () => {
    for (const hex of ['#1F5F4A', '#0D9488', '#2563EB', '#B45309', '#9F2D4D', '#5B4B9E']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('survives the corners', () => {
    for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('reports no hue for a grey, and no saturation', () => {
    // The picker relies on this to know when NOT to move the hue strip:
    // snapping to red because somebody typed #888888 loses where they were.
    const grey = hexToHsv('#888888');
    expect(grey.s).toBe(0);
    expect(grey.h).toBe(0);
  });

  it('clamps rather than wrapping into nonsense', () => {
    expect(hsvToHex({ h: 400, s: 2, v: 2 })).toBe(hsvToHex({ h: 40, s: 1, v: 1 }));
    expect(hsvToHex({ h: -60, s: -1, v: 0.5 })).toBe('#808080');
  });

  it('draws a hue strip that starts and ends on red', () => {
    expect(HUE_STOPS[0]).toBe('#FF0000');
    expect(HUE_STOPS[HUE_STOPS.length - 1]).toBe('#FF0000');
    expect(HUE_STOPS).toHaveLength(7);
  });
});

describe('the shelf', () => {
  it('puts the newest first', () => {
    let list: string[] = [];
    list = addSavedAccent(list, '#111111');
    list = addSavedAccent(list, '#222222');
    expect(list).toEqual(['#222222', '#111111']);
  });

  it('moves a colour saved twice rather than keeping two of it', () => {
    // The list is a history of choices, and a colour chosen twice is one
    // colour chosen recently.
    let list = ['#111111', '#222222', '#333333'];
    list = addSavedAccent(list, '#333333');
    expect(list).toEqual(['#333333', '#111111', '#222222']);
  });

  it('treats case and shorthand as the same colour', () => {
    let list = addSavedAccent([], '#aabbcc');
    list = addSavedAccent(list, '#ABC');
    expect(list).toEqual(['#AABBCC']);
  });

  it('drops the oldest at the cap instead of refusing', () => {
    // Nobody is asked to delete something before they can save something.
    let list: string[] = [];
    for (let i = 0; i < MAX_SAVED_ACCENTS + 3; i += 1) {
      list = addSavedAccent(list, `#${i.toString(16).padStart(6, '0')}`);
    }
    expect(list).toHaveLength(MAX_SAVED_ACCENTS);
    expect(list[0]).toBe('#00000E');
  });

  it('ignores a colour it cannot read', () => {
    expect(addSavedAccent(['#111111'], 'blue')).toEqual(['#111111']);
  });

  it('removes by value, whatever spelling is handed to it', () => {
    expect(removeSavedAccent(['#AABBCC', '#111111'], '#abc')).toEqual(['#111111']);
    expect(removeSavedAccent(['#AABBCC'], 'nonsense')).toEqual(['#AABBCC']);
  });
});

describe('what survives a load from disk', () => {
  it('is an empty shelf for every blob written before it existed', () => {
    expect(coerceSavedAccents(undefined)).toEqual([]);
    expect(coerceSavedAccents(null)).toEqual([]);
    expect(coerceSavedAccents('#ffffff')).toEqual([]);
  });

  it('drops what it cannot read and keeps the rest', () => {
    expect(coerceSavedAccents(['#112233', 42, null, 'blue', '#abc'])).toEqual([
      '#112233',
      '#AABBCC',
    ]);
  });

  it('collapses duplicates and applies the cap last', () => {
    const many = Array.from({ length: MAX_SAVED_ACCENTS + 5 }, (_, i) =>
      `#${i.toString(16).padStart(6, '0')}`,
    );
    expect(coerceSavedAccents([...many, ...many])).toHaveLength(MAX_SAVED_ACCENTS);
  });
});

describe('warning about a colour that will not read', () => {
  const LIGHT = '#FAF7F2';
  const DARK = '#141210';

  it('passes the app default on the ground it was tuned for', () => {
    expect(accentLegibility('#1F5F4A', LIGHT).ok).toBe(true);
  });

  it('fails the SAME colour on the other ground — which is the point', () => {
    // The deep emerald reads 7.03:1 on warm paper and 2.49:1 on the night
    // ground. That is why every preset ships two values, and why this
    // check asks about one ground rather than both: a verdict against
    // both would flag the app's own default accent, and a warning that
    // fires for almost everything teaches people to ignore warnings.
    const onDark = accentLegibility('#1F5F4A', DARK);
    expect(onDark.ok).toBe(false);
    expect(onDark.ratio).toBeLessThan(ACCENT_MIN_CONTRAST);
    // …and the preset's own dark variant is fine there, as designed.
    expect(accentLegibility('#46A081', DARK).ok).toBe(true);
  });

  it('fails a pale colour on paper and passes it at night', () => {
    expect(accentLegibility('#FFFDF0', LIGHT).ok).toBe(false);
    expect(accentLegibility('#FFFDF0', DARK).ok).toBe(true);
  });

  it('agrees with the contrast maths everywhere else uses', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(contrast('#888888', '#888888')).toBeCloseTo(1, 5);
  });
});
