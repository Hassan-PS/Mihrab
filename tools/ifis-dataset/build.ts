/**
 * Islamiska Förbundet dataset builder — runs server-side in GitHub Actions
 * (see `.github/workflows/ifis-dataset.yml`), NOT on user devices.
 *
 * Scrapes the bönetider widget once for every Swedish city in
 * `src/providers/islamiskaForbundetCoords.json` and writes:
 *   • data/prayer-times/v1/cities/<slug>.json  — full rolling window per city
 *   • data/prayer-times/v1/index.json          — coverage + city list
 *   • src/providers/data/ifisSeed.json         — compact bundled seed (near-term)
 *
 * Design notes:
 *   • Incremental: existing days are kept; only MISSING days up to the horizon
 *     are fetched, so steady-state runs make ~one request per city per new day.
 *   • Date-major: fetches near-term dates for ALL cities first, so a budget cap
 *     still yields full near-term coverage everywhere (freshness passes).
 *   • Gentle: fixed delay between requests + bounded retries.
 *   • Alarming on failure: exits non-zero (→ the workflow emails) when the
 *     origin looks down (high failure rate) or near-term coverage is missing.
 *
 * Run: `npx tsx tools/ifis-dataset/build.ts`
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseIslamiskaForbundetHtml,
  citySlug,
  timingsToTuple,
  type DatasetDayTuple,
} from '../../src/providers/islamiskaForbundetParser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

const COORDS_PATH = join(REPO, 'src/providers/islamiskaForbundetCoords.json');
const OUT_DIR = join(REPO, 'data/prayer-times/v1');
const CITIES_DIR = join(OUT_DIR, 'cities');
const INDEX_PATH = join(OUT_DIR, 'index.json');
const SEED_PATH = join(REPO, 'src/providers/data/ifisSeed.json');

const WIDGET_URL =
  'https://www.islamiskaforbundet.se/wp-content/plugins/bonetider/Bonetider_Widget.php';
const TZ = 'Europe/Stockholm';

// Tunables (overridable via env for the initial backfill).
const HORIZON_DAYS = intEnv('IFIS_HORIZON_DAYS', 400); // how far ahead to cover
const DROP_BEFORE_DAYS = intEnv('IFIS_DROP_BEFORE_DAYS', 3); // prune old past days
const SEED_DAYS = intEnv('IFIS_SEED_DAYS', 60); // bundled seed window
const MAX_REQUESTS = intEnv('IFIS_MAX_REQUESTS', 8000); // per-run request budget
const MAX_WALL_MS = intEnv('IFIS_MAX_WALL_MIN', 50) * 60_000; // per-run time budget
const REQUEST_DELAY_MS = intEnv('IFIS_REQUEST_DELAY_MS', 300);
const FRESHNESS_MIN_DAYS = intEnv('IFIS_FRESHNESS_MIN_DAYS', 14);

function intEnv(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

type CityDays = Record<string, DatasetDayTuple>;
type CityFile = {
  city: string;
  slug: string;
  timezone: string;
  builtAt: string;
  days: CityDays;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Stockholm "today" as YYYY-MM-DD (en-CA yields ISO order). */
function stockholmToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Calendar date string N days after `baseKey` (computed at noon UTC, DST-safe). */
function addDays(baseKey: string, n: number): string {
  const base = new Date(`${baseKey}T12:00:00Z`);
  return new Date(base.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

async function fetchDay(city: string, dateKey: string): Promise<DatasetDayTuple | null> {
  const body = new URLSearchParams({
    ifis_bonetider_widget_city: `${city}, SE`,
    ifis_bonetider_widget_date: dateKey,
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(WIDGET_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html,*/*',
          'User-Agent': 'Mihrab dataset builder (+https://github.com/Hassan-PS/Mihrab)',
          Origin: 'https://www.islamiskaforbundet.se',
          Referer: 'https://www.islamiskaforbundet.se/bonetider/',
        },
        body: body.toString(),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        if (res.status >= 500 && attempt < 3) {
          await sleep(500 * attempt);
          continue;
        }
        return null;
      }
      const html = await res.text();
      const timings = parseIslamiskaForbundetHtml(html, city);
      return timingsToTuple(timings);
    } catch {
      if (attempt < 3) {
        await sleep(500 * attempt);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function loadExistingCity(slug: string): Promise<CityDays> {
  const p = join(CITIES_DIR, `${slug}.json`);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(await readFile(p, 'utf8')) as CityFile;
    return parsed.days ?? {};
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  await mkdir(CITIES_DIR, { recursive: true });
  await mkdir(dirname(SEED_PATH), { recursive: true });

  const coords = JSON.parse(await readFile(COORDS_PATH, 'utf8')) as Record<
    string,
    { lat: number; lng: number }
  >;
  const cities = Object.keys(coords).map(name => ({ name, slug: citySlug(name) }));

  // Sanity: slugs must be unique or per-city files collide.
  const slugSet = new Set<string>();
  for (const c of cities) {
    if (slugSet.has(c.slug)) throw new Error(`Duplicate city slug "${c.slug}" (${c.name})`);
    slugSet.add(c.slug);
  }

  const today = stockholmToday();
  const dropBefore = addDays(today, -DROP_BEFORE_DAYS);
  const horizonKeys: string[] = [];
  for (let i = 0; i <= HORIZON_DAYS; i++) horizonKeys.push(addDays(today, i));

  // Load + prune existing data.
  const data = new Map<string, CityDays>();
  for (const c of cities) {
    const days = await loadExistingCity(c.slug);
    for (const k of Object.keys(days)) if (k < dropBefore) delete days[k];
    data.set(c.slug, days);
  }

  // Date-major fetch of missing days, within budgets.
  const startedAt = Date.now();
  let requests = 0;
  let failures = 0;
  let budgetHit = false;

  outer: for (const dateKey of horizonKeys) {
    for (const c of cities) {
      const days = data.get(c.slug)!;
      if (days[dateKey]) continue; // already have it (incremental)
      if (requests >= MAX_REQUESTS || Date.now() - startedAt >= MAX_WALL_MS) {
        budgetHit = true;
        break outer;
      }
      const tuple = await fetchDay(c.name, dateKey);
      requests++;
      if (tuple) days[dateKey] = tuple;
      else failures++;
      await sleep(REQUEST_DELAY_MS);
    }
  }

  // Detect a dead/unhealthy origin: many attempts, mostly failing.
  const failRate = requests > 0 ? failures / requests : 0;
  const originUnhealthy = requests >= 20 && failRate > 0.5;

  // Write per-city files (sorted keys for stable diffs).
  const builtAt = new Date().toISOString();
  let minCoverage = Infinity; // min consecutive-from-today, over cities that have ANY data
  let nearCells = 0; // (city × near-term-day) cells considered
  let nearFilled = 0; // ...that are present
  const deadCities: string[] = []; // widget returns nothing for these (unsupported name)
  for (const c of cities) {
    const days = data.get(c.slug)!;
    const sortedKeys = Object.keys(days).sort();
    const sortedDays: CityDays = {};
    for (const k of sortedKeys) sortedDays[k] = days[k];
    const file: CityFile = {
      city: c.name,
      slug: c.slug,
      timezone: TZ,
      builtAt,
      days: sortedDays,
    };
    await writeFile(join(CITIES_DIR, `${c.slug}.json`), JSON.stringify(file) + '\n');

    if (sortedKeys.length === 0) deadCities.push(c.name);
    else {
      let covered = 0;
      while (days[addDays(today, covered)]) covered++;
      minCoverage = Math.min(minCoverage, covered);
    }
    // Near-term fill rate: robust to a single missing day (unlike a strict
    // "consecutive from today" count, which one dead cell drops to zero).
    for (let i = 0; i < FRESHNESS_MIN_DAYS; i++) {
      nearCells++;
      if (days[addDays(today, i)]) nearFilled++;
    }
  }
  if (!Number.isFinite(minCoverage)) minCoverage = 0;
  const nearTermFill = nearCells ? nearFilled / nearCells : 0;

  // Compact bundled seed: next SEED_DAYS for every city, keyed by slug.
  const seedCities: Record<string, CityDays> = {};
  for (const c of cities) {
    const days = data.get(c.slug)!;
    const window: CityDays = {};
    for (let i = 0; i < SEED_DAYS; i++) {
      const k = addDays(today, i);
      if (days[k]) window[k] = days[k];
    }
    if (Object.keys(window).length > 0) seedCities[c.slug] = window;
  }
  await writeFile(
    SEED_PATH,
    JSON.stringify({ version: 1, builtAt, timezone: TZ, cities: seedCities }) + '\n',
  );

  // Index.
  await writeFile(
    INDEX_PATH,
    JSON.stringify(
      {
        version: 1,
        builtAt,
        timezone: TZ,
        horizonDays: HORIZON_DAYS,
        seedDays: SEED_DAYS,
        minCoverageDays: minCoverage,
        nearTermFillPct: Math.round(nearTermFill * 100),
        deadCities,
        cities: cities.map(c => ({ city: c.name, slug: c.slug })),
      },
      null,
      2,
    ) + '\n',
  );

  console.log(
    `[ifis-dataset] cities=${cities.length} requests=${requests} ` +
      `failures=${failures} minCoverageDays=${minCoverage} ` +
      `nearTermFill=${(nearTermFill * 100).toFixed(1)}% dead=${deadCities.length} ` +
      `budgetHit=${budgetHit}`,
  );
  if (deadCities.length > 0) {
    // Not fatal: these coordinates fall back to AlAdhan/on-device at runtime.
    console.warn(
      `[ifis-dataset] no data (widget rejects the name; runtime falls back): ` +
        deadCities.join(', '),
    );
  }

  // Alarms → non-zero exit → workflow emails.
  if (originUnhealthy) {
    console.error(
      `[ifis-dataset] ORIGIN UNHEALTHY: ${failures}/${requests} requests failed ` +
        `(${Math.round(failRate * 100)}%). islamiskaforbundet.se is likely down.`,
    );
    process.exit(2);
  }
  // Stale gate: fail only when near-term coverage is BROADLY missing (a
  // systemic scrape/site problem), tolerating a handful of unsupported cities.
  const MIN_FILL = 0.85;
  if (nearTermFill < MIN_FILL) {
    console.error(
      `[ifis-dataset] STALE: only ${(nearTermFill * 100).toFixed(1)}% of the next ` +
        `${FRESHNESS_MIN_DAYS} days are covered across cities (need ≥ ` +
        `${Math.round(MIN_FILL * 100)}%). Dataset would age out — investigate.`,
    );
    process.exit(3);
  }
}

main().catch(err => {
  console.error('[ifis-dataset] FATAL', err);
  process.exit(1);
});
