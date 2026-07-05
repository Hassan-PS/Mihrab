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

function renderDir(bucket: number): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/mushaf/render/${bucket}`;
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
