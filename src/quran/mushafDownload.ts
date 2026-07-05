/**
 * Mushaf managed file store — QR-5 (docs/quran-reader-plan.md).
 *
 * Replaces the old `Image.prefetch()` approach (task #130), which parked
 * the 604 page PNGs in the OS image cache — evictable at any time, with
 * an AsyncStorage completion flag that could go stale and leave the
 * reader blank offline. Pages now live as real files under the app's
 * document directory:
 *
 *   <Documents>/quran/mushaf/v2/{001..604}.png
 *   <Documents>/quran/mushaf/v2/manifest.json
 *
 * The manifest records per-page byte sizes at download time; integrity
 * checks are existence + non-trivial size. Missing pages stream from
 * the GitHub release on demand (same URL space), so a partially
 * downloaded mushaf still reads correctly — just with a network hit for
 * the gaps.
 *
 * Migration: users who downloaded via the old prefetch path have no
 * files here and will be prompted once to re-download. The old
 * `mushaf.assets.v3.complete` flag is cleared on first check.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MUSHAF_TOTAL_PAGES, mushafPageUrl } from './mushafImages';

const LEGACY_COMPLETION_KEY = 'mushaf.assets.v3.complete';

const STORE_VERSION = 'v2'; // tracks the mushaf-assets-v2 release

function storeDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/mushaf/${STORE_VERSION}`;
}

/**
 * `fs.mkdir` is NOT recursive — creating `<Documents>/quran/mushaf/v2`
 * fails outright while `<Documents>/quran` doesn't exist yet. Create
 * each path segment in turn (EEXIST errors are ignored).
 */
export async function mkdirDeep(path: string): Promise<void> {
  const root = ReactNativeBlobUtil.fs.dirs.DocumentDir;
  if (!path.startsWith(root)) {
    await ReactNativeBlobUtil.fs.mkdir(path).catch(() => undefined);
    return;
  }
  const rel = path.slice(root.length).split('/').filter(Boolean);
  let cur = root;
  for (const seg of rel) {
    cur = `${cur}/${seg}`;
    // eslint-disable-next-line no-await-in-loop
    await ReactNativeBlobUtil.fs.mkdir(cur).catch(() => undefined);
  }
}

function manifestPath(): string {
  return `${storeDir()}/manifest.json`;
}

export function pageFilePath(page: number): string {
  const safe = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, Math.round(page)));
  return `${storeDir()}/${String(safe).padStart(3, '0')}.png`;
}

type Manifest = {
  version: string;
  /** Pages recorded as fully downloaded (count). */
  complete: number;
  /** Byte size per page, keyed by page number string. */
  sizes: { [page: string]: number };
  updatedAt: number;
};

async function readManifest(): Promise<Manifest | null> {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(manifestPath());
    if (!exists) return null;
    const raw = await ReactNativeBlobUtil.fs.readFile(manifestPath(), 'utf8');
    const m = JSON.parse(String(raw)) as Manifest;
    if (m.version !== STORE_VERSION) return null;
    return m;
  } catch {
    return null;
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  try {
    await ReactNativeBlobUtil.fs.writeFile(
      manifestPath(),
      JSON.stringify(m),
      'utf8',
    );
  } catch (e) {
    console.warn('mushafStore: manifest write failed', e);
  }
}

/** A page file is considered valid if present and larger than 10 KB. */
async function pageFileValid(page: number): Promise<boolean> {
  try {
    const path = pageFilePath(page);
    const exists = await ReactNativeBlobUtil.fs.exists(path);
    if (!exists) return false;
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return Number(stat.size) > 10_000;
  } catch {
    return false;
  }
}

/**
 * Fast "is the mushaf ready?" check used by the reader gate: manifest
 * present with all 604 recorded + a 13-page sample spot-check on disk.
 * Also clears the legacy prefetch flag so old installs re-prompt once.
 */
export async function isMushafDownloaded(): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(LEGACY_COMPLETION_KEY);
  } catch {
    /* ignore */
  }
  const manifest = await readManifest();
  if (!manifest || manifest.complete < MUSHAF_TOTAL_PAGES) return false;
  for (let page = 1; page <= MUSHAF_TOTAL_PAGES; page += 50) {
    if (!(await pageFileValid(page))) return false;
  }
  return true;
}

/** Full integrity sweep — returns the list of missing/corrupt pages. */
export async function verifyMushaf(): Promise<number[]> {
  const missing: number[] = [];
  for (let page = 1; page <= MUSHAF_TOTAL_PAGES; page++) {
    if (!(await pageFileValid(page))) missing.push(page);
  }
  return missing;
}

/** Total bytes on disk (for the "Manage downloads" UI). */
export async function mushafDiskUsage(): Promise<number> {
  const manifest = await readManifest();
  if (!manifest) return 0;
  return Object.values(manifest.sizes).reduce((a, b) => a + b, 0);
}

/** Remove all downloaded pages + manifest. */
export async function deleteMushaf(): Promise<void> {
  try {
    await ReactNativeBlobUtil.fs.unlink(storeDir());
  } catch {
    /* already gone */
  }
}

export type MushafDownloadProgress = {
  done: number;
  total: number;
  failed: number;
};

export type MushafDownloadHandle = {
  /** Resolves `true` when every page is on disk, `false` if cancelled or incomplete. */
  promise: Promise<boolean>;
  cancel: () => void;
};

/**
 * Download all (or the missing subset of) mushaf pages into the managed
 * store with `concurrency` parallel workers. Already-valid pages are
 * skipped, so this doubles as "retry failed pages".
 */
/**
 * Last-resort transport: RN's own fetch() (the networking stack the rest
 * of the app uses) → blob → base64 → fs.writeFile. Slower than a native
 * streaming download, but it survives environments where RNBlobUtil's
 * downloader fails with "Download interrupted" (seen on emulator NAT).
 */
async function fetchPageViaRNFetch(page: number): Promise<number> {
  const response = await fetch(mushafPageUrl(page));
  if (!response.ok) throw new Error(`page ${page}: HTTP ${response.status}`);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`page ${page}: read failed`));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  if (base64.length < 10_000) throw new Error(`page ${page}: truncated`);
  await ReactNativeBlobUtil.fs
    .unlink(pageFilePath(page))
    .catch(() => undefined);
  await ReactNativeBlobUtil.fs.writeFile(pageFilePath(page), base64, 'base64');
  const stat = await ReactNativeBlobUtil.fs.stat(pageFilePath(page));
  if (Number(stat.size) <= 10_000) throw new Error(`page ${page}: bad write`);
  return Number(stat.size);
}

/**
 * Fetch one page to its final location. GitHub's asset CDN intermittently
 * resets multiplexed HTTP/2 streams under concurrent load ("Download
 * interrupted."), so each page gets up to `attempts` tries with a short
 * backoff — and the final attempt switches to the RN-fetch transport.
 */
async function fetchPage(page: number, attempts = 3): Promise<number> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const tmp = `${pageFilePath(page)}.part`;
    try {
      if (attempt === attempts) {
        return await fetchPageViaRNFetch(page);
      }
      // NOTE: do NOT use RNBlobUtil's `timeout` config — on Android it
      // makes every download die instantly with "Download interrupted".
      // Hung sockets are guarded by the JS watchdog below instead.
      const task = ReactNativeBlobUtil.config({
        path: tmp,
        overwrite: true,
      }).fetch('GET', mushafPageUrl(page));
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const res = await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          watchdog = setTimeout(() => {
            task.cancel(() => undefined);
            reject(new Error(`page ${page}: timed out`));
          }, 60_000);
        }),
      ]).finally(() => {
        if (watchdog != null) clearTimeout(watchdog);
      });
      const status = res.info().status;
      const stat = await ReactNativeBlobUtil.fs.stat(tmp).catch(() => null);
      if (status !== 200 || !stat || Number(stat.size) <= 10_000) {
        throw new Error(`page ${page}: HTTP ${status}`);
      }
      await ReactNativeBlobUtil.fs
        .unlink(pageFilePath(page))
        .catch(() => undefined);
      await ReactNativeBlobUtil.fs.mv(tmp, pageFilePath(page));
      return Number(stat.size);
    } catch (e) {
      lastError = e;
      await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
      if (attempt < attempts) {
        await new Promise<void>(r => setTimeout(r, 400 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function downloadMushafAssets({
  concurrency = 3,
  onProgress,
}: {
  concurrency?: number;
  onProgress?: (p: MushafDownloadProgress) => void;
} = {}): MushafDownloadHandle {
  let cancelled = false;
  let done = 0;
  let failed = 0;
  const sizes: { [page: string]: number } = {};

  const run = async (): Promise<boolean> => {
    await mkdirDeep(storeDir());

    // Preserve sizes of pages we already have.
    const existing = await readManifest();
    if (existing) Object.assign(sizes, existing.sizes);

    const queue: number[] = [];
    for (let i = 1; i <= MUSHAF_TOTAL_PAGES; i++) queue.push(i);

    const worker = async (): Promise<void> => {
      while (!cancelled) {
        const page = queue.shift();
        if (page == null) return;
        try {
          if (await pageFileValid(page)) {
            const stat = await ReactNativeBlobUtil.fs.stat(pageFilePath(page));
            sizes[String(page)] = Number(stat.size);
          } else {
            sizes[String(page)] = await fetchPage(page);
          }
        } catch (e) {
          failed += 1;
          if (failed <= 3) {
            console.warn(`mushafStore: page ${page} failed`, e);
          }
        } finally {
          done += 1;
          onProgress?.({ done, total: MUSHAF_TOTAL_PAGES, failed });
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (cancelled) return false;

    const complete = MUSHAF_TOTAL_PAGES - failed;
    await writeManifest({
      version: STORE_VERSION,
      complete,
      sizes,
      updatedAt: Date.now(),
    });
    return failed === 0;
  };

  return {
    promise: run(),
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Legacy export kept for API compatibility (used by settings reset). */
export async function clearMushafDownloadFlag(): Promise<void> {
  await deleteMushaf();
}
