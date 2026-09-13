/**
 * The sky behind today's countdown: one continuous day from the clock, in
 * five passages that meet at the prayer times, with the moon in its phase
 * and ink the text can be read in at every minute. See skyModel.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  HERO_Y,
  INK_SWITCH_LUMINANCE,
  luminance,
  mixHex,
  skyColorAt,
  skyFrame,
  skyInkAt,
  skyMoment,
  type SkyPassage,
} from '../src/screens/home/skyModel';
import { moonShadowPath } from '../src/screens/home/HeroSky';
import { moonIllumination, moonPhaseFraction } from '../src/screens/home/moon';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const PASSAGES: SkyPassage[] = ['night', 'dawn', 'day', 'sunset', 'dusk'];

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const day = { Fajr: '04:30', Sunrise: '06:10', Dhuhr: '12:50', Asr: '16:20', Maghrib: '19:40', Isha: '21:45' };
const at = (h: number, m = 0) => new Date(2026, 8, 8, h, m);

describe('where in the day', () => {
  it('walks the five passages at the prayer times', () => {
    expect(skyMoment(day, at(2))).toMatchObject({ passage: 'night' });
    expect(skyMoment(day, at(4, 30))).toMatchObject({ passage: 'dawn', t: 0 });
    expect(skyMoment(day, at(5, 20)).passage).toBe('dawn');
    expect(skyMoment(day, at(6, 10))).toMatchObject({ passage: 'day', t: 0 });
    expect(skyMoment(day, at(12, 50)).t).toBeCloseTo(0.66, 1); // Dhuhr is past the middle of Sunrise→Asr here
    expect(skyMoment(day, at(16, 20))).toMatchObject({ passage: 'sunset', t: 0 });
    expect(skyMoment(day, at(19, 40))).toMatchObject({ passage: 'dusk', t: 0 });
    expect(skyMoment(day, at(21, 45))).toMatchObject({ passage: 'night', t: 0 });
  });

  it("closes the night at tomorrow's Fajr when it is known", () => {
    const withTomorrow = skyMoment(day, at(23, 45), '04:32');
    const without = skyMoment(day, at(23, 45));
    expect(withTomorrow.passage).toBe('night');
    // Isha 21:45 → 04:32 is 6h47m; 2h in is ~0.29.
    expect(withTomorrow.t).toBeCloseTo(0.29, 1);
    expect(without.t).toBeCloseTo(0.29, 1);
  });

  it('falls back to a plain day when the timings are missing', () => {
    expect(skyMoment({}, at(12))).toEqual({ passage: 'day', t: 0.5, daylight: 0.5 });
  });

  it('stays night at one in the morning with the Sunrise row turned off', () => {
    // Seen on a device: turning the extra times off removes the Sunrise
    // key from the day's map, and the sky answered with noon at 00:59.
    const noSunrise = { Fajr: day.Fajr, Dhuhr: day.Dhuhr, Asr: day.Asr, Maghrib: day.Maghrib, Isha: day.Isha };
    expect(skyMoment(noSunrise, at(0, 59)).passage).toBe('night');
    expect(skyMoment(noSunrise, at(4, 30))).toMatchObject({ passage: 'dawn', t: 0 });
    // Dawn is assumed to last an hour and a half without the real sunrise.
    expect(skyMoment(noSunrise, at(6, 0))).toMatchObject({ passage: 'day', t: 0 });
    expect(skyMoment(noSunrise, at(13)).passage).toBe('day');
  });
});

describe('the colours', () => {
  it('meet at the seams: each passage ends where the next begins', () => {
    const f = (p: SkyPassage, t: number) => skyFrame({ passage: p, t, daylight: t }, at(12));
    const same = (a: ReturnType<typeof f>, b: ReturnType<typeof f>) => {
      expect(a.top).toBe(b.top);
      expect(a.bottom).toBe(b.bottom);
    };
    same(f('day', 1), f('sunset', 0));
    same(f('sunset', 1), f('dusk', 0));
    same(f('dusk', 1), f('night', 0));
    same(f('night', 1), f('night', 0));
  });

  it('go dark → saturated → light through dawn, and light → saturated → dark through sunset', () => {
    const b = (p: SkyPassage, t: number) =>
      luminance(skyFrame({ passage: p, t, daylight: t }, at(12)).bottom);
    expect(b('dawn', 0)).toBeLessThan(b('dawn', 0.5));
    expect(b('dawn', 0.5)).toBeLessThan(b('dawn', 1));
    expect(b('sunset', 0)).toBeGreaterThan(b('sunset', 0.85));
    expect(b('sunset', 0.85)).toBeGreaterThan(b('dusk', 1));
    // Saturation peaks mid-passage: the dawn's horizon at 0.78 is more
    // saturated (further from grey) than at either end.
    const sat = (hex: string) => {
      const c = hex.replace('#', '');
      const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
      return Math.max(...v) - Math.min(...v);
    };
    const dawnBottom = (t: number) =>
      sat(skyFrame({ passage: 'dawn', t, daylight: t - 1 }, at(12)).bottom);
    expect(dawnBottom(0.78)).toBeGreaterThan(dawnBottom(0));
    expect(dawnBottom(0.78)).toBeGreaterThan(dawnBottom(1));
  });

  it('mix and sample sanely', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(skyColorAt({ top: '#000000', bottom: '#ffffff' }, 0)).toBe('#000000');
    expect(skyColorAt({ top: '#000000', bottom: '#ffffff' }, 1)).toBe('#ffffff');
  });
});

describe('the ink', () => {
  it('reads at AA on the sky behind it, at every minute of every passage', () => {
    // The sweep the design has to survive: every passage at 1% steps, the
    // three heights the hero puts text at.
    for (const p of PASSAGES) {
      for (let i = 0; i <= 100; i++) {
        const frame = skyFrame({ passage: p, t: i / 100, daylight: i / 100 }, at(12));
        for (const y of Object.values(HERO_Y)) {
          const { text } = skyInkAt(frame, y);
          expect(contrast(text, skyColorAt(frame, y))).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('switches where pure white and pure black both clear AA', () => {
    // Just under the switch, white must clear; at it, black must.
    const under = mixHex('#000000', '#ffffff', 0.44); // ~L 0.17
    const over = mixHex('#000000', '#ffffff', 0.47);
    expect(luminance(under)).toBeLessThan(INK_SWITCH_LUMINANCE);
    expect(contrast('#FFFFFF', under)).toBeGreaterThanOrEqual(4.5);
    expect(luminance(over)).toBeGreaterThanOrEqual(INK_SWITCH_LUMINANCE);
    expect(contrast('#000000', over)).toBeGreaterThanOrEqual(4.5);
  });

  it('is taken per element in the hero, at that element’s height', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    const hero = card.slice(card.indexOf('const HeroToday = memo('), card.indexOf('function TodayCardImpl'));
    // Measured where the hero grows (the phone), the design's fixed
    // fractions where it does not — each element, at its own height.
    expect(hero).toMatch(/skyInkAt\(frame, measured \? heroY\.eyebrow : HERO_Y\.eyebrow\)/);
    expect(hero).toMatch(/skyInkAt\(frame, measured \? heroY\.countdown : HERO_Y\.countdown\)/);
    expect(hero).toMatch(/skyInkAt\(frame, measured \? heroY\.foot : HERO_Y\.foot\)/);
    expect(hero).not.toMatch(/palette\./);
    // The sky is the clock's, not the target's.
    expect(hero).toMatch(/skyMoment\(skyToday \?\? today, /);
    expect(hero).not.toMatch(/skyPhaseFor|targetKey/);
  });
});

describe('the moon', () => {
  const FULL = new Date(Date.UTC(2024, 0, 25, 17, 54));

  it('is drawn in the night passage only, crossing the top strip', () => {
    const early = skyFrame({ passage: 'night', t: 0.1, daylight: null }, FULL);
    const late = skyFrame({ passage: 'night', t: 0.9, daylight: null }, FULL);
    expect(early.body.kind).toBe('moon');
    expect(late.body.kind).toBe('moon');
    if (early.body.kind === 'moon' && late.body.kind === 'moon') {
      expect(early.body.illuminated).toBeGreaterThan(0.99);
      expect(late.body.x).toBeGreaterThan(early.body.x);
      expect(early.body.y).toBeLessThanOrEqual(0.32);
    }
    expect(skyFrame({ passage: 'dawn', t: 0, daylight: -1 }, at(12)).body.kind).toBe('none');
  });

  it('carries the reader\'s coordinates through to the tilt', () => {
    // The frame is where the location meets the moon; if it stops being
    // threaded through, every reader gets the northern hemisphere again
    // and nothing else in the app would notice.
    const plain = skyFrame({ passage: 'night', t: 0.5, daylight: null }, FULL);
    const south = skyFrame({ passage: 'night', t: 0.5, daylight: null }, FULL, {
      latitude: -33.92,
      longitude: 18.42,
    });
    expect(plain.body.kind === 'moon' && plain.body.tilt).toBe(0);
    expect(south.body.kind === 'moon' && south.body.tilt).not.toBe(0);
  });

  it('draws the shadow from the light, not from a phase number', () => {
    // Full: nothing left to draw. New: the whole disc, which the caller
    // pairs with a faint fill so it reads as a ghost rather than a hole.
    expect(moonShadowPath(1, 10, 10, 8)).toBeNull();
    expect(moonShadowPath(0, 10, 10, 8)).toMatch(/^M 10 2 A 8 8/);
    // Half lit: the terminator is a straight line down the middle (rx 0).
    expect(moonShadowPath(0.5, 10, 10, 8)).toMatch(/A 0 8 0 0 [01] 10 2/);
    // The lit side is ALWAYS the right one — which way the real limb
    // faces is a rotation of the whole disc, not a second shape. So the
    // dark limb is always walked the same way round, sweep 0.
    expect(moonShadowPath(0.2, 10, 10, 8)).toContain('A 8 8 0 0 0 10 18');
    expect(moonShadowPath(0.8, 10, 10, 8)).toContain('A 8 8 0 0 0 10 18');
    // A crescent's terminator bows into the lit side, a gibbous' away.
    expect(moonShadowPath(0.2, 10, 10, 8)).toMatch(/A 4\.8 8 0 0 0 10 2/);
    expect(moonShadowPath(0.8, 10, 10, 8)).toMatch(/A 4\.8 8 0 0 1 10 2/);
  });

  it('goes on lighting up all the way to full, with no steps', () => {
    // The old drawing quantised to eight shapes, so the disc jumped every
    // 3.7 days and sat up to 26 points of light away from the real one.
    const widths = [0.1, 0.2, 0.3, 0.4].map(k => {
      // The TERMINATOR arc, which is the one that closes back at the top;
      // the first arc in the path is the dark limb and is always r.
      const m = /A ([\d.]+) 8 0 0 [01] 10 2/.exec(moonShadowPath(k, 10, 10, 8) ?? '');
      return Number(m?.[1]);
    });
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeLessThan(widths[i - 1]);
    }
  });

  it('still knows the eight phases when you ask for them', () => {
    // Continuous does not mean the primary and intermediate phases went
    // away: they are the points this passes through, and each one is a
    // recognisable shape.
    const eighth = (i: number) => moonIllumination(i / 8);
    expect(eighth(0)).toBeCloseTo(0, 6); // new
    expect(eighth(2)).toBeCloseTo(0.5, 6); // first quarter
    expect(eighth(4)).toBeCloseTo(1, 6); // full
    expect(eighth(6)).toBeCloseTo(0.5, 6); // last quarter
    expect(eighth(1)).toBeGreaterThan(0); // waxing crescent
    expect(eighth(1)).toBeLessThan(0.5);
    expect(eighth(3)).toBeGreaterThan(0.5); // waxing gibbous
    expect(eighth(3)).toBeLessThan(1);
    // …and the date decides which of them tonight is.
    expect(moonPhaseFraction(FULL)).toBeCloseTo(0.5, 2);
  });
});

describe('the sun', () => {
  const f = (p: SkyPassage, t: number) => skyFrame({ passage: p, t, daylight: t }, at(12));
  it('rises late in the dawn, climbs to its height about the middle of the day, and has set by Maghrib', () => {
    expect(f('dawn', 0.3).body.kind).toBe('none');
    expect(f('dawn', 0.95).body.kind).toBe('sun');
    const noon = f('day', 0.5).body;
    const morning = f('day', 0.1).body;
    if (noon.kind === 'sun' && morning.kind === 'sun') expect(noon.y).toBeLessThan(morning.y);
    const set = f('sunset', 1).body;
    expect(set.kind === 'sun' ? set.alpha : 0).toBe(0);
    expect(f('dusk', 0.5).body.kind).toBe('none');
  });

  it('keeps every body in the top strip, clear of the countdown', () => {
    for (const p of PASSAGES) {
      for (let i = 0; i <= 20; i++) {
        const b = f(p, i / 20).body;
        if (b.kind === 'none') continue;
        // The width the arc is drawn across — a whole day's travel, so
        // the sun and the moon use the card rather than its middle third.
        expect(b.x).toBeGreaterThanOrEqual(0.12);
        expect(b.x).toBeLessThanOrEqual(0.88);
        expect(b.y).toBeLessThanOrEqual(0.28);
        expect(b.y).toBeGreaterThan(0.05);
      }
    }
  });

  it('brings the stars out through dusk and puts them away through dawn', () => {
    expect(f('dusk', 0.2).stars).toBe(0);
    expect(f('dusk', 1).stars).toBe(1);
    expect(f('night', 0.5).stars).toBe(1);
    expect(f('dawn', 0.25).stars).toBeCloseTo(0.5, 5);
    expect(f('dawn', 0.6).stars).toBe(0);
    expect(f('day', 0.5).stars).toBe(0);
  });
});
