/**
 * Managed store for the QPC v2 page fonts — v2.8.0.
 *
 * Mirrors `mushafDownload.ts` (which manages the page images) but for the
 * font-rendered reader:
 *
 *   <Documents>/quran/fonts/v2/QCF2{001..604}.ttf
 *
 * Two differences that matter:
 *
 * - **A page is usable the moment its own font lands** (~300 KB), so the
 *   reader opens immediately and fetches as you read, instead of holding the
 *   whole mushaf hostage to one large download. The bulk download is still
 *   offered for offline use, it is just no longer a gate.
 * - **Neighbouring pages are prefetched** in the swipe direction, so turning a
 *   page never waits on the network.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import { mkdirDeep } from './mushafDownload';
import { isValidFontFile } from '../native/MushafFont';

/** Release tag holding the 604 subset page fonts. */
const FONT_RELEASE = 'mushaf-fonts-v2';
const STORE_VERSION = 'v2';

/** Smallest plausible page font; anything under this is a failed download. */
const MIN_FONT_BYTES = 8_192;

function storeDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/fonts/${STORE_VERSION}`;
}

export function fontFileName(page: number): string {
  const safe = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, Math.round(page)));
  return `QCF2${String(safe).padStart(3, '0')}.ttf`;
}

export function fontFilePath(page: number): string {
  return `${storeDir()}/${fontFileName(page)}`;
}

export function fontUrl(page: number): string {
  return `https://github.com/Hassan-PS/Mihrab/releases/download/${FONT_RELEASE}/${fontFileName(
    page,
  )}`;
}

async function fileOk(path: string): Promise<boolean> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return false;
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return Number(stat.size) >= MIN_FONT_BYTES;
  } catch {
    return false;
  }
}

/**
 * Last-resort transport: RN's own networking stack → blob → base64 → file.
 * Slower than the native streaming download, but it survives environments
 * where RNBlobUtil's downloader dies with "Download interrupted" — the
 * emulator's NAT does exactly that, and so do some corporate proxies. The
 * page-image store learned this the hard way; fonts inherit the fix.
 */
async function fetchFontViaRNFetch(page: number, dest: string): Promise<void> {
  const response = await fetch(fontUrl(page));
  if (!response.ok) throw new Error(`font ${page}: HTTP ${response.status}`);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`font ${page}: read failed`));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  if (base64.length < MIN_FONT_BYTES) throw new Error(`font ${page}: truncated`);
  await ReactNativeBlobUtil.fs.unlink(dest).catch(() => undefined);
  await ReactNativeBlobUtil.fs.writeFile(dest, base64, 'base64');
}

const inFlight = new Map<number, Promise<string | null>>();

/**
 * Ensure page's font file is on disk and return its path (null on failure).
 * Concurrent callers for the same page share one download.
 */
export function ensurePageFontFile(page: number): Promise<string | null> {
  const existing = inFlight.get(page);
  if (existing) return existing;

  const task = (async (): Promise<string | null> => {
    const path = fontFilePath(page);
    try {
      if (await fileOk(path)) return path;
      await mkdirDeep(storeDir());
      const tmp = `${path}.part`;
      let lastError: unknown = null;
      let landed = false;
      for (let attempt = 1; attempt <= 3 && !landed; attempt++) {
        try {
          await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
          if (attempt === 3) {
            await fetchFontViaRNFetch(page, path);
            landed = true;
            break;
          }
          // No `timeout` in the config: on Android it makes every download
          // fail instantly with "Download interrupted".
          const res = await ReactNativeBlobUtil.config({
            path: tmp,
            overwrite: true,
          }).fetch('GET', fontUrl(page));
          const status = res.info().status;
          const stat = await ReactNativeBlobUtil.fs.stat(tmp).catch(() => null);
          if (status !== 200 || !stat || Number(stat.size) < MIN_FONT_BYTES) {
            throw new Error(`font ${page}: HTTP ${status}`);
          }
          await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
          await ReactNativeBlobUtil.fs.mv(tmp, path);
          landed = true;
        } catch (e) {
          lastError = e;
          await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
          if (attempt < 3) {
            await new Promise<void>(r => setTimeout(r, 300 * attempt));
          }
        }
      }
      if (!landed) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
      // A truncated-but-large file would register as a font with no glyphs and
      // render an empty page, which looks like a bug rather than a bad file.
      if (!(await isValidFontFile(path))) {
        await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
        throw new Error(`font ${page}: not a usable font`);
      }
      return path;
    } catch (e) {
      console.warn(`mushafFonts: page ${page}`, e);
      return null;
    } finally {
      inFlight.delete(page);
    }
  })();

  inFlight.set(page, task);
  return task;
}

/** Warm the fonts around `page` so swiping never waits on the network. */
export function prefetchAround(page: number, radius = 2): void {
  for (let d = 1; d <= radius; d++) {
    for (const p of [page + d, page - d]) {
      if (p >= 1 && p <= MUSHAF_TOTAL_PAGES) void ensurePageFontFile(p);
    }
  }
}

export type FontDownloadProgress = { done: number; total: number; failed: number };

export type FontDownloadHandle = {
  promise: Promise<boolean>;
  cancel: () => void;
};

/** Fetch every page font (the offline option in Manage downloads). */
export function downloadAllPageFonts({
  concurrency = 6,
  onProgress,
}: {
  concurrency?: number;
  onProgress?: (p: FontDownloadProgress) => void;
} = {}): FontDownloadHandle {
  let cancelled = false;
  let done = 0;
  let failed = 0;

  const run = async (): Promise<boolean> => {
    await mkdirDeep(storeDir());
    const queue: number[] = [];
    for (let i = 1; i <= MUSHAF_TOTAL_PAGES; i++) queue.push(i);

    const worker = async (): Promise<void> => {
      while (!cancelled) {
        const page = queue.shift();
        if (page == null) return;
        const path = await ensurePageFontFile(page);
        if (path == null) failed += 1;
        done += 1;
        onProgress?.({ done, total: MUSHAF_TOTAL_PAGES, failed });
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return !cancelled && failed === 0;
  };

  return { promise: run(), cancel: () => { cancelled = true; } };
}

/** How many page fonts are on disk, and how many bytes they take. */
export async function fontStoreStats(): Promise<{ pages: number; bytes: number }> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(storeDir()))) {
      return { pages: 0, bytes: 0 };
    }
    const names = await ReactNativeBlobUtil.fs.ls(storeDir());
    let bytes = 0;
    let pages = 0;
    for (const name of names) {
      if (!name.endsWith('.ttf')) continue;
      const stat = await ReactNativeBlobUtil.fs
        .stat(`${storeDir()}/${name}`)
        .catch(() => null);
      if (stat && Number(stat.size) >= MIN_FONT_BYTES) {
        pages += 1;
        bytes += Number(stat.size);
      }
    }
    return { pages, bytes };
  } catch {
    return { pages: 0, bytes: 0 };
  }
}

export async function deletePageFonts(): Promise<void> {
  await ReactNativeBlobUtil.fs.unlink(storeDir()).catch(() => undefined);
}
