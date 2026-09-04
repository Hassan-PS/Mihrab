/**
 * The Mālikī second times — issue #19.
 *
 * The interesting assertions here are the orderings and the blanks. A
 * boundary that lands on the wrong side of the prayer it bounds is worse
 * than no boundary at all, and at high latitude some of these instants
 * do not occur — the app has to say nothing rather than invent one.
 *
 * Casablanca is the reference because the issue is written from there,
 * against the Habous table; Stockholm, Malmö and Tromsø are the places
 * the geometry runs out, and Stockholm is the app's own dataset.
 */

/**
 * `jest.setup.js` mocks `adhan` wholesale — a fixed April day with
 * well-separated times, so the provider paths have something in order to
 * validate. This file is about the arithmetic, so it wants the real
 * library, the same way `calculationMethods.test.ts` does.
 *
 * `daruriTimes.ts` itself is unaffected either way: it reaches for
 * `adhan/lib/cjs/SolarTime` directly, which the mock does not cover. The
 * unmock is here for the cross-check against adhan's own ʿAṣr below.
 */
jest.unmock('adhan');

import {
  DARURI_CONFIDENCE,
  daruriImportOk,
  ISFAR_ALTITUDE_DEGREES,
  ISFIRAR_ALTITUDE_DEGREES,
  MALIKI_SHADOW_LENGTH,
  DARURI_KEYS,
  DARURI_OF,
  daruriTimesForDay,
  injectDaruriTimes,
  solarDaruriBoundaries,
} from '../src/prayer/daruriTimes';
import type { TimingsMap } from '../src/types/prayer';

const CASABLANCA = { lat: 33.5731, lng: -7.5898 };
const MALMO = { lat: 55.605, lng: 13.0038 };
const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };
const TROMSO = { lat: 69.6492, lng: 18.9553 };

const NOON = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0);
const SOLAR_KEYS = ['AsrDaruri', 'DhuhrDaruri', 'FajrDaruri'].sort();

/** The same instants in decimal UTC hours, straight from the engine. */
function solarHours(y: number, m: number, d: number, place = CASABLANCA) {
  const SolarTime = require('adhan/lib/cjs/SolarTime').default;
  const st = new SolarTime(NOON(y, m, d), {
    latitude: place.lat,
    longitude: place.lng,
  });
  return {
    dawn: st.hourAngle(-19, false),
    isfar: st.hourAngle(ISFAR_ALTITUDE_DEGREES, false),
    sunrise: st.sunrise,
    transit: st.transit,
    asr: st.afternoon(MALIKI_SHADOW_LENGTH),
    isfirar: st.hourAngle(ISFIRAR_ALTITUDE_DEGREES, true),
    sunset: st.sunset,
  };
}

/** Local `HH:mm` of a Date, for comparing against what the module prints. */
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;


/**
 * A provider's rows for a place and a day, from the real engine, in the
 * RUNNER's time zone — because that is what a provider's rows are: clock
 * strings in the zone the device is in. Hard-coding "05:30" here would
 * only be right in Casablanca, and the gate in `daruriTimesForDay`
 * compares these strings against solar instants drawn in the device's
 * zone, so a test that typed the rows in would pass in one zone and fail
 * in every other. (Which is precisely the contradiction the gate exists
 * to catch on a real device with a remote manual location.)
 */
function rowsFor(
  place: { lat: number; lng: number },
  date: Date,
  opts: { madhab?: 'shafi' | 'hanafi'; highLat?: string; fajr?: number; isha?: number } = {},
): TimingsMap {
  const { CalculationMethod, PrayerTimes, Madhab, HighLatitudeRule } = require('adhan');
  const Coordinates = require('adhan/lib/cjs/Coordinates').default;
  const params = CalculationMethod.Other();
  params.fajrAngle = opts.fajr ?? 19;
  params.ishaAngle = opts.isha ?? 17;
  params.madhab = opts.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  if (opts.highLat) params.highLatitudeRule = HighLatitudeRule[opts.highLat];
  const pt = new PrayerTimes(new Coordinates(place.lat, place.lng), date, params);
  return {
    Fajr: hhmm(pt.fajr),
    Sunrise: hhmm(pt.sunrise),
    Dhuhr: hhmm(pt.dhuhr),
    Asr: hhmm(pt.asr),
    Maghrib: hhmm(pt.maghrib),
    Isha: hhmm(pt.isha),
  };
}

/** `HH:mm` plus a number of minutes, wrapping at midnight. */
function plus(clock: string, minutes: number): string {
  const [h, m] = clock.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const NEXT = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12);

// ── The solar three ───────────────────────────────────────────────────

describe('the solar boundaries at a latitude where every one of them happens', () => {
  const at = (y: number, m: number, d: number) =>
    solarDaruriBoundaries(NOON(y, m, d), CASABLANCA.lat, CASABLANCA.lng);

  it('produces the three that are positions of the sun', () => {
    expect(Object.keys(at(2026, 8, 4)).sort()).toEqual(SOLAR_KEYS);
  });

  /**
   * Where each boundary sits in the day, stated about the SUN rather than
   * about a printed clock.
   *
   * A local-clock comparison would be a claim about the machine's time
   * zone as much as about the sky — run in Tokyo, Morocco's evening lands
   * after local midnight and "sunset is later than noon" stops being true
   * of the string. These are the same instants in decimal UTC hours, read
   * off the same engine the module uses, so the assertion holds wherever
   * the suite runs.
   */
  it('puts each boundary where the sun actually puts it', () => {
    for (const [m, d] of [
      [0, 15],
      [3, 15],
      [5, 21],
      [8, 4],
      [11, 21],
    ] as const) {
      const solar = solarHours(2026, m, d);
      // Isfār: after true dawn, and before the sun is up.
      expect(solar.isfar).toBeGreaterThan(solar.dawn);
      expect(solar.isfar).toBeLessThan(solar.sunrise);
      // The 1:1 shadow is in the afternoon, and before the sun yellows.
      expect(solar.asr).toBeGreaterThan(solar.transit);
      expect(solar.asr).toBeLessThan(solar.isfirar);
      // Iṣfirār: the sun is still up, five degrees above the horizon.
      expect(solar.isfirar).toBeLessThan(solar.sunset);
    }
  });

  /**
   * The computed Ẓuhr boundary IS adhan's own 1:1 ʿAṣr — the instant the
   * app already shows a Mālikī or Shāfiʿī user. Checked against adhan's
   * output rather than a number typed in here, so the two can never
   * drift. (On a 1:1 setting the module reuses the row instead; this is
   * the path a Ḥanafī user gets.)
   */
  it('computes Ẓuhr’s boundary exactly where adhan puts the 1:1 ʿAṣr', () => {
    const { CalculationMethod, PrayerTimes, Madhab } = require('adhan');
    const Coordinates = require('adhan/lib/cjs/Coordinates').default;
    const params = CalculationMethod.Other();
    params.fajrAngle = 19;
    params.ishaAngle = 17;
    params.madhab = Madhab.Shafi;
    const pt = new PrayerTimes(
      new Coordinates(CASABLANCA.lat, CASABLANCA.lng),
      NOON(2026, 8, 4),
      params,
    );
    expect(at(2026, 8, 4).DhuhrDaruri).toBe(hhmm(pt.asr));
  });
});

describe('when the sky has no answer', () => {
  it('gives Malmö all three in December', () => {
    const b = solarDaruriBoundaries(NOON(2026, 11, 21), MALMO.lat, MALMO.lng);
    expect(Object.keys(b).sort()).toEqual(SOLAR_KEYS);
  });

  /**
   * Under the midnight sun every one of these windows is open-ended: the
   * sun does not set, so Ẓuhr's and ʿAṣr's second times have no close.
   * The ANGLES are still reached — the sun descends through +5° and the
   * 1:1 shadow happens — so an implementation that only asked "was the
   * angle reached?" would print "ʿAṣr's first time until 21:00" for a
   * window ending at a sunset that never comes.
   */
  it('says nothing at all under the midnight sun', () => {
    expect(solarDaruriBoundaries(NOON(2026, 5, 21), TROMSO.lat, TROMSO.lng)).toEqual({});
  });

  /** The mirror of it: in the polar night nothing rises to end Fajr's. */
  it('says nothing in the polar night either', () => {
    expect(solarDaruriBoundaries(NOON(2026, 11, 21), TROMSO.lat, TROMSO.lng)).toEqual({});
  });

  it('holds that line further north as well', () => {
    expect(solarDaruriBoundaries(NOON(2026, 5, 21), 78.2232, 15.6469)).toEqual({});
  });

  /**
   * The gate is about the sun, not about the latitude: Tromsø in the
   * shoulder seasons has ordinary days and gets ordinary boundaries.
   */
  it('gives the same place every boundary once the sun rises and sets again', () => {
    const b = solarDaruriBoundaries(NOON(2026, 8, 21), TROMSO.lat, TROMSO.lng);
    expect(Object.keys(b).sort()).toEqual(SOLAR_KEYS);
  });

  it('never returns NaN dressed up as a time', () => {
    for (const place of [CASABLANCA, MALMO, STOCKHOLM, TROMSO]) {
      for (let month = 0; month < 12; month++) {
        const b = solarDaruriBoundaries(NOON(2026, month, 15), place.lat, place.lng);
        for (const value of Object.values(b)) {
          expect(value).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
        }
      }
    }
  });
});

// ── The day: rows, reuse, and the gate ────────────────────────────────

describe('a day of the card', () => {
  const D = NOON(2026, 8, 4);
  const today = rowsFor(CASABLANCA, D);
  const tomorrowFajr = rowsFor(CASABLANCA, NEXT(D)).Fajr;
  const day = (asrShadow: 1 | 2 = 1, t: TimingsMap = today, next: string | undefined = tomorrowFajr) =>
    daruriTimesForDay(D, CASABLANCA.lat, CASABLANCA.lng, t, next, asrShadow);

  it('has all five in Casablanca in September', () => {
    expect(Object.keys(day()).sort()).toEqual([...DARURI_KEYS].sort());
  });

  /**
   * Two of the five are rows the card already has, by the book's own
   * definition: Ẓuhr's first time ends where ʿAṣr's begins (fn. 656),
   * Maghrib's where Ishāʾ's begins (fn. 659). Recomputing them from
   * angles would put a second ʿAṣr and a second Ishāʾ on the card a few
   * minutes from the first, and the disagreement would read as a bug.
   */
  it('uses the ʿAṣr row for Ẓuhr’s boundary on a 1:1 setting', () => {
    expect(day(1).DhuhrDaruri).toBe(today.Asr);
    // Even when the row has been nudged by an offset the engine knows
    // nothing about — it is the row, not a recomputation of it.
    const nudged = plus(today.Asr, 3);
    expect(day(1, { ...today, Asr: nudged }).DhuhrDaruri).toBe(nudged);
  });

  it('uses the Ishāʾ row for Maghrib’s boundary', () => {
    expect(day().MaghribDaruri).toBe(today.Isha);
    const nudged = plus(today.Isha, 4);
    expect(day(1, { ...today, Isha: nudged }).MaghribDaruri).toBe(nudged);
  });

  /**
   * On Ḥanafī ʿAṣr the row is the 2:1 shadow, half an hour too late to
   * be a Mālikī boundary, so the 1:1 shadow is computed instead — and
   * lands well before the ʿAṣr the card shows underneath it, which is
   * what the settings warning is for.
   */
  it('computes the 1:1 shadow instead on a Ḥanafī setting', () => {
    const hanafiRows = rowsFor(CASABLANCA, D, { madhab: 'hanafi' });
    const boundary = day(2, hanafiRows).DhuhrDaruri!;
    expect(boundary).not.toBe(hanafiRows.Asr);
    // It is the real 1:1 ʿAṣr — the Shāfiʿī/Mālikī row of the same day.
    expect(boundary).toBe(today.Asr);
    // And a whole madhhab apart, not a rounding difference.
    const [bh, bm] = boundary.split(':').map(Number);
    const [ah, am] = hanafiRows.Asr.split(':').map(Number);
    expect((ah * 60 + am - (bh * 60 + bm) + 1440) % 1440).toBeGreaterThan(20);
  });

  it('is a third of the way from Maghrib to the next dawn for Ishāʾ', () => {
    const t = day();
    // Recomputed here from the same two rows, so the assertion is about
    // the arithmetic and not about a zone.
    const [mh, mm] = today.Maghrib.split(':').map(Number);
    const [fh, fm] = tomorrowFajr.split(':').map(Number);
    let night = fh * 60 + fm - (mh * 60 + mm);
    if (night <= 0) night += 1440;
    expect(t.IshaDaruri).toBe(plus(today.Maghrib, Math.round(night / 3)));
  });

  it('is left out rather than guessed when tomorrow is unknown', () => {
    const t = daruriTimesForDay(D, CASABLANCA.lat, CASABLANCA.lng, today, undefined, 1);
    expect(t.IshaDaruri).toBeUndefined();
    // Maghrib's is a row, not a guess, so it survives — checked against
    // today's Fajr as the stand-in for tomorrow's.
    expect(t.MaghribDaruri).toBe(today.Isha);
  });

  /**
   * Both ends of the night come from the provider, and either can arrive
   * malformed. A slip should cost the boundaries that depend on it, and
   * only those.
   */
  it('survives an unparseable Fajr for tomorrow', () => {
    const t = day(1, today, 'not-a-time');
    expect(t.IshaDaruri).toBeUndefined();
    expect(t.MaghribDaruri).toBeUndefined();
    // The daytime three do not depend on tomorrow at all.
    expect(t.FajrDaruri).toBeDefined();
    expect(t.DhuhrDaruri).toBeDefined();
    expect(t.AsrDaruri).toBeDefined();
  });

  it('survives an unparseable Maghrib', () => {
    const t = day(1, { ...today, Maghrib: 'n/a' });
    // Everything whose window Maghrib closes or opens is gone…
    expect(t.DhuhrDaruri).toBeUndefined();
    expect(t.AsrDaruri).toBeUndefined();
    expect(t.MaghribDaruri).toBeUndefined();
    expect(t.IshaDaruri).toBeUndefined();
    // …and Fajr's, which never touches it, is not.
    expect(t.FajrDaruri).toBeDefined();
  });
});

// ── The gate: every boundary inside the window the rows describe ─────

describe('a boundary is only shown inside the window the rows describe', () => {
  /**
   * The case that bit, from the app's own dataset. At 59°N a provider's
   * Fajr is a night-fraction rule or a printed table, not an angle, and
   * Stockholm's puts midsummer Fajr at 02:11 while *isfār* at −6° comes
   * out at 01:59. "Fajr's first time until 01:59" under a Fajr of 02:11
   * is a boundary on the wrong side of the prayer it bounds.
   *
   * Reproduced with the engine's own seventh-of-the-night rule rather
   * than the dataset's printed value, so the rows and the boundary are in
   * the same zone wherever this runs; the relationship is the same one.
   */
  it('drops isfār when the provider’s Fajr is already past it (Stockholm, midsummer)', () => {
    const D = NOON(2027, 5, 21);
    const rows = rowsFor(STOCKHOLM, D, { highLat: 'SeventhOfTheNight', fajr: 18, isha: 17 });
    const next = rowsFor(STOCKHOLM, NEXT(D), { highLat: 'SeventhOfTheNight', fajr: 18, isha: 17 }).Fajr;
    // The precondition the test is about: the rule puts Fajr AFTER isfār.
    // Measured wrap-aware, because in UTC a Stockholm summer dawn is the
    // previous calendar day.
    const solar = solarDaruriBoundaries(D, STOCKHOLM.lat, STOCKHOLM.lng);
    expect(solar.FajrDaruri).toBeDefined();
    const toMin = (c: string) => Number(c.slice(0, 2)) * 60 + Number(c.slice(3));
    const fajrAfterIsfar = (toMin(rows.Fajr) - toMin(solar.FajrDaruri!) + 1440) % 1440;
    expect(fajrAfterIsfar).toBeGreaterThan(0);
    expect(fajrAfterIsfar).toBeLessThan(180);

    const t = daruriTimesForDay(D, STOCKHOLM.lat, STOCKHOLM.lng, rows, next);
    expect(t.FajrDaruri).toBeUndefined();
    // The afternoon still makes sense on that card.
    expect(t.DhuhrDaruri).toBe(rows.Asr);
    expect(t.AsrDaruri).toBeDefined();
  });

  /**
   * Ishāʾ's boundary is not gated on the sun — it is a fraction of the
   * night, and a fraction is well defined for any interval its ends are
   * given for — but it IS gated on the rows. The app's offline engine at
   * Malmö on midsummer's day (adhan's default middle-of-the-night rule)
   * pushes Ishāʾ itself to about 01:10, so the first third of the night
   * falls hours BEFORE Ishāʾ begins. That is dropped.
   */
  it('drops the first third when it lands before Ishāʾ (Malmö, offline, midsummer)', () => {
    const D = NOON(2026, 5, 21);
    const rows = rowsFor(MALMO, D, { highLat: 'MiddleOfTheNight', fajr: 18, isha: 17 });
    const next = rowsFor(MALMO, NEXT(D), { highLat: 'MiddleOfTheNight', fajr: 18, isha: 17 }).Fajr;
    // Precondition: the rule has pushed Ishāʾ to the middle of the night.
    expect(rows.Isha).toBe(next);
    const t = daruriTimesForDay(D, MALMO.lat, MALMO.lng, rows, next);
    expect(t.IshaDaruri).toBeUndefined();
    expect(t.MaghribDaruri).toBeUndefined(); // Ishāʾ is not strictly inside (Maghrib, next Fajr) either
  });

  /**
   * The rows are in the LOCATION's zone and the solar instants in the
   * DEVICE's. For a manual location on another continent the two are
   * hours apart, and a number would be wrong rather than merely blank.
   * Simulated by shifting the rows three hours away from the geometry.
   */
  it('drops solar boundaries that are hours off the rows (remote manual location)', () => {
    const D = NOON(2026, 8, 4);
    const local = rowsFor(CASABLANCA, D);
    const shifted = Object.fromEntries(
      Object.entries(local).map(([k, v]) => [k, plus(v, 180)]),
    ) as TimingsMap;
    const next = plus(rowsFor(CASABLANCA, NEXT(D)).Fajr, 180);
    const t = daruriTimesForDay(D, CASABLANCA.lat, CASABLANCA.lng, shifted, next);
    expect(t.FajrDaruri).toBeUndefined();
    expect(t.AsrDaruri).toBeUndefined();
    // The row-based ones are still consistent with their own card.
    expect(t.DhuhrDaruri).toBe(shifted.Asr);
    expect(t.MaghribDaruri).toBe(shifted.Isha);
  });

  it('never claims a preferred window of zero length', () => {
    const D = NOON(2026, 8, 4);
    const rows = rowsFor(CASABLANCA, D);
    const t = daruriTimesForDay(
      D,
      CASABLANCA.lat,
      CASABLANCA.lng,
      { ...rows, Isha: rows.Maghrib }, // Ishāʾ at the very instant of Maghrib
      rowsFor(CASABLANCA, NEXT(D)).Fajr,
    );
    expect(t.MaghribDaruri).toBeUndefined();
  });
});

// ── Injecting into a week ─────────────────────────────────────────────

describe('injecting into a week', () => {
  const D = NOON(2026, 8, 4);
  const week: TimingsMap[] = [0, 1, 2].map(i => {
    const d = new Date(D.getFullYear(), D.getMonth(), D.getDate() + i, 12);
    const rows = rowsFor(CASABLANCA, d);
    // What `injectNightTimes` would have put there: the first third of
    // the night that begins on this day.
    const nextFajr = rowsFor(CASABLANCA, NEXT(d)).Fajr;
    const [mh, mm] = rows.Maghrib.split(':').map(Number);
    const [fh, fm] = nextFajr.split(':').map(Number);
    let night = fh * 60 + fm - (mh * 60 + mm);
    if (night <= 0) night += 1440;
    return { ...rows, Firstthird: plus(rows.Maghrib, Math.round(night / 3)) };
  });

  it('adds the boundaries without mutating the input', () => {
    const before = JSON.stringify(week);
    const out = injectDaruriTimes(week, D, CASABLANCA.lat, CASABLANCA.lng);
    expect(JSON.stringify(week)).toBe(before);
    expect(out[0].AsrDaruri).toBeDefined();
    expect(out[0]).not.toBe(week[0]);
  });

  /**
   * Ishāʾ's second time begins at the end of the first third, so the two
   * are the same instant under two names — and the first-third row stays.
   * It is a row the user turned on for qiyām, already in the month table,
   * the widget and the notification schedule; removing it because a
   * different setting was enabled would be a regression dressed as
   * tidiness.
   */
  it('names the instant twice rather than taking a row away', () => {
    const out = injectDaruriTimes(week, D, CASABLANCA.lat, CASABLANCA.lng);
    expect(out[0].IshaDaruri).toBe(week[0].Firstthird);
    expect(out[0].Firstthird).toBe(week[0].Firstthird);
  });

  it('leaves Ishāʾ out on the last day, which has no tomorrow to divide', () => {
    const out = injectDaruriTimes(week, D, CASABLANCA.lat, CASABLANCA.lng);
    const last = out[out.length - 1];
    expect(last.IshaDaruri).toBeUndefined();
    expect(last.Firstthird).toBe(week[2].Firstthird);
  });

  it('threads the ʿAṣr setting through', () => {
    const hanafiWeek = week.map((d, i) => ({
      ...d,
      Asr: rowsFor(CASABLANCA, new Date(D.getFullYear(), D.getMonth(), D.getDate() + i, 12), {
        madhab: 'hanafi',
      }).Asr,
    }));
    const maliki = injectDaruriTimes(hanafiWeek, D, CASABLANCA.lat, CASABLANCA.lng, 1);
    const hanafi = injectDaruriTimes(hanafiWeek, D, CASABLANCA.lat, CASABLANCA.lng, 2);
    expect(maliki[0].DhuhrDaruri).toBe(hanafiWeek[0].Asr);
    expect(hanafi[0].DhuhrDaruri).toBe(week[0].Asr); // the 1:1 one
  });

  /**
   * Every day gets its own geometry. The bug this guards against is the
   * easy one — computing today's boundaries once and stamping them across
   * the window — and it would be invisible over three days, which is why
   * the window here is four months.
   */
  it('walks the calendar rather than reusing one day of geometry', () => {
    const start = NOON(2026, 0, 1);
    const long = Array.from({ length: 120 }, (_, i) =>
      rowsFor(CASABLANCA, new Date(2026, 0, 1 + i, 12)),
    );
    const out = injectDaruriTimes(long, start, CASABLANCA.lat, CASABLANCA.lng);
    const yellow = out.map(d => d.AsrDaruri).filter(Boolean);
    expect(yellow).toHaveLength(120);
    // January's sunset and April's are more than an hour apart; a stamped
    // copy would give one value for all 120 days.
    expect(new Set(yellow).size).toBeGreaterThan(60);
    expect(yellow[0]).not.toBe(yellow[119]);
  });
});

// ── The engine, and the claims ────────────────────────────────────────

describe('the engine this depends on', () => {
  /**
   * `SolarTime` is a deep import — adhan.js does not re-export it — so a
   * version bump could leave the path resolving while the export stops
   * being the class. Everything would then quietly return nothing. This
   * is the assertion that turns that into a failing test rather than a
   * feature that silently stopped working.
   */
  it('imported something that can actually be constructed', () => {
    expect(daruriImportOk()).toBe(true);
  });

  it('and that something answers for an ordinary day', () => {
    const b = solarDaruriBoundaries(NOON(2026, 8, 4), CASABLANCA.lat, CASABLANCA.lng);
    expect(Object.keys(b)).toHaveLength(3);
  });
});

describe('what the app is claiming', () => {
  it('has a prayer and a confidence for every boundary', () => {
    for (const key of DARURI_KEYS) {
      expect(DARURI_OF[key]).toBeTruthy();
      expect(['computed', 'modelled']).toContain(DARURI_CONFIDENCE[key]);
    }
  });

  /**
   * The source gives −6° to −4° for *isfār*, and which end is chosen is a
   * fiqh decision, not a rounding one. Morning twilight brightens toward
   * sunrise, so the later angle is the later clock time — and a boundary
   * placed late tells someone they are still in the preferred window when
   * they may already be in the ḍarūrī one. The window this closes is one
   * a person enters without excuse only at a cost, so the app closes it
   * early. This pins that, because it is exactly the kind of constant
   * that gets "tidied" back to the middle of a range by someone who has
   * not thought about which direction the harm runs.
   */
  it('takes the early end of the isfār range, not the late one', () => {
    expect(ISFAR_ALTITUDE_DEGREES).toBe(-6);
    const SolarTime = require('adhan/lib/cjs/SolarTime').default;
    const st = new SolarTime(NOON(2026, 8, 4), {
      latitude: CASABLANCA.lat,
      longitude: CASABLANCA.lng,
    });
    expect(st.hourAngle(-6, false)).toBeLessThan(st.hourAngle(-4, false));
  });

  /**
   * The two that stand in for something the eye judges are the two the
   * app must not print in the same confident type as the rest.
   */
  it('calls exactly the two appearances modelled', () => {
    const modelled = DARURI_KEYS.filter(k => DARURI_CONFIDENCE[k] === 'modelled');
    expect(modelled).toEqual(['FajrDaruri', 'AsrDaruri']);
  });
});

// ── The month table's row height ──────────────────────────────────────

describe('the month table row', () => {
  const { monthRowHeight, MONTH_ROW_HEIGHT } = require('../src/screens/month/MonthTable');

  /**
   * `MonthTimesScreen`'s `getItemLayout` and the row's own stylesheet
   * both take their height from here. If they ever disagree the list
   * scrolls to the wrong offsets and `initialScrollIndex` lands days off
   * — a bug that looks like bad data rather than bad layout, which is
   * why it is pinned rather than left as two constants that happen to
   * match.
   */
  it('grows when the second times are shown, and only then', () => {
    expect(monthRowHeight(false)).toBe(MONTH_ROW_HEIGHT);
    expect(monthRowHeight(true)).toBeGreaterThan(MONTH_ROW_HEIGHT);
  });
});
