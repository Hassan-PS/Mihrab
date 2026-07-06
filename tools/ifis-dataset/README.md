# IFiS prayer-times dataset builder

Scrapes the Islamiska Förbundet **bönetider** widget once, server-side, and
publishes a static dataset the app reads instead of scraping the flaky origin on
every device. This is the durable replacement for the live per-request scrape.

## What it produces

| Path | Purpose |
|---|---|
| `data/prayer-times/v1/cities/<slug>.json` | Full rolling window per city (served via GitHub raw / CDN, fetched + cached at runtime) |
| `data/prayer-times/v1/index.json` | Coverage summary + city list |
| `src/providers/data/ifisSeed.json` | Compact near-term seed **bundled into the app** for offline / first-launch |

The app reads these in `src/providers/islamiskaForbundetDataset.ts`, which is the
primary Sweden source in `fetchPrayerTimes.ts`. Lookup order on device:
**cached CDN mirror → bundled seed → live widget scrape → AlAdhan → local adhan.**
So even total pipeline death only degrades to the existing fallbacks.

## How it runs

`.github/workflows/ifis-dataset.yml` runs it **every Monday** and on manual
dispatch, commits any changes to `main`, and **emails `mihrab@elghamri.se` on
failure** (origin down, data going stale, or push failing).

Run locally: `npx tsx tools/ifis-dataset/build.ts`

### Behaviour

- **Incremental** — keeps existing days, fetches only missing ones up to the
  horizon. Steady-state ≈ one request per city per new day (~760/week).
- **Date-major** — covers near-term dates for *all* cities first, so a budget
  cap still yields full near-term coverage everywhere.
- **Gentle** — 300 ms between requests, bounded retries.
- **Alarms (non-zero exit → email):**
  - exit 2 — origin unhealthy (≥20 requests, >50 % failed).
  - exit 3 — least-covered city below the freshness floor (default 14 days).

### Env knobs (workflow inputs mirror these)

| Var | Default | Meaning |
|---|---|---|
| `IFIS_HORIZON_DAYS` | 400 | how far ahead to cover |
| `IFIS_MAX_REQUESTS` | 8000 | per-run request budget |
| `IFIS_MAX_WALL_MIN` | 50 | per-run wall-clock budget |
| `IFIS_SEED_DAYS` | 60 | bundled-seed window |
| `IFIS_FRESHNESS_MIN_DAYS` | 14 | min near-term coverage before alerting |
| `IFIS_REQUEST_DELAY_MS` | 300 | politeness delay |

## First-time setup

1. **Add the email secrets** (Settings → Secrets and variables → Actions):
   `MAIL_SERVER`, `MAIL_PORT` (465 SSL / 587 STARTTLS), `MAIL_USERNAME`,
   `MAIL_PASSWORD`. Without them the job still runs; only the email step is
   skipped.
2. **Backfill** — from the Actions tab, run *"IFiS prayer-times dataset"*
   manually. One 50-minute run covers ~90 days for all 109 cities (near-term
   first); run it 2–3 times, or let the weekly schedule extend coverage toward
   the full horizon. The bundled seed refreshes on `main` each run and reaches
   users on the next app release; the CDN files reach users immediately.

## Maintenance

The parser is shared with the app (`src/providers/islamiskaForbundetParser.ts`)
and owned by the `provider-doctor` subagent. If the bönetider HTML changes, the
job fails the freshness/health gate and emails — fix the parser, add a fixture
under `__tests__/fixtures/islamiskaForbundet/`, and re-run.
