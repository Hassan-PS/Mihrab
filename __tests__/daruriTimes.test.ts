/**
 * The Mālikī second times — issue #19.
 *
 * The interesting assertions here are the orderings and the blanks. A
 * boundary that lands on the wrong side of the prayer it bounds is worse
 * than no boundary at all, and at high latitude some of these instants
 * do not occur — the app has to say nothing rather than invent one.
 *
 * Casablanca is the reference because the issue is written from there,
 * against the Habous table; Malmö and Tromsø are the places the geometry
 * runs out.
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
  ISFAR_ALTITUDE_DEGREES,
  ISFIRAR_ALTITUDE_DEGREES,
  MALIKI_SHADOW_LENGTH,
  RED_TWILIGHT_DEPRESSION_DEGREES,
  DARURI_KEYS,
  DARURI_OF,
  daruriTimesForDay,
  injectDaruriTimes,
  solarDaruriBoundaries,
} from '../src/prayer/daruriTimes';
import type { TimingsMap } from '../src/types/prayer';

const CASABLANCA = { lat: 33.5731, lng: -7.5898 };
const MALMO = { lat: 55.605, lng: 13.0038 };
const TROMSO = { lat: 69.6492, lng: 18.9553 };

describe('the boundaries at a latitude where every one of them happens', () => {
  const at = (y: number, m: number, d: number) =>
    solarDaruriBoundaries(
      new Date(y, m, d, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
    );

  /** The same instants in decimal UTC hours, straight from the engine. */
  const solarHours = (y: number, m: number, d: number) => {
    const SolarTime = require('adhan/lib/cjs/SolarTime').default;
    const st = new SolarTime(new Date(y, m, d, 12, 0, 0), {
      latitude: CASABLANCA.lat,
      longitude: CASABLANCA.lng,
    });
    return {
      dawn: st.hourAngle(-19, false),
      isfar: st.hourAngle(ISFAR_ALTITUDE_DEGREES, false),
      sunrise: st.sunrise,
      transit: st.transit,
      asr: st.afternoon(MALIKI_SHADOW_LENGTH),
      isfirar: st.hourAngle(ISFIRAR_ALTITUDE_DEGREES, true),
      sunset: st.sunset,
      red: st.hourAngle(-RED_TWILIGHT_DEPRESSION_DEGREES, true),
    };
  };

  it('produces all four solar boundaries', () => {
    const b = at(2026, 8, 4);
    expect(Object.keys(b).sort()).toEqual(
      ['AsrDaruri', 'DhuhrDaruri', 'FajrDaruri', 'MaghribDaruri'].sort(),
    );
  });

  /**
   * Where each boundary sits in the day, stated about the SUN rather than
   * about a printed clock.
   *
   * A local-clock comparison would be a claim about the machine's time
   * zone as much as about the sky — run in Tokyo, Morocco's evening lands
   * after local midnight and "sunset is later than noon" stops being true
   * of the string. These are the same four instants in decimal UTC hours,
   * read off the same engine the module uses, so the assertion holds
   * wherever the suite runs.
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
      // The red goes only after the sun has gone.
      expect(solar.red).toBeGreaterThan(solar.sunset);
    }
  });

  /**
   * Ẓuhr's boundary IS ʿAṣr at the 1:1 shadow — the same instant the app
   * already computes for a Mālikī or Shāfiʿī user. Checked against
   * adhan's own Shāfiʿī ʿAṣr rather than against a number typed in here,
   * so the two can never drift.
   */
  it('ends Ẓuhr exactly where the 1:1 ʿAṣr begins', () => {
    const { Coordinates, CalculationMethod, PrayerTimes, Madhab } = require('adhan');
    const params = CalculationMethod.Other();
    params.fajrAngle = 19;
    params.ishaAngle = 17;
    params.madhab = Madhab.Shafi;
    const pt = new PrayerTimes(
      new Coordinates(CASABLANCA.lat, CASABLANCA.lng),
      new Date(2026, 8, 4, 12, 0, 0),
      params,
    );
    const asr = `${String(pt.asr.getHours()).padStart(2, '0')}:${String(
      pt.asr.getMinutes(),
    ).padStart(2, '0')}`;
    expect(at(2026, 8, 4).DhuhrDaruri).toBe(asr);
  });
});

describe('when the sky has no answer', () => {
  /**
   * Around midsummer in Malmö the sun never gets 17° below the horizon,
   * so the red twilight never goes and Maghrib's second time has no
   * beginning. Nothing is the honest answer.
   */
  it('omits the red twilight where it never leaves', () => {
    const b = solarDaruriBoundaries(
      new Date(2026, 5, 21, 12, 0, 0),
      MALMO.lat,
      MALMO.lng,
    );
    expect(b.MaghribDaruri).toBeUndefined();
    // The daytime ones are still real and still shown.
    expect(b.DhuhrDaruri).toBeDefined();
    expect(b.AsrDaruri).toBeDefined();
  });

  it('gives Malmö every boundary in December', () => {
    const b = solarDaruriBoundaries(
      new Date(2026, 11, 21, 12, 0, 0),
      MALMO.lat,
      MALMO.lng,
    );
    expect(Object.keys(b)).toHaveLength(4);
  });

  /**
   * The case the reviewer caught, and the reason the gate exists.
   *
   * Under the midnight sun every one of these windows is open-ended: the
   * sun does not set, so Ẓuhr's and ʿAṣr's second times have no close.
   * The ANGLES are still reached — the sun descends through +5° and the
   * 1:1 shadow happens — so an implementation that only asked "was the
   * angle reached?" would print "ʿAṣr's first time until 21:00" for a
   * window ending at a sunset that never comes.
   */
  it('says nothing at all under the midnight sun', () => {
    const b = solarDaruriBoundaries(
      new Date(2026, 5, 21, 12, 0, 0),
      TROMSO.lat,
      TROMSO.lng,
    );
    expect(b).toEqual({});
  });

  /** The mirror of it: in the polar night nothing rises to end Fajr's. */
  it('says nothing in the polar night either', () => {
    const b = solarDaruriBoundaries(
      new Date(2026, 11, 21, 12, 0, 0),
      TROMSO.lat,
      TROMSO.lng,
    );
    expect(b).toEqual({});
  });

  it('holds that line further north as well', () => {
    const b = solarDaruriBoundaries(
      new Date(2026, 5, 21, 12, 0, 0),
      78.2232,
      15.6469,
    );
    expect(b).toEqual({});
  });

  /**
   * The gate is about the sun, not about the latitude: Tromsø in the
   * shoulder seasons has ordinary days and gets ordinary boundaries.
   */
  it('gives the same place every boundary once the sun rises and sets again', () => {
    const b = solarDaruriBoundaries(
      new Date(2026, 8, 21, 12, 0, 0),
      TROMSO.lat,
      TROMSO.lng,
    );
    expect(Object.keys(b).sort()).toEqual(
      ['AsrDaruri', 'DhuhrDaruri', 'FajrDaruri', 'MaghribDaruri'].sort(),
    );
  });

  it('never returns NaN dressed up as a time', () => {
    for (const place of [CASABLANCA, MALMO, TROMSO]) {
      for (let month = 0; month < 12; month++) {
        const b = solarDaruriBoundaries(
          new Date(2026, month, 15, 12, 0, 0),
          place.lat,
          place.lng,
        );
        for (const value of Object.values(b)) {
          expect(value).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
        }
      }
    }
  });
});

describe("Ishāʾ's boundary", () => {
  const today: TimingsMap = {
    Fajr: '05:30',
    Sunrise: '07:06',
    Dhuhr: '13:29',
    Asr: '17:00',
    Maghrib: '19:52',
    Isha: '21:10',
  };

  it('is a third of the way from Maghrib to the next dawn', () => {
    const t = daruriTimesForDay(
      new Date(2026, 8, 4, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
      today,
      '05:31',
    );
    // 19:52 → 05:31 is 9h39m; a third is 3h13m → 23:05.
    expect(t.IshaDaruri).toBe('23:05');
  });

  it('is left out rather than guessed when tomorrow is unknown', () => {
    const t = daruriTimesForDay(
      new Date(2026, 8, 4, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
      today,
      undefined,
    );
    expect(t.IshaDaruri).toBeUndefined();
  });

  it('survives a provider sending something unparseable', () => {
    const t = daruriTimesForDay(
      new Date(2026, 8, 4, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
      { ...today, Maghrib: 'n/a' },
      '05:31',
    );
    expect(t.IshaDaruri).toBeUndefined();
    expect(t.DhuhrDaruri).toBeDefined();
  });
});

describe('injecting into a week', () => {
  const day = (fajr: string, maghrib: string): TimingsMap => ({
    Fajr: fajr,
    Sunrise: '07:06',
    Dhuhr: '13:29',
    Asr: '17:00',
    Maghrib: maghrib,
    Isha: '21:10',
    Firstthird: '23:05',
  });
  const week = [day('05:30', '19:52'), day('05:31', '19:50'), day('05:32', '19:49')];

  it('adds the boundaries without mutating the input', () => {
    const before = JSON.stringify(week);
    const out = injectDaruriTimes(
      week,
      new Date(2026, 8, 4, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
    );
    expect(JSON.stringify(week)).toBe(before);
    expect(out[0].MaghribDaruri).toBeDefined();
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
    const out = injectDaruriTimes(
      week,
      new Date(2026, 8, 4, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
    );
    expect(out[0].IshaDaruri).toBe('23:05');
    expect(out[0].Firstthird).toBe('23:05');
  });

  it('leaves Ishāʾ out on the last day, which has no tomorrow to divide', () => {
    const out = injectDaruriTimes(
      week,
      new Date(2026, 8, 4, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
    );
    const last = out[out.length - 1];
    expect(last.IshaDaruri).toBeUndefined();
    expect(last.Firstthird).toBe('23:05');
  });

  /**
   * Every day gets its own geometry. The bug this guards against is the
   * easy one — computing today's boundaries once and stamping them across
   * the window — and it would be invisible over three days, which is why
   * the window here is four months.
   */
  it('walks the calendar rather than reusing one day of geometry', () => {
    const long = Array.from({ length: 120 }, () => day('05:30', '19:52'));
    const out = injectDaruriTimes(
      long,
      new Date(2026, 0, 1, 12, 0, 0),
      CASABLANCA.lat,
      CASABLANCA.lng,
    );
    const red = out.map(d => d.MaghribDaruri).filter(Boolean);
    expect(red).toHaveLength(120);
    // January's red twilight and April's are more than an hour apart; a
    // stamped copy would give one value for all 120 days.
    expect(new Set(red).size).toBeGreaterThan(60);
    expect(red[0]).not.toBe(red[119]);
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
   * The two that stand in for something the eye judges are the two the
   * app must not print in the same confident type as the rest.
   */
  it('calls exactly the two appearances modelled', () => {
    const modelled = DARURI_KEYS.filter(
      k => DARURI_CONFIDENCE[k] === 'modelled',
    );
    expect(modelled).toEqual(['FajrDaruri', 'AsrDaruri']);
  });
});
