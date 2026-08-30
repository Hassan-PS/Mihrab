/**
 * The offline fallback computes what AlAdhan would have served.
 *
 * `calculationMethod` is an AlAdhan method id everywhere in this app: the
 * picker stores it, `aladhan.ts` forwards it verbatim, and `localAdhan.ts`
 * computes with it when the network is gone. If those two disagree, a
 * user's prayer times change depending on whether they have signal — and
 * nothing in the app would say so.
 *
 * They disagreed for five methods. `parametersForMethod` mapped several
 * named methods onto some other method's angles:
 *
 *    0  Shia Ithna-Ashari, Qum       → Tehran 17.7/14   (should be 16/14)
 *    8  Gulf Region                  → Dubai 18.2/18.2  (should be 19.5 / 90 min)
 *   12  Union Org. Islamic de France → MWL 18/17        (should be 12/12)
 *   14  Spiritual Adm. of Russia     → Moonsighting     (should be 16/15)
 *   21  Morocco                      → absent, so MWL   (should be 19/17 + margins)
 *
 * Morocco is the one that got reported — issue #10, "prayer times in my
 * location are a bit off by minutes" — and only barely, because AlAdhan
 * already auto-selects Morocco for Moroccan coordinates. The gap showed
 * only to someone who had picked a method by hand, and there was no right
 * one to pick, or who was computing offline.
 *
 * The expectations below are READINGS, taken from AlAdhan on 2026-08-30
 * for a city that uses each method. They are not derived from the same
 * parameters they check, which is the whole point: two independent
 * implementations agreeing is evidence, one implementation agreeing with
 * itself is not.
 */
// The shared setup stubs `adhan` with fixed times that ignore every
// parameter — fine for the tests that only need prayer times in order,
// useless here. This file exists to check the arithmetic, so it uses the
// real library.
jest.unmock('adhan');

import { computeLocalAdhanTimes } from '../src/providers/localAdhan';
import { CALCULATION_METHODS } from '../src/settings/methods';

/**
 * What AlAdhan served for 30 Aug 2026, quoted from its JSON.
 *
 * Asr is deliberately absent. adhan.js computes it one to two minutes
 * before AlAdhan for EVERY method, presets included — a shadow-length
 * rounding difference, not a parameter — so pinning it here would be
 * pinning someone else's rounding. It is asserted loosely below instead.
 */
const ALADHAN = [
  {
    id: 0,
    method: 'Shia Ithna-Ashari, Leva Institute, Qum',
    city: 'Qum',
    latitude: 34.6416,
    longitude: 50.8746,
    timeZone: 'Asia/Tehran',
    // Maghrib is 16 minutes past a sunset of 18:36: held until the redness
    // goes. No angle produces that, and /methods does not mention it.
    times: { Fajr: '04:20', Sunrise: '05:38', Dhuhr: '12:07', Maghrib: '18:52', Isha: '19:43' },
    asr: '15:46',
  },
  {
    id: 8,
    method: 'Gulf Region',
    city: 'Dubai',
    latitude: 25.2048,
    longitude: 55.2708,
    timeZone: 'Asia/Dubai',
    // Isha is Maghrib + 90 minutes, not an angle: 18:40 → 20:10.
    times: { Fajr: '04:33', Sunrise: '05:59', Dhuhr: '12:20', Maghrib: '18:40', Isha: '20:10' },
    asr: '15:50',
  },
  {
    id: 12,
    method: 'Union Organization Islamic de France',
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    timeZone: 'Europe/Paris',
    times: { Fajr: '05:51', Sunrise: '07:04', Dhuhr: '13:51', Maghrib: '20:37', Isha: '21:50' },
    asr: '17:37',
  },
  {
    id: 14,
    method: 'Spiritual Administration of Muslims of Russia',
    city: 'Moscow',
    latitude: 55.7558,
    longitude: 37.6173,
    timeZone: 'Europe/Moscow',
    times: { Fajr: '03:23', Sunrise: '05:30', Dhuhr: '12:30', Maghrib: '19:29' },
    // Isha at 55.8°N is within a minute; high latitude, left loose.
    asr: '16:17',
  },
  {
    id: 21,
    method: 'Morocco',
    city: 'Rabat',
    latitude: 34.0209,
    longitude: -6.8416,
    timeZone: 'Africa/Casablanca',
    // Dhuhr and Maghrib carry the ministry's five-minute margin. Sunset is
    // 19:56 for every method at this coordinate; Morocco's Maghrib is 20:01.
    times: { Fajr: '05:27', Sunrise: '06:59', Dhuhr: '13:33', Maghrib: '20:01', Isha: '21:18' },
    asr: '17:06',
  },
] as const;

/** 30 Aug 2026, built from parts so the box's timezone cannot move it. */
const DATE = new Date(2026, 7, 30);

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * `computeLocalAdhanTimes` formats in the BOX's timezone, which is not the
 * city's. Re-derive the wall clock the city would read, so the fixture can
 * be quoted as AlAdhan printed it.
 */
function inCityTime(hhmm: string, timeZone: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const local = new Date(2026, 7, 30, h, m);
  return local.toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

describe('offline computation agrees with the API it stands in for', () => {
  it.each(ALADHAN.map(c => [c.id, c.method, c] as const))(
    'method %i (%s)',
    (_id, _name, fixture) => {
      const got = computeLocalAdhanTimes({
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        date: DATE,
        calculationMethod: fixture.id,
        school: 0,
      });
      for (const [prayer, expected] of Object.entries(fixture.times)) {
        const mine = inCityTime(
          got.timings[prayer as keyof typeof got.timings]!,
          fixture.timeZone,
        );
        expect(`${prayer} ${mine}`).toBe(`${prayer} ${expected}`);
      }
    },
  );

  it.each(ALADHAN.map(c => [c.id, c] as const))(
    'method %i computes Asr within adhan.js’s known rounding of AlAdhan',
    (_id, fixture) => {
      const got = computeLocalAdhanTimes({
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        date: DATE,
        calculationMethod: fixture.id,
        school: 0,
      });
      const mine = minutes(inCityTime(got.timings.Asr, fixture.timeZone));
      const theirs = minutes(fixture.asr);
      // Early by 0–2 minutes, never late, and never further out — which is
      // what makes it a rounding difference rather than a wrong parameter.
      expect(theirs - mine).toBeGreaterThanOrEqual(0);
      expect(theirs - mine).toBeLessThanOrEqual(2);
    },
  );
});

describe('a Moroccan user has a method to pick', () => {
  it('offers Morocco', () => {
    const morocco = CALCULATION_METHODS.find(m => m.id === 21);
    expect(morocco).toBeDefined();
    expect(morocco!.name).toBe('Morocco');
    expect(morocco!.nameKey).toBe('methods.21');
  });

  it('names it in every language the app speaks', () => {
    const { readdirSync, readFileSync } = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
    const locales = readdirSync(dir).filter((f: string) => f.endsWith('.json'));
    expect(locales.length).toBeGreaterThanOrEqual(13);
    for (const file of locales) {
      const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
      expect(`${file}: ${typeof json.methods?.['21']}`).toBe(`${file}: string`);
      expect(json.methods['21'].length).toBeGreaterThan(0);
    }
  });

  it('every method in the picker can actually be computed offline', () => {
    // The gap Morocco fell into: an id the picker offers but the local
    // fallback has no case for silently becomes Muslim World League.
    const mwl = computeLocalAdhanTimes({
      latitude: 34.0209,
      longitude: -6.8416,
      date: DATE,
      calculationMethod: 3,
      school: 0,
    });
    const distinct = CALCULATION_METHODS.filter(m => m.id !== 'auto' && m.id !== 3);
    const collisions = distinct.filter(m => {
      const got = computeLocalAdhanTimes({
        latitude: 34.0209,
        longitude: -6.8416,
        date: DATE,
        calculationMethod: m.id as number,
        school: 0,
      });
      return JSON.stringify(got.timings) === JSON.stringify(mwl.timings);
    });
    expect(collisions.map(m => `${m.id} ${m.name}`)).toEqual([]);
  });
});
