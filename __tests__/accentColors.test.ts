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
  accentMustBeDarker,
  addSavedAccent,
  coerceSavedAccents,
  constrainToLegible,
  contrast,
  hexToHsv,
  hsvToHex,
  HUE_STOPS,
  isLegibleAccent,
  legibleBoundary,
  legibleValueEdge,
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

describe('which colours the picker is allowed to offer', () => {
  const LIGHT = '#FAF7F2';
  const DARK = '#141210';

  it('knows which way the room is, on either ground', () => {
    expect(accentMustBeDarker(LIGHT)).toBe(true);
    expect(accentMustBeDarker(DARK)).toBe(false);
  });

  it('judges one ground, not both — which is the whole design', () => {
    // The deep emerald the app ships reads 7.03:1 on warm paper and
    // 2.49:1 on the night ground. A range that had to satisfy both would
    // exclude the app's own hand-tuned default, and nearly every other
    // sensible colour with it, because no single hex is a good accent on
    // both a near-white and a near-black.
    expect(isLegibleAccent('#1F5F4A', LIGHT)).toBe(true);
    expect(isLegibleAccent('#1F5F4A', DARK)).toBe(false);
    // …and the preset's own dark variant is fine there, as designed.
    expect(isLegibleAccent('#46A081', DARK)).toBe(true);
  });

  it('agrees with the contrast maths everywhere else uses', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(contrast('#888888', '#888888')).toBeCloseTo(1, 5);
  });

  describe('the crossing', () => {
    it('lands on the legible side of the floor, not a hair under it', () => {
      // The picker clamps TO this value, so a crossing that sat a
      // rounding error on the failing side would hand back exactly the
      // colours the range exists to exclude.
      for (let h = 0; h < 360; h += 15) {
        for (const s of [0, 0.25, 0.5, 0.75, 1]) {
          for (const ground of [LIGHT, DARK]) {
            const edge = legibleValueEdge(h, s, ground);
            if (edge === null) continue;
            expect(
              isLegibleAccent(hsvToHex({ h, s, v: edge }), ground),
            ).toBe(true);
          }
        }
      }
    });

    it('is a real edge — one step past it fails', () => {
      // Otherwise "the largest legible value" could be any legible value
      // and the veil would cover colours that were perfectly usable.
      const edge = legibleValueEdge(140, 0.8, LIGHT);
      expect(edge).not.toBeNull();
      expect(
        isLegibleAccent(hsvToHex({ h: 140, s: 0.8, v: (edge ?? 0) + 0.01 }), LIGHT),
      ).toBe(false);
    });

    it('reports a saturation where nothing works at all', () => {
      // On the night ground a fully saturated blue has no legible value:
      // #0000FF is the brightest blue there is and still reads 2.15:1.
      // That column of the square is unavailable, and saying so is what
      // lets the picker veil it rather than pretend.
      expect(contrast('#0000FF', DARK)).toBeLessThan(ACCENT_MIN_CONTRAST);
      expect(legibleValueEdge(240, 1, DARK)).toBeNull();
      // The same hue at the same saturation is fine on paper — it is the
      // ground that rules it out, not the colour.
      expect(legibleValueEdge(240, 1, LIGHT)).not.toBeNull();
    });

    it('always leaves greys available, on either ground', () => {
      // Saturation zero runs from black to white, so one end of it always
      // clears any sane floor. `constrainToLegible` relies on this to
      // terminate.
      expect(legibleValueEdge(0, 0, LIGHT)).not.toBeNull();
      expect(legibleValueEdge(0, 0, DARK)).not.toBeNull();
    });
  });

  describe('clamping a colour into range', () => {
    it('never hands back something unreadable', () => {
      // The property that matters: whatever the finger asks for, what
      // comes out is usable. This sweeps the whole square on both
      // grounds, which is the closest thing to dragging everywhere.
      for (let h = 0; h < 360; h += 10) {
        for (let si = 0; si <= 10; si += 1) {
          for (let vi = 0; vi <= 10; vi += 1) {
            for (const ground of [LIGHT, DARK]) {
              const out = constrainToLegible(
                { h, s: si / 10, v: vi / 10 },
                ground,
              );
              expect(isLegibleAccent(hsvToHex(out), ground)).toBe(true);
            }
          }
        }
      }
    });

    it('leaves a colour that already works exactly where it is', () => {
      const ok = hexToHsv('#1F5F4A');
      expect(constrainToLegible(ok, LIGHT)).toEqual(ok);
    });

    it('keeps the hue, always', () => {
      // Moving somebody's hue to make their colour legible answers a
      // question they did not ask. Value and saturation are fair game;
      // the hue is the choice.
      for (const ground of [LIGHT, DARK]) {
        for (let h = 0; h < 360; h += 30) {
          expect(constrainToLegible({ h, s: 1, v: 1 }, ground).h).toBe(h);
          expect(constrainToLegible({ h, s: 1, v: 0 }, ground).h).toBe(h);
        }
      }
    });

    it('only darkens on paper, and leaves saturation alone there', () => {
      // Black clears any floor against a light ground, so every column
      // has room below it and saturation never has to give.
      const asked = { h: 50, s: 1, v: 1 };
      const out = constrainToLegible(asked, LIGHT);
      expect(out.v).toBeLessThan(asked.v);
      expect(out.s).toBe(asked.s);
    });

    it('gives up saturation at night only when it has to', () => {
      // Blue at full saturation has nowhere to go on the night ground,
      // so it desaturates towards white — the nearest thing to what was
      // asked for that can actually be read.
      const out = constrainToLegible({ h: 240, s: 1, v: 1 }, DARK);
      expect(out.s).toBeLessThan(1);
      expect(isLegibleAccent(hsvToHex(out), DARK)).toBe(true);
      // Yellow at the same saturation is bright enough as it is.
      expect(constrainToLegible({ h: 60, s: 1, v: 1 }, DARK).s).toBe(1);
    });

    it('takes the most saturated column it can, not the first one', () => {
      // Desaturating all the way to grey would be legible and wrong: the
      // person asked for a blue.
      const out = constrainToLegible({ h: 240, s: 1, v: 1 }, DARK);
      expect(out.s).toBeGreaterThan(0.2);
    });
  });

  describe('the boundary the picker draws', () => {
    it('gives one sample per step, ends included', () => {
      const line = legibleBoundary(120, LIGHT, 5);
      expect(line).toHaveLength(5);
      // The ends are saturation 0 and 1, so the curve spans the square
      // rather than stopping short of its edges.
      expect(line[0]).toBe(legibleValueEdge(120, 0, LIGHT));
      expect(line[4]).toBe(legibleValueEdge(120, 1, LIGHT));
    });

    it('refuses to be drawn with fewer than two points', () => {
      // A single sample cannot describe a line, and dividing by
      // `samples - 1` would put the whole curve at zero.
      expect(legibleBoundary(120, LIGHT, 1)).toHaveLength(2);
    });

    it('marks the unusable columns rather than guessing a value', () => {
      const line = legibleBoundary(240, DARK, 16);
      expect(line.some(v => v === null)).toBe(true);
      // …and the low-saturation end is always usable.
      expect(line[0]).not.toBeNull();
    });
  });
});
