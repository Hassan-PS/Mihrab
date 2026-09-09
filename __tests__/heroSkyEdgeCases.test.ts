/**
 * The sky behind the countdown, at every minute of every kind of day.
 *
 * Two bugs reached a device before this file existed: the sky read a
 * missing Sunrise row as "no timings" and painted noon at one in the
 * morning, and the drawing stopped short of the hero once the hero grew.
 * Both were a shape of day the design had not been walked through. So
 * this walks all of them — a mid-latitude autumn, Makkah, a Stockholm
 * June with Isha after midnight, a December with eight hours of light,
 * a near-polar summer — with every optional row on and off, with the
 * Mālikī boundaries in the map, minute by minute, and asks the same
 * questions of each: is it night at night, do the passages come in
 * order and meet at the prayer times, is t within [0, 1], are the
 * colours colours, and does every body drawn stay inside the open sky
 * on every phone height the table could leave it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  HERO_Y,
  luminance,
  skyColorAt,
  skyFrame,
  skyInkAt,
  skyMoment,
  type SkyPassage,
} from '../src/screens/home/skyModel';
import { MOON, SKY_CRAMPED_BELOW, skyScene, SUN_R } from '../src/screens/home/HeroSky';
import { filterOptionalTimes } from '../src/utils/nightTimes';
import type { TimingsMap } from '../src/types/prayer';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const HEX = /^#[0-9a-f]{6}$/i;
/** The cycle, and what follows each passage in it. */
const NEXT: Record<SkyPassage, SkyPassage> = {
  night: 'dawn',
  dawn: 'day',
  day: 'sunset',
  sunset: 'dusk',
  dusk: 'night',
};

/** A day, as the app holds it — the five, Sunrise, the night marks. */
type Day = { name: string; t: TimingsMap; tomorrowFajr: string };
const DAYS: Day[] = [
  {
    name: 'Stockholm, September',
    t: {
      Midnight: '23:37', Lastthird: '00:57', Fajr: '03:38', Sunrise: '05:55',
      Dhuhr: '12:50', Asr: '16:20', Maghrib: '19:36', Isha: '21:44', Firstthird: '22:17',
    },
    tomorrowFajr: '03:41',
  },
  {
    name: 'Makkah',
    t: {
      Midnight: '00:12', Lastthird: '02:30', Fajr: '04:48', Sunrise: '06:05',
      Dhuhr: '12:15', Asr: '15:38', Maghrib: '18:22', Isha: '19:52', Firstthird: '21:20',
    },
    tomorrowFajr: '04:48',
  },
  {
    // Isha after midnight, stored as the clock it shows.
    name: 'Stockholm, June (Isha past midnight)',
    t: {
      Midnight: '00:40', Lastthird: '01:50', Fajr: '02:30', Sunrise: '03:45',
      Dhuhr: '12:55', Asr: '17:30', Maghrib: '22:05', Isha: '00:47', Firstthird: '23:30',
    },
    tomorrowFajr: '02:29',
  },
  {
    name: 'Stockholm, December',
    t: {
      Midnight: '23:50', Lastthird: '02:40', Fajr: '06:05', Sunrise: '08:40',
      Dhuhr: '11:50', Asr: '13:10', Maghrib: '14:50', Isha: '16:55', Firstthird: '19:30',
    },
    tomorrowFajr: '06:06',
  },
  {
    // Near the Arctic Circle: an hour of dawn, a two-hour night.
    name: 'Near-polar summer',
    t: {
      Fajr: '01:30', Sunrise: '02:50', Dhuhr: '13:10', Asr: '18:10', Maghrib: '23:20', Isha: '00:55',
    },
    tomorrowFajr: '01:28',
  },
];

const on = (d: Date, h: number, m: number) => {
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
};
const BASE = new Date(2026, 8, 9);

/** Every minute of the day, in order. */
function sweep(t: TimingsMap, tomorrowFajr?: string) {
  const out: {
    h: number;
    m: number;
    passage: SkyPassage;
    t: number;
    daylight: number | null;
  }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m++) {
      const moment = skyMoment(t, on(BASE, h, m), tomorrowFajr);
      out.push({ h, m, passage: moment.passage, t: moment.t, daylight: moment.daylight });
    }
  }
  return out;
}

/** Passages as a run-length list, in the order they appear. */
function runs(s: ReturnType<typeof sweep>): SkyPassage[] {
  const out: SkyPassage[] = [];
  for (const x of s) if (out[out.length - 1] !== x.passage) out.push(x.passage);
  return out;
}

const clockMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

describe.each(DAYS)('$name', ({ t: day, tomorrowFajr }) => {
  const s = sweep(day, tomorrowFajr);

  it('walks the passages in cycle order, each once', () => {
    // The civil day starts in whatever passage is in progress — the night,
    // or with Isha past midnight the previous evening's dusk — so the runs
    // are the cycle read from there: every step follows the last, every
    // passage appears, and only the one the day began in appears twice.
    const r = runs(s);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBe(NEXT[r[i - 1]]);
    expect(new Set(r).size).toBe(5);
    expect(r.length).toBeLessThanOrEqual(6);
    expect(r.length === 6 ? r[0] === r[5] : true).toBe(true);
  });

  it('meets each passage at its prayer time', () => {
    const at = (key: string) => {
      const mins = clockMinutes(day[key] as string);
      return s[mins];
    };
    expect(at('Fajr')).toMatchObject({ passage: 'dawn' });
    expect(at('Fajr').t).toBeCloseTo(0, 5);
    expect(at('Sunrise')).toMatchObject({ passage: 'day' });
    expect(at('Asr')).toMatchObject({ passage: 'sunset' });
    expect(at('Maghrib')).toMatchObject({ passage: 'dusk' });
    // Isha may be past midnight; the minute it names is night either way.
    expect(at('Isha').passage).toBe('night');
  });

  it('is dark between Isha and Fajr — never a plain day at night', () => {
    const isha = clockMinutes(day.Isha as string);
    const fajr = clockMinutes(day.Fajr as string);
    for (const x of s) {
      const mins = x.h * 60 + x.m;
      const afterIsha = isha > fajr ? mins >= isha || mins < fajr : mins >= isha && mins < fajr;
      if (afterIsha) expect(x.passage).toBe('night');
    }
  });

  it('keeps t inside [0, 1] and rising within a passage', () => {
    let prev: (typeof s)[number] | null = null;
    for (const x of s) {
      expect(x.t).toBeGreaterThanOrEqual(0);
      expect(x.t).toBeLessThanOrEqual(1);
      if (prev && prev.passage === x.passage) {
        // Never running backwards, except the wrap of one night into the
        // next at midnight, when the moment is re-anchored.
        const wrap = x.passage === 'night' && x.h === 0 && x.m === 0;
        if (!wrap) expect(x.t).toBeGreaterThanOrEqual(prev.t - 1e-9);
      }
      prev = x;
    }
  });

  it('reads the same sky with every optional row off, or any of them', () => {
    const toggles = [
      { Sunrise: false, Midnight: false, Lastthird: false, Firstthird: false },
      { Sunrise: true, Midnight: false, Lastthird: false, Firstthird: false },
      { Sunrise: false, Midnight: true, Lastthird: true, Firstthird: true },
      { Sunrise: true, Midnight: true, Lastthird: false, Firstthird: true },
    ];
    for (const tg of toggles) {
      const filtered = filterOptionalTimes(day, tg);
      const f = sweep(filtered, tomorrowFajr);
      for (let i = 0; i < s.length; i++) {
        // The passages agree everywhere but where dawn ends — without the
        // row, dawn is estimated — and even then it is dawn or day, never
        // night or noon at the wrong hour.
        if (tg.Sunrise || (s[i].passage !== 'dawn' && s[i].passage !== 'day')) {
          expect(f[i].passage).toBe(s[i].passage);
        } else {
          expect(['dawn', 'day']).toContain(f[i].passage);
        }
      }
    }
  });

  it('ignores the Mālikī boundaries riding in the same map', () => {
    const withDaruri: TimingsMap = {
      ...day,
      FajrDaruri: '05:20',
      DhuhrDaruri: '16:20',
      AsrDaruri: '18:40',
      MaghribDaruri: '21:44',
      IshaDaruri: '22:17',
    };
    expect(sweep(withDaruri, tomorrowFajr)).toEqual(s);
  });

  it('draws a real frame at every minute', () => {
    for (const x of s) {
      const frame = skyFrame(
        { passage: x.passage, t: x.t, daylight: x.daylight },
        on(BASE, x.h, x.m),
      );
      expect(frame.top).toMatch(HEX);
      expect(frame.bottom).toMatch(HEX);
      expect(frame.glow).toMatch(HEX);
      expect(frame.stars).toBeGreaterThanOrEqual(0);
      expect(frame.stars).toBeLessThanOrEqual(1);
      if (frame.body.kind !== 'none') {
        expect(frame.body.x).toBeGreaterThanOrEqual(0.12);
        expect(frame.body.x).toBeLessThanOrEqual(0.88);
        expect(frame.body.y).toBeGreaterThanOrEqual(0.08);
        expect(frame.body.y).toBeLessThanOrEqual(0.3);
      }
      if (frame.body.kind === 'sun') {
        expect(frame.body.alpha).toBeGreaterThanOrEqual(0);
        expect(frame.body.alpha).toBeLessThanOrEqual(1);
      }
      if (frame.body.kind === 'moon') {
        expect(frame.body.phase).toBeGreaterThanOrEqual(0);
        expect(frame.body.phase).toBeLessThanOrEqual(7);
        expect(frame.body.lit).toBeGreaterThanOrEqual(0);
        expect(frame.body.lit).toBeLessThanOrEqual(1);
      }
      // The night has a moon; the day has a sun; the dusk has neither.
      if (x.passage === 'night') expect(frame.body.kind).toBe('moon');
      if (x.passage === 'day') expect(frame.body.kind).toBe('sun');
      if (x.passage === 'dusk') expect(frame.body.kind).toBe('none');
    }
  });

  it('is continuous across midnight', () => {
    const before = skyMoment(day, on(BASE, 23, 59), tomorrowFajr);
    const after = skyMoment(day, on(new Date(2026, 8, 10), 0, 0), tomorrowFajr);
    expect(before.passage).toBe(after.passage);
    // One minute of a passage some hours long: a fraction of a percent —
    // and never a jump back to the start of it.
    expect(Math.abs(after.t - before.t)).toBeLessThan(0.02);
  });
});

describe('what the model refuses', () => {
  it('an empty string is a missing time', () => {
    expect(skyMoment({ Fajr: '', Asr: '', Maghrib: '', Isha: '' }, on(BASE, 12, 0))).toEqual({
      passage: 'day',
      t: 0.5,
      daylight: 0.5,
    });
  });

  it('a day with the same Maghrib and Isha does not divide by zero', () => {
    const odd: TimingsMap = { Fajr: '04:00', Sunrise: '05:30', Asr: '16:00', Maghrib: '19:00', Isha: '19:00' };
    for (let h = 0; h < 24; h++) {
      const m = skyMoment(odd, on(BASE, h, 30));
      expect(Number.isFinite(m.t)).toBe(true);
      expect(m.t).toBeGreaterThanOrEqual(0);
      expect(m.t).toBeLessThanOrEqual(1);
    }
  });
});

describe('the ink clears AA wherever the text may land', () => {
  const contrast = (a: string, b: string) => {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  it('at the fixed fractions and at every measured one', () => {
    // The growing hero measures where each line sits; that can be any
    // fraction of the sky. Every hundredth, every passage, every minute.
    for (const p of ['night', 'dawn', 'day', 'sunset', 'dusk'] as SkyPassage[]) {
      for (let i = 0; i <= 100; i += 2) {
        const frame = skyFrame({ passage: p, t: i / 100, daylight: i / 100 }, on(BASE, 12, 0));
        for (let y = 0; y <= 100; y += 5) {
          const { text } = skyInkAt(frame, y / 100);
          expect(contrast(text, skyColorAt(frame, y / 100))).toBeGreaterThanOrEqual(4.5);
        }
        for (const y of Object.values(HERO_Y)) {
          const { text } = skyInkAt(frame, y);
          expect(contrast(text, skyColorAt(frame, y))).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe('the open sky, on every phone and every table', () => {
  // Status bar 24–60dp, top row ~44dp + 12 margin; the block 130–200dp
  // plus the 16dp foot bleed; the sky itself from a squashed 250dp to a
  // tablet's 1100dp.
  const tops = [24 + 56, 36 + 56, 48 + 56, 60 + 56];
  const bottoms = [130 + 16, 160 + 16, 200 + 16];
  const heights = [250, 300, 340, 400, 500, 640, 800, 1100];

  it('keeps every body inside the band, or draws none', () => {
    for (const sceneTop of tops) {
      for (const sceneBottom of bottoms) {
        for (const height of heights) {
          const scene = skyScene({ height, sceneTop, sceneBottom });
          expect(scene.banded).toBe(true);
          expect(scene.cramped).toBe(height > 0 && scene.room < SKY_CRAMPED_BELOW);
          if (scene.cramped) continue;
          // The model's whole range of body centres.
          for (let f = 0.08; f <= 0.3; f += 0.01) {
            const y = scene.y(f);
            expect(y - MOON / 2).toBeGreaterThanOrEqual(sceneTop);
            expect(y + MOON / 2).toBeLessThanOrEqual(height - sceneBottom + 0.001);
            expect(y - SUN_R).toBeGreaterThanOrEqual(sceneTop);
            expect(y + SUN_R).toBeLessThanOrEqual(height - sceneBottom + 0.001);
          }
          // And the stars (drawn at 8%–40% of a short card).
          for (const f of [0.08, 0.12, 0.14, 0.26, 0.3, 0.34, 0.4]) {
            const y = scene.y(f);
            expect(y).toBeGreaterThanOrEqual(sceneTop);
            expect(y).toBeLessThanOrEqual(height - sceneBottom);
          }
        }
      }
    }
  });

  it('the hero reserves a moon’s worth of sky, and the threshold sits under it', () => {
    const card = read('src/screens/home/TodayCard.tsx');
    expect(card).toMatch(/heroScene: \{[^}]*minHeight: 64/);
    expect(SKY_CRAMPED_BELOW).toBeLessThan(64);
    // A 64dp band at the smallest phone with the largest block still holds a moon.
    const scene = skyScene({ height: 64 + 116 + 216, sceneTop: 116, sceneBottom: 216 });
    expect(scene.cramped).toBe(false);
    expect(scene.y(0.22) + MOON / 2).toBeLessThanOrEqual(64 + 116);
    expect(scene.y(0.12) - MOON / 2).toBeGreaterThanOrEqual(116);
  });

  it('measures before it is banded, and draws the SVG a whole dp over its measured size', () => {
    const sky = read('src/screens/home/HeroSky.tsx');
    // Not gated on the band: the size is what keeps the gradient on the hero.
    expect(sky).toMatch(/onLayout=\{onLayout\}/);
    // ROUNDED UP. A layout width is a fraction of a dp — 1280px at 3x
    // measures 426.667 — and the surface is laid out on whole dp, so the
    // sky was painted 426dp wide and the last two device pixels of the
    // screen stayed the page's colour: a hairline down the hero's right
    // edge, measured on a Pixel 10 Pro. The wrap clips the overdraw.
    expect(sky).toMatch(/width=\{size\.width > 0 \? Math\.ceil\(size\.width\) : '100%'\}/);
    expect(sky).toMatch(/height=\{size\.height > 0 \? Math\.ceil\(size\.height\) : '100%'\}/);
    // And the clip that makes the overdraw safe.
    expect(read('src/screens/home/TodayCard.tsx')).toMatch(
      /heroWrapBleed: \{[^}]*overflow: 'hidden'/s,
    );
  });
});

describe('the hero grows but never shrinks under its text', () => {
  const card = read('src/screens/home/TodayCard.tsx');
  const home = read('src/screens/HomeScreen.tsx');
  it('every link in the chain is grow-only', () => {
    for (const key of ['cardBleed', 'heroWrapBleed', 'heroFill']) {
      const m = card.match(new RegExp(`${key}: \\{[^}]*\\}`, 's'));
      expect(m).toBeTruthy();
      expect(m![0]).toMatch(/flexGrow: 1/);
      expect(m![0]).toMatch(/flexShrink: 0/);
      expect(m![0]).toMatch(/flexBasis: 'auto'/);
      expect(m![0]).not.toMatch(/\bflex: 1\b/);
    }
    expect(home).toMatch(/fillColumn: \{ flexGrow: 1, flexShrink: 0, flexBasis: 'auto' \}/);
    // Both of CenteredColumn's wrappers — on a tablet held upright the
    // column is capped and gains an inner View, which grew nowhere and
    // left the hero a third of the page over a void of two thirds.
    expect(home).toMatch(/style=\{\[styles\.homeColumn, !isDashboard && !isMacCatalyst && styles\.fillColumn\]\}/);
    expect(home).toMatch(/innerStyle=\{\[styles\.homeColumn, !isDashboard && !isMacCatalyst && styles\.fillColumn\]\}/);
  });

  it('the Log gives up graph height on a short phone, never the day', () => {
    const log = read('src/screens/LogScreen.tsx');
    expect(log).toMatch(/LOG_DENSE_BELOW_HEIGHT = 760/);
    expect(log).toMatch(/HEATMAP_SHORT_SCALE = 0\.8/);
    expect(log).toMatch(/compact=\{shortScreen\}/);
    expect(log).toMatch(/marginVertical: -\(heatmapH \* \(1 - HEATMAP_SHORT_SCALE\)\) \/ 2/);
    // The legend left the page for the ⋯; the heatmap is drawn compact.
    expect(log).toMatch(/<PracticeHeatmap[\s\S]{0,400}compact\s*\n/);
    expect(read('src/screens/log/LogOptionsSheet.tsx')).toContain('<HeatmapLegend />');
  });

  it('the sky is the wrap’s only ground on the phone', () => {
    expect(card).toMatch(/backgroundColor: fullBleed \? 'transparent' : palette\.accentBg/);
  });

  it('reads the sky from the raw day and the rail from the drawn one', () => {
    expect(home).toMatch(/skyTimings=\{state\.phase === 'ready' \? state\.today : undefined\}/);
    expect(card).toMatch(/skyMoment\(skyToday \?\? today,/);
    const rail = card.slice(card.indexOf('const rail = useMemo'), card.indexOf('return { from, pct };'));
    expect(rail).toMatch(/const passed = DISPLAY_ORDER\.map\(key => \(\{\s*key,\s*raw: today\[key\]/);
    expect(rail).not.toMatch(/skyToday/);
  });
});

describe('the rows adapt to the phone and to the table', () => {
  const card = read('src/screens/home/TodayCard.tsx');
  const row = read('src/screens/home/PrayerRow.tsx');
  it('go dense on a short window or past six rows, on the phone only', () => {
    expect(card).toMatch(/DENSE_BELOW_HEIGHT = 720/);
    expect(card).toMatch(/DENSE_ABOVE_ROWS = 6/);
    expect(card).toMatch(/const dense = fullBleed && \(shortScreen \|\| rows\.length \+ \(withDaruri \? 2 : 0\) > DENSE_ABOVE_ROWS\);/);
    expect(card).toMatch(/dense=\{dense\}/);
    expect(row).toMatch(/dense && styles\.rowDense/);
    expect(row).toMatch(/rowDense: \{ paddingVertical: SPACING\.sm \}/);
  });

  it('the rail reads an Isha past midnight as tomorrow’s, like the sky does', () => {
    // Stockholm in June: Isha "00:47". As a clock on today's date it had
    // "passed" at 23:00, and the rail ran from Isha to Isha with nothing
    // in it. The evening's rows that read earlier than Maghrib are the
    // next day's.
    const rail = card.slice(card.indexOf('const rail = useMemo'), card.indexOf('return { from, pct };'));
    expect(rail).toMatch(/key === 'Isha' \|\| key === 'Firstthird'/);
    expect(rail).toMatch(/at\.getTime\(\) < maghribAt/);
    expect(rail).toMatch(/setDate\(at\.getDate\(\) \+ 1\)/);
    expect(rail).toMatch(/\.sort\(\(a, b\) => a\.at\.getTime\(\) - b\.at\.getTime\(\)\)/);
    // And before Fajr it runs from LAST night's Isha, not from nothing.
    expect(rail).toMatch(/yesterday\.setDate\(yesterday\.getDate\(\) - 1\)/);
  });
});

/**
 * The hero's top row is on the page's edge, not floating inside it.
 *
 * The location chip fills a flexible slot and carries its own touch
 * padding, so it stretched across the room between the edge and the Qibla
 * chip and centred its pin in that — a void between the chip and the edge,
 * and the city out of line with the countdown and the date below it.
 */
describe('the hero top row sits on the page edge', () => {
  const card = read('src/screens/home/TodayCard.tsx');

  it('sizes the location slot to its chip and pulls the chip onto the edge', () => {
    expect(card).toMatch(/heroTopLeading: \{[^}]*alignItems: 'flex-start'[^}]*\}/s);
    expect(card).toMatch(/heroTopLeading: \{[^}]*marginStart: -SPACING\.sm[^}]*\}/s);
  });

  it('cancels exactly the padding the chip carries', () => {
    // The pull is the chip's own horizontal padding, so the pin's edge
    // lands where the hero's text begins — no more, no less.
    expect(read('src/screens/home/LocationChip.tsx')).toMatch(
      /headerPin: \{\s*paddingHorizontal: SPACING\.sm/,
    );
  });
});

/**
 * THE SUN TRAVELS ONCE, from where it rises to where it sets.
 *
 * It used to be placed from the progress of the passage it was in, so it
 * crossed the card three times a day — through the dawn, again from
 * sunrise to Asr, and a third time from Asr to Maghrib — jumping back to
 * the left at each boundary, and at Asr up into the sky as well, to set a
 * second time. The passages say what colour the sky is and when the sun
 * fades in and out; where it IS comes from the day.
 */
describe('the sun crosses the sky once', () => {
  const day: TimingsMap = {
    Fajr: '03:38',
    Sunrise: '05:55',
    Dhuhr: '12:50',
    Asr: '16:20',
    Maghrib: '19:36',
    Isha: '21:44',
  };
  const minutes = sweep(day, '03:40');
  const framesOf = () =>
    minutes.map(x => ({
      ...x,
      frame: skyFrame({ passage: x.passage, t: x.t, daylight: x.daylight }, on(BASE, x.h, x.m)),
    }));
  const suns = () =>
    framesOf().filter(x => x.frame.body.kind === 'sun') as (ReturnType<typeof framesOf>[number] & {
      frame: { body: { kind: 'sun'; x: number; y: number; alpha: number } };
    })[];

  it('never moves backwards, from the first minute it is drawn to the last', () => {
    let previous = -Infinity;
    for (const { h, m, frame } of suns()) {
      if (frame.body.kind !== 'sun') continue;
      if (frame.body.x < previous - 1e-9) {
        throw new Error(
          `the sun jumped back at ${h}:${String(m).padStart(2, '0')}: ` +
            `${frame.body.x.toFixed(4)} after ${previous.toFixed(4)}`,
        );
      }
      previous = frame.body.x;
    }
  });

  it('moves by no more than a minute\'s worth at a time — no seams', () => {
    const drawn = suns();
    // A day is ~820 minutes of sun over 0.76 of the width: 0.001 a minute.
    for (let i = 1; i < drawn.length; i++) {
      const a = drawn[i - 1].frame.body;
      const b = drawn[i].frame.body;
      if (a.kind !== 'sun' || b.kind !== 'sun') continue;
      expect(Math.abs(b.x - a.x)).toBeLessThan(0.01);
      expect(Math.abs(b.y - a.y)).toBeLessThan(0.01);
    }
  });

  it('rises at one edge and sets at the other, having crossed the card', () => {
    const drawn = suns();
    const first = drawn[0].frame.body;
    const last = drawn[drawn.length - 1].frame.body;
    if (first.kind !== 'sun' || last.kind !== 'sun') throw new Error('no sun');
    expect(first.x).toBeCloseTo(0.12, 2);
    expect(last.x).toBeGreaterThan(0.85);
    // And both ends are at the horizon, not somewhere in the sky.
    expect(first.y).toBeGreaterThan(0.25);
    expect(last.y).toBeGreaterThan(0.25);
  });

  it('is highest at Dhuhr, which is the middle of sunrise and Maghrib', () => {
    const drawn = suns();
    let highest = drawn[0];
    for (const x of drawn) {
      if (x.frame.body.kind === 'sun' && highest.frame.body.kind === 'sun') {
        if (x.frame.body.y < highest.frame.body.y) highest = x;
      }
    }
    // Sunrise 05:55 and Maghrib 19:36 put solar noon at 12:45; Dhuhr is
    // 12:50, five minutes after it, as it always is.
    expect(highest.h).toBe(12);
    expect(Math.abs(highest.m - 45)).toBeLessThanOrEqual(2);
    if (highest.frame.body.kind === 'sun') {
      expect(highest.frame.body.y).toBeCloseTo(0.08, 2);
    }
  });

  it('crosses Asr without noticing it', () => {
    const before = minutes.find(x => x.h === 16 && x.m === 19)!;
    const after = minutes.find(x => x.h === 16 && x.m === 21)!;
    expect(before.passage).toBe('day');
    expect(after.passage).toBe('sunset');
    const a = skyFrame({ ...before, daylight: before.daylight }, on(BASE, 16, 19)).body;
    const b = skyFrame({ ...after, daylight: after.daylight }, on(BASE, 16, 21)).body;
    if (a.kind !== 'sun' || b.kind !== 'sun') throw new Error('no sun at Asr');
    // The passage changed; the sun did not.
    expect(b.x - a.x).toBeGreaterThan(0);
    expect(b.x - a.x).toBeLessThan(0.01);
    expect(Math.abs(b.y - a.y)).toBeLessThan(0.01);
  });

  it('holds at the point it will rise from while the dawn brings it up', () => {
    const dawnSuns = framesOf().filter(
      x => x.passage === 'dawn' && x.frame.body.kind === 'sun',
    );
    expect(dawnSuns.length).toBeGreaterThan(10);
    for (const { frame } of dawnSuns) {
      if (frame.body.kind !== 'sun') continue;
      expect(frame.body.x).toBeCloseTo(0.12, 3);
      // Below the horizon line, coming up to it.
      expect(frame.body.y).toBeGreaterThanOrEqual(0.26);
      expect(frame.body.y).toBeLessThanOrEqual(0.28);
    }
  });
});
