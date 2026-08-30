/**
 * Check the geocoded city coordinates against the ministry's own times, and
 * correct what can be corrected.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * Geocoding placed 186 of 191 cities and got 32 of them wrong by more than
 * 25 km — several by hundreds. All of them still inside Morocco, so no
 * bounding box catches it:
 *
 *   مراكش   (Marrakech) → 232 km out      سبتة   (Ceuta)   → 210 km
 *   بويكرة              → 577 km out      الكويرة          → 665 km
 *   بئر أنزاران         → 838 km out
 *
 * A user in Marrakech would be matched to whatever city is nearest THOSE
 * coordinates and served its table, silently. That is the failure the whole
 * dataset exists to prevent, so a name-lookup alone cannot be trusted.
 *
 * ── WHAT THE MINISTRY'S TIMES CAN AND CANNOT TELL US ──────────────────
 *
 * LONGITUDE, sharply. Dhuhr is solar noon plus their five-minute margin,
 * and solar noon is longitude and the equation of time and nothing else. A
 * one-dimensional fit against a month of Dhuhr pins it to a few kilometres.
 *
 * LATITUDE, not at all — at this time of year. Measured at Casablanca
 * against the ministry's own August table: moving 100 km north changes
 * sunrise by 0.65 min and sunset by 0.65 min the other way. Near the
 * equinox the day is nearly the same length everywhere, so latitude is
 * flat in the objective and below the resolution of minute-rounded data.
 * An earlier version of this file tried to fit both and marched the whole
 * country into the Mediterranean; the fits it produced looked excellent by
 * their own residuals and were 100 km wrong. Fitting a parameter the data
 * does not constrain gives a confident wrong answer, which is worse than
 * no answer.
 *
 * ── SO: CORRECT THE LONGITUDE, AND USE IT AS A VERDICT ON THE REST ────
 *
 * If the ministry's longitude agrees with the geocode, the geocoder found
 * the right place and its latitude is worth keeping — with the longitude
 * replaced by the ministry's exact one. If they disagree, the geocoder
 * found somewhere else entirely and its latitude is worth nothing either,
 * so the city loses its coordinates.
 *
 * A city without coordinates still HAS a table; it simply cannot be the
 * nearest match until someone fills it in by hand. Coverage lost, silence
 * kept — and given what a wrong match means here, that is the right trade.
 *
 *   npx tsx tools/habous-dataset/solveCoords.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';
import type { DatasetDayTuple } from '../../src/providers/datasetTuple';

const ROOT = path.join(__dirname, '../..');
const CITIES_PATH = path.join(ROOT, 'src/providers/data/moroccoCities.json');
const CITY_DIR = path.join(ROOT, 'data/prayer-times/morocco/v1/cities');
const TZ = 'Africa/Casablanca';

/** The ministry publishes Dhuhr five minutes after solar noon. */
const DHUHR_MARGIN = 5;
/** Beyond this, the geocoder found a different place, not a nearby one. */
const DISAGREEMENT_KM = 25;

/**
 * Hand-supplied coordinates for cities the geocoder placed wrongly and that
 * are too important to leave unmatched — Marrakech above all.
 *
 * These are PROPOSALS, not assertions. Each is put through the same
 * longitude check as a geocoded one, so a misremembered coordinate is
 * dropped exactly like a bad geocode rather than being trusted because a
 * human typed it. That the ministry's own Dhuhr independently confirms
 * them is the reason they survive.
 */
const OVERRIDES: Record<number, { lat: number; lng: number }> = {
  24: { lat: 35.8894, lng: -5.3213 }, // سبتة — Ceuta
  26: { lat: 35.2158, lng: -4.6642 }, // الجبهة — Jebha
  40: { lat: 35.2923, lng: -2.9381 }, // مليلية — Melilla
  64: { lat: 33.0625, lng: -7.2472 }, // ابن أحمد — Ben Ahmed
  102: { lat: 34.0547, lng: -5.5236 }, // زرهون — Moulay Idriss Zerhoun
  104: { lat: 31.6295, lng: -7.9811 }, // مراكش — Marrakech
  109: { lat: 32.2361, lng: -7.9536 }, // الرحامنة — Rehamna (Benguerir)
  115: { lat: 31.4833, lng: -8.1 }, // تامصلوحت — Tameslouht
  129: { lat: 31.2833, lng: -4.2667 }, // الريصاني — Rissani
  166: { lat: 20.9167, lng: -17.05 }, // الكويرة — Lagouira
};

type CityFile = { id: number; city: string; days: Record<string, DatasetDayTuple> };
type City = {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  source?: string;
};

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Minutes past midnight, Moroccan wall clock. Offset resolved once per date. */
const offsetCache = new Map<number, number>();
function zoneOffsetMinutes(day: Date): number {
  const key = day.getTime();
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  const probe = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12));
  const local = probe.toLocaleString('en-US', { timeZone: TZ, hour12: false });
  const offset = Math.round((Date.parse(`${local} UTC`) - probe.getTime()) / 60000);
  offsetCache.set(key, offset);
  return offset;
}

function wallClock(d: Date, day: Date): number {
  const utcMinutes = (d.getTime() / 60000) % 1440;
  return ((((utcMinutes + zoneOffsetMinutes(day)) % 1440) + 1440) % 1440);
}

function params() {
  const p = CalculationMethod.Other();
  p.fajrAngle = 19;
  p.ishaAngle = 17;
  p.madhab = Madhab.Shafi;
  return p;
}

type Noon = { day: Date; solarNoon: number };

/** Mean squared Dhuhr error, in minutes, for a candidate longitude. */
function noonCost(lng: number, lat: number, rows: Noon[]): number {
  const p = params();
  let total = 0;
  for (const row of rows) {
    const t = new PrayerTimes(new Coordinates(lat, lng), row.day, p);
    total += (wallClock(t.dhuhr, row.day) - row.solarNoon) ** 2;
  }
  return total / rows.length;
}

/**
 * The longitude the ministry's Dhuhr implies. One dimension, so a sweep and
 * a bisection are plenty — and latitude barely enters solar noon, so an
 * approximate one is good enough to solve with.
 */
function solveLongitude(rows: Noon[], lat: number): { lng: number; rms: number } {
  let best = { lng: -7, cost: Infinity };
  for (let lng = -17; lng <= -0.9; lng += 0.25) {
    const c = noonCost(lng, lat, rows);
    if (c < best.cost) best = { lng, cost: c };
  }
  let step = 0.25;
  while (step > 0.0005) {
    step /= 2;
    for (const d of [-step, step]) {
      const c = noonCost(best.lng + d, lat, rows);
      if (c < best.cost) best = { lng: best.lng + d, cost: c };
    }
  }
  return { lng: Number(best.lng.toFixed(4)), rms: Math.sqrt(best.cost) };
}

function kmPerDegreeLongitude(lat: number): number {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

function main(): number {
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8')) as City[];
  if (!fs.existsSync(CITY_DIR)) {
    console.error(`no dataset at ${CITY_DIR} — run the builder first.`);
    return 1;
  }

  let corrected = 0;
  let overridden = 0;
  let dropped = 0;
  let untouched = 0;
  const rejected: string[] = [];

  const out = cities.map<City>(city => {
    const file = path.join(CITY_DIR, `${city.id}.json`);
    if (!fs.existsSync(file) || city.lat === null || city.lng === null) {
      untouched++;
      return city;
    }
    const proposed = OVERRIDES[city.id];
    const startLat = proposed?.lat ?? city.lat;
    const startLng = proposed?.lng ?? city.lng;
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as CityFile;
    const rows: Noon[] = Object.entries(data.days).map(([key, t]) => {
      const [y, m, d] = key.split('-').map(Number);
      return { day: new Date(y, m - 1, d), solarNoon: minutes(t[3]) - DHUHR_MARGIN };
    });
    if (rows.length < 5) {
      untouched++;
      return city;
    }

    const fit = solveLongitude(rows, startLat);
    const km = Math.abs(fit.lng - startLng) * kmPerDegreeLongitude(startLat);
    if (km > DISAGREEMENT_KM) {
      // The geocoder found a different place. Its latitude is no more
      // trustworthy than its longitude was, and a plausible-looking wrong
      // coordinate is the one outcome worse than a missing one.
      rejected.push(
        `  ${String(city.id).padStart(3)} ${city.name}: ` +
          `${proposed ? 'override' : 'geocoded'} ${startLng.toFixed(3)}, ` +
          `ministry ${fit.lng.toFixed(3)} — ${Math.round(km)} km apart, coordinates dropped`,
      );
      dropped++;
      return { id: city.id, name: city.name, lat: null, lng: null };
    }
    corrected++;
    if (proposed) overridden++;
    return {
      id: city.id,
      name: city.name,
      lat: startLat,
      lng: fit.lng,
      source: proposed ? 'checked-by-hand+ministry-lng' : 'geocode-lat+ministry-lng',
    };
  });

  fs.writeFileSync(CITIES_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`confirmed and corrected: ${corrected} (${overridden} from the override table)`);
  console.log(`dropped as wrong:        ${dropped}`);
  console.log(`left alone (no data):    ${untouched}`);
  console.log(`\nusable for matching:     ${out.filter(c => c.lat !== null).length}/${out.length}`);
  for (const line of rejected) console.log(line);
  return corrected === 0 ? 1 : 0;
}

process.exit(main());
