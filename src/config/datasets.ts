/**
 * Static, CDN-fronted prayer-times dataset built by the scheduled GitHub
 * Actions job (`.github/workflows/ifis-dataset.yml`, script in
 * `tools/ifis-dataset/`). The job scrapes Islamiska Förbundet once server-side
 * and commits per-city JSON here, so the app reads a static file instead of
 * hitting the flaky bönetider widget on every device.
 *
 * Served from GitHub's raw endpoint (Fastly-fronted). Per-city files live at
 * `${IFIS_DATASET_BASE_URL}/cities/<slug>.json`.
 *
 * Forks: change the owner/repo to your own mirror.
 */
export const IFIS_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/Hassan-PS/Mihrab/main/data/prayer-times/v1';

/** Refresh a cached city file when the local copy is older than this (a
 *  fallback for when the index poll can't reach the server). */
export const IFIS_DATASET_REFRESH_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * How often the client re-reads the tiny `index.json` to learn whether the
 * server has published a newer build. The server commits atomically at the end
 * of its run, so a client that polls mid-run simply sees the previous build and
 * skips — no collision. ±25% jitter (applied at call sites) spreads client load
 * and de-synchronises devices.
 */
export const IFIS_INDEX_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * The server's weekly schedule (`.github/workflows/ifis-dataset.yml`
 * cron `17 3 * * 1`), in UTC. Used only to *display* the next expected server
 * run in the statistics panel — not to gate fetching.
 */
export const IFIS_SERVER_CRON_UTC = { weekday: 1, hour: 3, minute: 17 }; // Mon 03:17 UTC

/** Compute the next server run (UTC) after `from`. */
export function nextServerRunAfter(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  // Advance minute-by-minute is overkill; jump to the target time today then roll.
  d.setUTCHours(IFIS_SERVER_CRON_UTC.hour, IFIS_SERVER_CRON_UTC.minute, 0, 0);
  // Move to the correct weekday (1 = Monday); if already past, add a week.
  const dowDiff = (IFIS_SERVER_CRON_UTC.weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + dowDiff);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

// ── MOROCCO ───────────────────────────────────────────────────────────
//
// Same arrangement, different constraint. The Ministry of Habous's page
// takes a city and nothing else and returns whatever HIJRI month it is
// currently showing — there is no date parameter — so the builder cannot
// walk a horizon the way the Swedish one does. It accumulates: each weekly
// run merges the month it can see into what is already committed.
//
// That makes the forward window shorter and the refresh cadence more
// important, which is why the poll interval here is tighter than Sweden's.

export const HABOUS_DATASET_BASE_URL =
  'https://raw.githubusercontent.com/Hassan-PS/Mihrab/main/data/prayer-times/morocco/v1';

/** Fallback refresh when the index poll cannot reach the server. Shorter
 *  than Sweden's three days because the window itself is shorter. */
export const HABOUS_DATASET_REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

/** How often to re-read the tiny `index.json`. ±25% jitter at the call site. */
export const HABOUS_INDEX_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** `.github/workflows/habous-dataset.yml` cron `41 4 * * *`, for display only. */
export const HABOUS_SERVER_CRON_DAILY_UTC = { hour: 4, minute: 41 }; // every day
