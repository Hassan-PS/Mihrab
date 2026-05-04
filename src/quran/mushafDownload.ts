/**
 * Mushaf download manager — task #130.
 *
 * The 604 mushaf page PNGs are no longer bundled inside the APK; they
 * live on a one-shot GitHub release (`mushaf-assets-v1`). On first
 * open of the mushaf view, the app prompts the user to download all
 * 604 pages (~120 MB), prefetches them via RN's `Image.prefetch()`
 * (which uses the platform image cache — Glide on Android, SDWebImage
 * on iOS), and remembers the completion state in AsyncStorage.
 *
 * After download, every `<Image source={{ uri: mushafPageUrl(n) }} />`
 * call hits the warm cache; no network round-trip. If the OS evicts
 * the cache (rare for app-managed disk caches on modern devices) or
 * the user clears the app cache manually, we fall back to streaming
 * each page on demand — quality is preserved either way; the only
 * downside is a per-page network hit.
 */
import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MUSHAF_TOTAL_PAGES, mushafPageUrl } from './mushafImages';

const COMPLETION_KEY = 'mushaf.assets.v1.complete';

/** Has the user already completed the one-time download? */
export async function isMushafDownloaded(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(COMPLETION_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

async function markComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(COMPLETION_KEY, '1');
  } catch {
    /* non-critical — UI will retry next open */
  }
}

/** Clear the completion flag — used by the "show onboarding again" reset. */
export async function clearMushafDownloadFlag(): Promise<void> {
  try {
    await AsyncStorage.removeItem(COMPLETION_KEY);
  } catch {
    /* ignore */
  }
}

export type MushafDownloadProgress = {
  /** Pages successfully prefetched so far. */
  done: number;
  /** Total pages to fetch (always 604). */
  total: number;
  /** Pages that returned an error during prefetch (keep for retry hint). */
  failed: number;
};

export type MushafDownloadHandle = {
  /** Resolves with `true` if the run completed (even with some failures), `false` if cancelled. */
  promise: Promise<boolean>;
  /** Cancel the in-flight download — already-downloaded pages stay cached. */
  cancel: () => void;
};

/**
 * Run the one-time download. Fetches all 604 pages in batches of
 * `concurrency` parallel requests. Calls `onProgress` after each
 * page resolves (success or error).
 *
 * Returns a handle with `promise` (the run) and `cancel()` (early
 * exit). Cancellation is cooperative — in-flight network requests
 * complete but no further pages are scheduled.
 */
export function downloadMushafAssets({
  concurrency = 8,
  onProgress,
}: {
  concurrency?: number;
  onProgress?: (p: MushafDownloadProgress) => void;
} = {}): MushafDownloadHandle {
  let cancelled = false;
  let done = 0;
  let failed = 0;

  const run = async (): Promise<boolean> => {
    const queue: number[] = [];
    for (let i = 1; i <= MUSHAF_TOTAL_PAGES; i++) queue.push(i);

    const next = async (): Promise<void> => {
      while (!cancelled) {
        const page = queue.shift();
        if (page == null) return;
        const url = mushafPageUrl(page);
        try {
          // Image.prefetch returns a Promise<boolean> resolving to true
          // on cache success. Throws on network errors.
          await Image.prefetch(url);
        } catch {
          failed += 1;
        } finally {
          done += 1;
          if (onProgress) {
            onProgress({ done, total: MUSHAF_TOTAL_PAGES, failed });
          }
        }
      }
    };

    // Spin up `concurrency` workers; each pulls from the shared queue.
    const workers = Array.from({ length: concurrency }, () => next());
    await Promise.all(workers);

    if (cancelled) return false;
    // Even with some failures, mark complete so the user isn't blocked
    // forever — the UI will lazy-fetch any missing pages on demand.
    await markComplete();
    return true;
  };

  return {
    promise: run(),
    cancel: () => {
      cancelled = true;
    },
  };
}
