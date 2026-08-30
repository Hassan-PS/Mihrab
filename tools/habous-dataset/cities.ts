/**
 * Give the ministry's 191 cities coordinates, once, and commit the result.
 *
 * The dataset is keyed by city; the app has to pick the nearest one to
 * wherever the user is. Sweden's equivalent — `islamiskaForbundetCoords.json`
 * — was curated by hand. Morocco's list is longer, in Arabic, and full of
 * small towns, so it is geocoded instead and the output is reviewed in a
 * diff like any other data.
 *
 * Run rarely, by hand, from `.github/workflows/habous-cities.yml`. Not on a
 * schedule: the ministry's city list changes about never, and Nominatim's
 * usage policy is not something to spend on a cron.
 *
 * ACCURACY NEEDED IS LOW. This picks which city's table to serve, not the
 * times themselves — the ministry computes those from its own reference
 * points, which is exactly why we serve its table rather than computing.
 * Anything within a few kilometres selects the same city.
 *
 * A city that will not geocode is recorded with null coordinates rather
 * than dropped: it still has a table, it simply cannot be the nearest match
 * until someone fills the gap in by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseHabousCities } from '../../src/providers/habousParser';
import { fetchMinistryCity } from './fetchMinistry';

const OUT = path.join(__dirname, '../../src/providers/data/moroccoCities.json');
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const PHOTON = 'https://photon.komoot.io/api';
/** Nominatim asks for at most one request a second. Give it more than that. */
const DELAY_MS = 1200;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export type MoroccoCity = {
  /** The ministry's own `ville` id. Not contiguous: 1–169, then 301–322. */
  id: number;
  /** The ministry's own Arabic name, verbatim. */
  name: string;
  lat: number | null;
  lng: number | null;
  /** Which service answered, for the record. */
  source?: 'nominatim' | 'photon';
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mihrab prayer-times dataset (+https://github.com/Hassan-PS/Mihrab)',
      accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function geocode(name: string): Promise<Pick<MoroccoCity, 'lat' | 'lng' | 'source'>> {
  const q = encodeURIComponent(name);
  try {
    const rows = (await getJson(
      `${NOMINATIM}?q=${q}&countrycodes=ma&format=json&limit=1`,
    )) as Array<{ lat: string; lon: string }>;
    if (rows.length > 0) {
      return { lat: Number(rows[0].lat), lng: Number(rows[0].lon), source: 'nominatim' };
    }
  } catch {
    // fall through to the second service
  }
  try {
    // Photon is the app's own fallback geocoder, so this is not a new dependency.
    const fc = (await getJson(`${PHOTON}?q=${q}&limit=1&lang=default`)) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };
    const coords = fc.features?.[0]?.geometry?.coordinates;
    if (coords) return { lat: coords[1], lng: coords[0], source: 'photon' };
  } catch {
    // give up on this one
  }
  return { lat: null, lng: null };
}

/** Rough bounding box for Morocco incl. Western Sahara, as a sanity check. */
function plausible(lat: number, lng: number): boolean {
  return lat >= 20.5 && lat <= 36.2 && lng >= -17.5 && lng <= -0.8;
}

async function main(): Promise<number> {
  console.log('reading the ministry’s city list…');
  const { body } = await fetchMinistryCity(1, {
    onAttempt: (n, why) => console.log(`  attempt ${n}: ${why}`),
  });
  const listed = parseHabousCities(body);
  console.log(`  ${listed.length} cities`);

  const out: MoroccoCity[] = [];
  let located = 0;
  for (const [i, city] of listed.entries()) {
    const found = await geocode(`${city.name}, المغرب`);
    let { lat, lng, source } = found;
    if (lat !== null && lng !== null && !plausible(lat, lng)) {
      // A name that resolved somewhere else entirely — better a gap than a
      // city that silently serves Casablanca's times to someone in Oujda.
      console.log(`  ${city.id} ${city.name}: rejected ${lat},${lng} (outside Morocco)`);
      lat = null;
      lng = null;
      source = undefined;
    }
    if (lat !== null) located++;
    out.push({ id: city.id, name: city.name, lat, lng, ...(source ? { source } : {}) });
    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${listed.length}, ${located} located`);
    await sleep(DELAY_MS);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  const missing = out.filter(c => c.lat === null);
  console.log(`\nwrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`  located ${located}/${out.length}`);
  if (missing.length > 0) {
    console.log(`  no coordinates for ${missing.length}:`);
    for (const c of missing) console.log(`    ${c.id} ${c.name}`);
  }
  // Not a failure: a gap is a city that cannot be the NEAREST match yet, not
  // a broken dataset. It fails only if the whole thing came back empty.
  return located === 0 ? 1 : 0;
}

main().then(c => process.exit(c));
