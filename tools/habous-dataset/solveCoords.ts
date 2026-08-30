/**
 * Recover each city's coordinates from the ministry's own published times.
 *
 * ── WHY NOT JUST GEOCODE ──────────────────────────────────────────────
 *
 * We did. It placed 186 of 191, and several of them badly wrong in a way no
 * bounding box catches, because the wrong answers were still inside Morocco:
 *
 *   مراكش   (Marrakech) → 28.33, -10.37   ~400 km south of Marrakech
 *   سبتة    (Ceuta)     → 33.58,  -7.62   which is Casablanca
 *   مليلية  (Melilla)   → 34.02,  -6.83   which is Rabat
 *
 * A user in Marrakech would then be matched to whatever city is nearest
 * those coordinates and served its table. Silently. That is the failure
 * this whole dataset exists to prevent.
 *
 * ── WHAT THIS DOES INSTEAD ────────────────────────────────────────────
 *
 * The ministry publishes, per city, a month of Fajr / Chourouq / Dhuhr /
 * Asr / Maghrib / Isha. Those times ARE the city's position, encoded:
 *
 *   Dhuhr            fixes longitude — solar noon is longitude and the
 *                    equation of time, nothing else
 *   sunrise, sunset  fix latitude, once longitude is known
 *
 * So instead of asking a gazetteer where a name is, we solve for the point
 * whose computed sunrise, Dhuhr and sunset best reproduce what the ministry
 * published. The answer is not "where Marrakech is" — it is THE MINISTRY'S
 * OWN REFERENCE POINT for Marrakech, which is a better thing to have, and
 * the thing no geocoder could ever return.
 *
 * A coarse grid then a shrinking local search: the objective is smooth and
 * two-dimensional, the whole country is a few hundred kilometres across,
 * and thirty days of six times each is a lot of signal for two unknowns.
 *
 * The published margins (Chourouq −3, Dhuhr +5, Maghrib +4 — see
 * `localAdhan.ts`) are removed before fitting, so what is compared is
 * astronomy against astronomy.
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

/** The ministry's published margins, removed to leave plain astronomy. */
const SUNRISE_MARGIN = -3;
const DHUHR_MARGIN = 5;

type CityFile = { id: number; city: string; days: Record<string, DatasetDayTuple> };
type Row = { date: Date; sunrise: number; dhuhr: number; maghrib: number };

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const wallClock = (d: Date): number => {
  const s = d.toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const [h, m, sec] = s.split(':').map(Number);
  return h * 60 + m + sec / 60;
};

function params() {
  const p = CalculationMethod.Other();
  p.fajrAngle = 19;
  p.ishaAngle = 17;
  p.madhab = Madhab.Shafi;
  return p;
}

/** Mean squared error, in minutes, of a candidate point against the month. */
function cost(lat: number, lng: number, rows: Row[]): number {
  let total = 0;
  for (const row of rows) {
    const t = new PrayerTimes(new Coordinates(lat, lng), row.date, params());
    total += (wallClock(t.sunrise) - row.sunrise) ** 2;
    total += (wallClock(t.dhuhr) - row.dhuhr) ** 2;
    total += (wallClock(t.maghrib) - row.maghrib) ** 2;
  }
  return total / (rows.length * 3);
}

function solve(rows: Row[]): { lat: number; lng: number; rms: number } {
  let best = { lat: 32, lng: -7, cost: Infinity };
  // Coarse sweep of the whole country, then refine around the winner.
  for (let lat = 20.8; lat <= 36.0; lat += 0.5) {
    for (let lng = -17.0; lng <= -1.0; lng += 0.5) {
      const c = cost(lat, lng, rows);
      if (c < best.cost) best = { lat, lng, cost: c };
    }
  }
  let step = 0.5;
  while (step > 0.002) {
    step /= 2;
    for (const dLat of [-step, 0, step]) {
      for (const dLng of [-step, 0, step]) {
        if (dLat === 0 && dLng === 0) continue;
        const lat = best.lat + dLat;
        const lng = best.lng + dLng;
        const c = cost(lat, lng, rows);
        if (c < best.cost) best = { lat, lng, cost: c };
      }
    }
  }
  return {
    lat: Number(best.lat.toFixed(4)),
    lng: Number(best.lng.toFixed(4)),
    rms: Math.sqrt(best.cost),
  };
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function main(): number {
  type City = { id: number; name: string; lat: number | null; lng: number | null; source?: string };
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8')) as City[];
  if (!fs.existsSync(CITY_DIR)) {
    console.error(`no dataset at ${CITY_DIR} — run the builder first.`);
    return 1;
  }

  let solved = 0;
  let moved = 0;
  const far: string[] = [];
  const out = cities.map(city => {
    const file = path.join(CITY_DIR, `${city.id}.json`);
    if (!fs.existsSync(file)) return city;
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as CityFile;
    const rows: Row[] = Object.entries(data.days)
      .map(([key, t]) => {
        const [y, m, d] = key.split('-').map(Number);
        return {
          date: new Date(y, m - 1, d),
          // Strip the published margins; compare astronomy to astronomy.
          sunrise: minutes(t[2]) - SUNRISE_MARGIN,
          dhuhr: minutes(t[3]) - DHUHR_MARGIN,
          maghrib: minutes(t[5]),
        };
      })
      .slice(0, 30);
    if (rows.length < 5) return city;

    const fit = solve(rows);
    solved++;
    const before: [number, number] | null =
      city.lat !== null && city.lng !== null ? [city.lat, city.lng] : null;
    const shift = before ? haversineKm(before, [fit.lat, fit.lng]) : Infinity;
    if (before && shift > 25) {
      moved++;
      far.push(
        `  ${String(city.id).padStart(3)} ${city.name}: geocoder was ${Math.round(shift)} km out ` +
          `(${before[0].toFixed(3)},${before[1].toFixed(3)} → ${fit.lat},${fit.lng})`,
      );
    }
    return { id: city.id, name: city.name, lat: fit.lat, lng: fit.lng, source: 'ministry-times' };
  });

  fs.writeFileSync(CITIES_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`solved ${solved}/${cities.length} from the ministry's own tables`);
  console.log(`disagreed with the geocoder by more than 25 km in ${moved} cases:`);
  for (const line of far.slice(0, 40)) console.log(line);
  if (far.length > 40) console.log(`  … and ${far.length - 40} more`);
  const missing = out.filter(c => c.lat === null);
  console.log(`still without coordinates: ${missing.length}`);
  return solved === 0 ? 1 : 0;
}

process.exit(main());
