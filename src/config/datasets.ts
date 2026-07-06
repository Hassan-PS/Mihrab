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

/** Refresh a cached city file when the local copy is older than this. */
export const IFIS_DATASET_REFRESH_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
