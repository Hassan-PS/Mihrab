/**
 * Display-size mushaf render cache — v2.7.28.
 *
 * WHY: the source pages are 2600 px wide; phones render them at
 * ~1000–1700 px. Letting the GPU minify a bitmap in one bilinear step
 * below ~0.7× skips source pixels and leaves the thin Arabic strokes
 * ragged ("pixelated"). This cache stores a copy of each page at the
 * EXACT pixel width the reader draws it, produced by the native
 * MushafPageScaler (iterative-halving box filter on Android, Core
 * Graphics .high interpolation on iOS). Rendering then maps bitmap
 * pixels 1:1 to screen pixels — maximum sharpness the source allows.
 *
 * Cache layout: <Documents>/quran/mushaf/render/{widthBucket}/{page}.png
 * (inside the managed mushaf store, so Manage-downloads deletion and
 * disk accounting cover it, and Auto Backup excludes it). Width buckets
 * are rounded to 8 px so tiny layout jitter doesn't fork the cache;
 * rotation/fullscreen produce their own buckets lazily.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { getMushafPageScaler } from '../native/MushafPageScaler';
import { pageFilePath } from './mushafDownload';

/**
 * Cache-format version. v2 (2.7.30): the Android scaler switched from
 * halving+single-bilinear to progressive ≈0.71 steps — copies produced
 * by v1 with a total factor in the 0.5–0.7 zone (pages 1–2 at phone
 * sizes) are ragged and must regenerate, so the version segments the
 * directory. Legacy v1 bucket dirs are swept on first ensure call.
 */
const RENDER_CACHE_VERSION = 'v2';

function renderRoot(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/mushaf/render`;
}

function renderDir(bucket: number): string {
  return `${renderRoot()}/${RENDER_CACHE_VERSION}/${bucket}`;
}

let legacySweepDone = false;
/** Delete pre-versioned bucket dirs (plain digits under render/). */
async function sweepLegacyRenderDirs(): Promise<void> {
  if (legacySweepDone) return;
  legacySweepDone = true;
  try {
    const root = renderRoot();
    if (!(await ReactNativeBlobUtil.fs.exists(root))) return;
    const entries = await ReactNativeBlobUtil.fs.ls(root);
    for (const name of entries) {
      if (/^\d+$/.test(name)) {
        await ReactNativeBlobUtil.fs
          .unlink(`${root}/${name}`)
          .catch(() => undefined);
      }
    }
  } catch {
    /* best effort */
  }
}

export function widthBucket(targetPxWidth: number): number {
  return Math.max(64, Math.round(targetPxWidth / 8) * 8);
}

function renderedPagePath(page: number, bucket: number): string {
  return `${renderDir(bucket)}/${String(page).padStart(3, '0')}.png`;
}

// In-memory ready map — synchronous lookups during render — plus a
// version counter components subscribe to via useSyncExternalStore.
const ready = new Map<string, string>();
const inFlight = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

export function subscribeRenderCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRenderCacheVersion(): number {
  return version;
}

function bump(): void {
  version += 1;
  for (const l of listeners) l();
}

/** Synchronous: the display-size copy's path, if already generated. */
export function scaledPagePathIfReady(
  page: number,
  targetPxWidth: number,
): string | null {
  return ready.get(`${widthBucket(targetPxWidth)}/${page}`) ?? null;
}

/**
 * Ensure a display-size copy exists for `page`. Only meaningful when
 * the page's original file is on disk and the target is an actual
 * downscale (>10% smaller) — otherwise the original is already optimal.
 * Bumps the render-cache version when a copy lands.
 */
export function ensureScaledPage(
  page: number,
  targetPxWidth: number,
  sourceRefWidth: number,
): void {
  const scaler = getMushafPageScaler();
  if (!scaler) return;
  const bucket = widthBucket(targetPxWidth);
  if (bucket >= sourceRefWidth * 0.9) return; // ~original size — skip
  const key = `${bucket}/${page}`;
  if (ready.has(key) || inFlight.has(key)) return;
  inFlight.add(key);
  void (async () => {
    try {
      await sweepLegacyRenderDirs();
      const src = pageFilePath(page);
      if (!(await ReactNativeBlobUtil.fs.exists(src))) return;
      const dest = renderedPagePath(page, bucket);
      if (!(await ReactNativeBlobUtil.fs.exists(dest))) {
        await scaler.scaleToWidth(src, dest, bucket);
      }
      ready.set(key, dest);
      bump();
    } catch {
      /* best effort — the reader keeps showing the original */
    } finally {
      inFlight.delete(key);
    }
  })();
}
