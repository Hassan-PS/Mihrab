/**
 * Build the Moroccan prayer-times dataset from the ministry's own pages.
 *
 * Same shape as `tools/ifis-dataset/build.ts` — per-city JSON committed to
 * the repo, an index the app polls, and a bundled seed so a fresh install
 * works before it has downloaded anything. Read that file first; this one
 * only explains where Morocco differs.
 *
 * ── THE ONE STRUCTURAL DIFFERENCE ─────────────────────────────────────
 *
 * Islamiska Förbundet answers a query for A GIVEN DATE, so its builder can
 * walk a 400-day horizon. The ministry has no such parameter: `index.php`
 * takes a `ville` and nothing else, and returns whatever HIJRI MONTH it is
 * currently showing. One request buys about thirty days and you cannot ask
 * for the thirty after them.
 *
 * So coverage is built by ACCUMULATION. Each run merges the month it sees
 * into what is already committed and drops days that have gone stale. Run
 * weekly, the window grows for a few months and then holds; between runs
 * the forward horizon dips to roughly three weeks at worst, which the
 * computed fallback covers — and since the Morocco calculation now sits
 * within a minute of the ministry, that fallback is not a cliff.
 *
 * ── THE ORIGIN IS FLAKY, AND THAT IS DESIGNED FOR ─────────────────────
 *
 * Probing habous.gov.ma five times produced two TLS failures, a connection
 * reset and a connect timeout before a success. A build that treated any of
 * those as data would commit a hole. So: retries per city, an origin-health
 * gate that abandons the whole run rather than committing a partial one,
 * and a coverage floor below which the run fails loudly instead of quietly
 * shipping a thinner dataset than yesterday's.
 *
 *   npx tsx tools/habous-dataset/build.ts
 *
 * Env: HABOUS_MAX_CITIES, HABOUS_REQUEST_DELAY_MS, HABOUS_DROP_BEFORE_DAYS,
 *      HABOUS_SEED_DAYS, HABOUS_COVERAGE_WARN_DAYS, HABOUS_COVERAGE_FAIL_DAYS
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  habousDayTuple,
  parseHabousCities,
  parseHabousMonth,
} from '../../src/providers/habousParser';
import type { DatasetDayTuple } from '../../src/providers/datasetTuple';
import { fetchMinistryCity } from './fetchMinistry';

const ROOT = path.join(__dirname, '../..');
const COORDS_PATH = path.join(ROOT, 'src/providers/data/moroccoCities.json');
const OUT_DIR = path.join(ROOT, 'data/prayer-times/morocco/v1');
const CITIES_DIR = path.join(OUT_DIR, 'cities');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');
const SEED_PATH = path.join(ROOT, 'src/providers/data/habousSeed.json');

export const MOROCCO_TIMEZONE = 'Africa/Casablanca';

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const MAX_CITIES = int('HABOUS_MAX_CITIES', 250);
const REQUEST_DELAY_MS = int('HABOUS_REQUEST_DELAY_MS', 700);
/** Days of the past to keep. Some history is useful; a year of it is not. */
const DROP_BEFORE_DAYS = int('HABOUS_DROP_BEFORE_DAYS', 3);
/** How much of the window the app bundles, so a fresh install has something. */
const SEED_DAYS = int('HABOUS_SEED_DAYS', 30);
/**
 * The gate is STALENESS, not horizon — and that distinction is the whole
 * lesson of the first build.
 *
 * The forward window is capped by something we do not control: the ministry
 * publishes one Hijri month and offers no way to ask for another. Probed
 * exhaustively — `mois`, `month`, `m`, `mois_hijri`, `hijri`, `shahr`, `mm`,
 * `annee`, on the query string and through the page's POST form, plus
 * horaire_hijri.php and horaire_hijri_fr.php — every one returns the current
 * month. So coverage runs from about 29 days just after a month turns down
 * to nearly nothing just before, and no amount of building changes that.
 *
 * A gate that failed on a short horizon would therefore fire every single
 * month, for a condition nobody can fix, and would be muted within two.
 * That is precisely how five red releases went unread earlier in this
 * project's life.
 *
 * What IS controllable is whether the data is current. Every city should
 * hold TODAY. A city that does not is a real hole — a failed fetch that
 * never recovered — and that is worth failing over.
 */
const STALE_FAIL_RATIO = 0.1;
const THIN_WARN_DAYS = int('HABOUS_THIN_WARN_DAYS', 3);

type CityFile = {
  id: number;
  city: string;
  timezone: string;
  builtAt: string;
  days: Record<string, DatasetDayTuple>;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  fs.mkdirSync(CITIES_DIR, { recursive: true });

  // The committed city list is the source of truth for WHICH cities to
  // fetch, so a run cannot silently change the set because the ministry
  // reordered a dropdown. It is refreshed by `cities.ts`, deliberately.
  const known = readJson<Array<{ id: number; name: string }>>(COORDS_PATH, []);
  let cities = known.map(c => ({ id: c.id, name: c.name }));

  if (cities.length === 0) {
    console.log('no committed city list — reading one from the ministry');
    const { body } = await fetchMinistryCity(1);
    cities = parseHabousCities(body);
  }
  cities = cities.slice(0, MAX_CITIES);
  console.log(`cities to fetch: ${cities.length}`);

  const today = new Date();
  const dropBefore = new Date(today);
  dropBefore.setDate(dropBefore.getDate() - DROP_BEFORE_DAYS);
  const dropKey = dateKey(dropBefore);
  const todayKey = dateKey(today);

  let requests = 0;
  let failures = 0;
  const dead: number[] = [];
  const coverage: Array<{ id: number; name: string; days: number; hasToday: boolean }> = [];

  for (const city of cities) {
    let body: string;
    requests++;
    try {
      const res = await fetchMinistryCity(city.id, {
        onAttempt: (n, why) => console.log(`  ${city.id} ${city.name}: attempt ${n} ${why}`),
      });
      body = res.body;
    } catch (e) {
      failures++;
      dead.push(city.id);
      console.log(`  ${city.id} ${city.name}: FAILED ${(e as Error).message}`);
      // The origin-health gate. Past a decent sample, a majority of
      // failures means the ministry is down, not that these cities are —
      // and half a dataset committed over a good one is worse than nothing.
      if (requests >= 20 && failures / requests > 0.5) {
        console.error(
          `\nabandoning: ${failures} of ${requests} requests failed. ` +
            'That is the origin being down, not the data being missing. ' +
            'Nothing has been written.',
        );
        return 2;
      }
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const file = path.join(CITIES_DIR, `${city.id}.json`);
    const existing = readJson<CityFile | null>(file, null);
    const days: Record<string, DatasetDayTuple> = { ...(existing?.days ?? {}) };

    const month = parseHabousMonth(body);
    for (const day of month.days) days[day.dateKey] = habousDayTuple(day);

    // Accumulate forward, prune backward.
    for (const key of Object.keys(days)) if (key < dropKey) delete days[key];

    const ordered: Record<string, DatasetDayTuple> = {};
    for (const key of Object.keys(days).sort()) ordered[key] = days[key];

    const payload: CityFile = {
      id: city.id,
      city: city.name,
      timezone: MOROCCO_TIMEZONE,
      builtAt: new Date().toISOString(),
      days: ordered,
    };
    fs.writeFileSync(file, JSON.stringify(payload), 'utf8');

    const ahead = Object.keys(ordered).filter(k => k >= todayKey).length;
    coverage.push({
      id: city.id,
      name: city.name,
      days: ahead,
      hasToday: ordered[todayKey] !== undefined,
    });
    await sleep(REQUEST_DELAY_MS);
  }

  if (coverage.length === 0) {
    console.error('no city produced any data; nothing written');
    return 2;
  }

  // The seed: the next SEED_DAYS for every city, bundled into the app so a
  // fresh install is useful before it has downloaded anything.
  const seed: Record<string, Record<string, DatasetDayTuple>> = {};
  for (const c of coverage) {
    const file = readJson<CityFile | null>(path.join(CITIES_DIR, `${c.id}.json`), null);
    if (!file) continue;
    const window: Record<string, DatasetDayTuple> = {};
    for (const key of Object.keys(file.days).filter(k => k >= todayKey).slice(0, SEED_DAYS)) {
      window[key] = file.days[key];
    }
    seed[String(c.id)] = window;
  }
  fs.writeFileSync(
    SEED_PATH,
    JSON.stringify({
      version: 1,
      builtAt: new Date().toISOString(),
      timezone: MOROCCO_TIMEZONE,
      seedDays: SEED_DAYS,
      cities: seed,
    }),
    'utf8',
  );

  const live = coverage.filter(c => c.days > 0);
  const minCoverage = live.length ? Math.min(...live.map(c => c.days)) : 0;
  const worst = live.find(c => c.days === minCoverage);
  const stale = coverage.filter(c => !c.hasToday);

  fs.writeFileSync(
    INDEX_PATH,
    `${JSON.stringify(
      {
        version: 1,
        builtAt: new Date().toISOString(),
        timezone: MOROCCO_TIMEZONE,
        seedDays: SEED_DAYS,
        minCoverageDays: minCoverage,
        staleCities: stale.length,
        serverStatus: failures === 0 ? 'ok' : 'degraded',
        deadCities: dead,
        cities: coverage.map(c => ({ id: c.id, city: c.name })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `\n${coverage.length} cities, ${failures} failed, min forward coverage ` +
      `${minCoverage} days${worst ? ` (${worst.name})` : ''}, ${seconds}s`,
  );

  console.log(`cities missing today: ${stale.length}`);
  if (stale.length > coverage.length * STALE_FAIL_RATIO) {
    console.error(
      `${stale.length} of ${coverage.length} cities have no entry for ${todayKey}. ` +
        'That is a hole in the data, not a short horizon: ' +
        stale.slice(0, 10).map(c => c.name).join(', '),
    );
    return 3;
  }
  // Thin is expected near the end of a Hijri month and is not a fault; it is
  // reported so a run of them, which WOULD mean builds are being missed, is
  // visible.
  if (minCoverage < THIN_WARN_DAYS) {
    emitOutput('coverage_warning', 'true');
    emitOutput('min_coverage', String(minCoverage));
    emitOutput('min_coverage_city', worst?.name ?? '');
  }
  return 0;
}

main().then(c => process.exit(c));
