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
import {
  CONTENT_DEADLINES,
  fetchContentOnce,
  GIVE_UP_AFTER_CONSECUTIVE_FAILURES,
  withDownloadDeadline,
  type DownloadOutcome,
} from './contentNetwork';
import { MUSHAF_TOTAL_PAGES } from './mushafImages';
import { mkdirDeep } from './mushafDownload';
import { isValidFontFile } from '../native/MushafFont';
import manifest from './data/mushafFontManifest.json';
import tajweedManifest from './data/mushafTajweedFontManifest.json';

/**
 * Release tag holding the 604 subset page fonts. Exported because the silent
 * warm-up records which release it finished, so bumping this re-fetches.
 */
export const FONT_RELEASE = 'mushaf-fonts-v2';
const STORE_VERSION = 'v2';

/**
 * The font SETS the store keeps — the tajwīd colours.
 *
 * `v2` is the plain Ḥafṣ muṣḥaf every install reads. The two `tajweed`
 * sets are the QPC V4 tajwīd fonts, one file per page per palette: the
 * platform cannot pick a palette out of a colour font, so the build
 * wrote a light and a dark file of every page and the reader fetches the
 * one its tone needs (`scripts/mushaf/build_tajweed_assets.py`). Each
 * set has its own release — GitHub allows a thousand assets per release,
 * and two palettes of 604 pages are twelve hundred — the two tajwīd sets
 * share a folder, and a page is "on the device" per set: deleting one
 * set leaves the others.
 */
export type MushafFontSet = 'v2' | 'tajweed-light' | 'tajweed-dark';

export const TAJWEED_FONT_RELEASES: { light: string; dark: string } = tajweedManifest.releases;

type FontSetSpec = {
  release: string;
  dir: string;
  file: (page: number) => string;
  /** The size the release serves for each page, by page − 1. */
  bytes: ReadonlyArray<number>;
  /** The page a file name stands for, if it is one of this set's. */
  page: (name: string) => number | null;
};

const pad3 = (page: number) => String(page).padStart(3, '0');
const pageIn = (m: RegExpExecArray | null): number | null => {
  if (!m) return null;
  const page = Number(m[1]);
  return page >= 1 && page <= MUSHAF_TOTAL_PAGES ? page : null;
};

const SETS: Record<MushafFontSet, FontSetSpec> = {
  v2: {
    release: FONT_RELEASE,
    dir: STORE_VERSION,
    file: page => `QCF2${pad3(page)}.ttf`,
    bytes: manifest.bytes,
    page: name => pageIn(/^QCF2(\d{3})\.ttf$/.exec(name)),
  },
  'tajweed-light': {
    release: tajweedManifest.releases.light,
    dir: 'v4-tajweed',
    file: page => `QCF4T${pad3(page)}L.ttf`,
    bytes: tajweedManifest.light,
    page: name => pageIn(/^QCF4T(\d{3})L\.ttf$/.exec(name)),
  },
  'tajweed-dark': {
    release: tajweedManifest.releases.dark,
    dir: 'v4-tajweed',
    file: page => `QCF4T${pad3(page)}D.ttf`,
    bytes: tajweedManifest.dark,
    page: name => pageIn(/^QCF4T(\d{3})D\.ttf$/.exec(name)),
  },
};

/** The tajwīd set a page tone draws: the dark palette on the night page. */
export function tajweedFontSet(nightMode: boolean): MushafFontSet {
  return nightMode ? 'tajweed-dark' : 'tajweed-light';
}

/** Smallest plausible page font; anything under this is a failed download. */
export const MIN_FONT_BYTES = 8_192;

/**
 * The byte size of every page font AS UPLOADED to the release — written by
 * `scripts/mushaf/rebuild_fonts_from_layout.py` beside the fonts it cut.
 *
 * ── WHY A FONT ON DISK IS NOT TRUSTED BY ITS NAME ─────────────────────
 *
 * Twenty of the fonts on the release were cut from a word list that lacked
 * a few of their pages' glyphs, and the reader drew those words in whatever
 * face the platform fell back to: page 564 ended in "له مج مح مخ" and page
 * 592 lost an ayah to "هي يج يح يخ يم يى" (reported 2026-09-03, with
 * screenshots). The fonts were replaced on the release — but a device that
 * had already fetched them held the bad ones, at the right name and a
 * plausible size, and nothing would ever fetch them again.
 *
 * So a font is the right font only when its size is the manifest's. A
 * mismatch is STALE: present for the gate's purposes (the muṣḥaf is on the
 * device, nobody is asked for 180 MB), fetched again before it is drawn.
 * Sizes are what a directory listing returns in one round-trip; a hash
 * would mean reading 180 MB on every open.
 */
/** The size the release serves for a page's font, or 0 if the manifest has none. */
export function expectedFontBytes(page: number, set: MushafFontSet = 'v2'): number {
  const safe = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, Math.round(page)));
  return SETS[set].bytes[safe - 1] ?? 0;
}

export type FontFileState = 'missing' | 'stale' | 'ok';

/**
 * What a file of `bytes` at a page's path is. Pure, so the rule can be
 * tested without a filesystem: too small is a failed download and counts
 * as missing; the wrong size is the wrong font.
 */
export function fontFileState(
  bytes: number,
  page: number,
  set: MushafFontSet = 'v2',
): FontFileState {
  if (!(bytes >= MIN_FONT_BYTES)) return 'missing';
  const expected = expectedFontBytes(page, set);
  if (expected > 0 && bytes !== expected) return 'stale';
  return 'ok';
}

/**
 * Where the page fonts live. Exported so the asset reconciliation can stamp
 * the release they came from beside them — a store with no record of which
 * release filled it cannot be told from one that is out of date.
 */
export function fontStoreDir(set: MushafFontSet = 'v2'): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/fonts/${SETS[set].dir}`;
}

function storeDir(set: MushafFontSet): string {
  return fontStoreDir(set);
}

export function fontFileName(page: number, set: MushafFontSet = 'v2'): string {
  const safe = Math.max(1, Math.min(MUSHAF_TOTAL_PAGES, Math.round(page)));
  return SETS[set].file(safe);
}

export function fontFilePath(page: number, set: MushafFontSet = 'v2'): string {
  return `${storeDir(set)}/${fontFileName(page, set)}`;
}

export function fontUrl(page: number, set: MushafFontSet = 'v2'): string {
  return `https://github.com/Hassan-PS/Mihrab/releases/download/${
    SETS[set].release
  }/${fontFileName(page, set)}`;
}

async function fileOk(path: string, page: number, set: MushafFontSet): Promise<boolean> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return false;
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return fontFileState(Number(stat.size), page, set) === 'ok';
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
async function fetchFontViaRNFetch(
  page: number,
  set: MushafFontSet,
  dest: string,
): Promise<void> {
  // A deadline, because this is the path a broken network ROUTES TO: one
  // streaming failure condemns that transport for the session, and from
  // then on all 604 pages come through here. Untimed, a stalled proxy
  // left the reader on a page that would never draw.
  const response = await fetchContentOnce(
    fontUrl(page, set),
    undefined,
    CONTENT_DEADLINES.pageFont,
  );
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

const inFlight = new Map<string, Promise<string | null>>();

/**
 * The store directory only has to be created once per launch. `mkdirDeep`
 * creates each path segment in turn, so calling it per page meant several
 * bridge round-trips × 604 competing with the downloads themselves.
 */
const storeDirReady = new Set<string>();
async function ensureStoreDir(set: MushafFontSet): Promise<void> {
  const dir = storeDir(set);
  if (storeDirReady.has(dir)) return;
  await mkdirDeep(dir);
  storeDirReady.add(dir);
}

/**
 * Which transport works here, learned from the first file that tries.
 *
 * `ReactNativeBlobUtil`'s streaming downloader is the one to want — it writes
 * the response straight to disk. On some networks it fails instantly with
 * "Download interrupted" for every request, and there is a slower fallback
 * (RN's own fetch, through a blob and base64) for exactly that case.
 *
 * What it must not do is rediscover that 604 times. Measured on an emulator
 * where the streaming path is broken: two doomed requests and 0.9 s of backoff
 * per file, which is 1,208 pointless requests and nine minutes of sleeping —
 * the whole reason the download crawled and appeared to freeze in blocks.
 * One failure now condemns the transport for the rest of the session, and the
 * next launch gives it another chance in case the network has changed.
 */
let streamingDownloadWorks = true;

/** Rate-limited download telemetry, so a slow run can be diagnosed from a log. */
const stats = { retries: 0, failures: 0, bytes: 0, lastLog: 0, startedAt: 0 };

function noteProgress(done: number, total: number, now: number): void {
  if (stats.startedAt === 0) stats.startedAt = now;
  if (now - stats.lastLog < 5000) return;
  stats.lastLog = now;
  const secs = Math.max(0.001, (now - stats.startedAt) / 1000);
  console.log(
    `[mushafFonts] ${done}/${total} · ${(done / secs).toFixed(1)} files/s · ` +
      `${(stats.bytes / 1048576 / secs).toFixed(2)} MB/s · retries=${stats.retries} · failed=${stats.failures}`,
  );
}

/**
 * Ensure page's font file is on disk and return its path (null on failure).
 * Concurrent callers for the same page share one download.
 */
export function ensurePageFontFile(
  page: number,
  set: MushafFontSet = 'v2',
): Promise<string | null> {
  const key = `${set}:${page}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<string | null> => {
    const path = fontFilePath(page, set);
    try {
      if (await fileOk(path, page, set)) return path;
      await ensureStoreDir(set);
      const tmp = `${path}.part`;
      let lastError: unknown = null;
      let landed = false;
      for (let attempt = 1; attempt <= 3 && !landed; attempt++) {
        try {
          // Only on a retry: on the first attempt there is nothing to clean,
          // and unlinking a file that isn't there costs a bridge round-trip
          // and a thrown exception, 604 times over.
          if (attempt > 1) {
            stats.retries += 1;
            await ReactNativeBlobUtil.fs.unlink(tmp).catch(() => undefined);
          }
          if (attempt === 3 || !streamingDownloadWorks) {
            await fetchFontViaRNFetch(page, set, path);
            landed = true;
            break;
          }
          // No `timeout` in the config: on Android it makes every download
          // fail instantly with "Download interrupted" — so the deadline is
          // a JS race instead. Without one, a stalled connection never
          // reached the `catch` that condemns the transport, and the page
          // simply never arrived.
          const res = await withDownloadDeadline(
            ReactNativeBlobUtil.config({ path: tmp, overwrite: true }).fetch(
              'GET',
              fontUrl(page, set),
            ),
            CONTENT_DEADLINES.pageFont,
            `font ${page}`,
          );
          const status = res.info().status;
          const stat = await ReactNativeBlobUtil.fs.stat(tmp).catch(() => null);
          if (status !== 200 || !stat || Number(stat.size) < MIN_FONT_BYTES) {
            throw new Error(`font ${page}: HTTP ${status}`);
          }
          if (fontFileState(Number(stat.size), page, set) === 'stale') {
            // The release served a font the manifest does not describe — a
            // CDN still holding a superseded asset, say. Not this font.
            throw new Error(
              `font ${page}: ${stat.size} bytes, manifest says ${expectedFontBytes(page, set)}`,
            );
          }
          stats.bytes += Number(stat.size);
          await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
          await ReactNativeBlobUtil.fs.mv(tmp, path);
          landed = true;
        } catch (e) {
          lastError = e;
          if (streamingDownloadWorks) {
            // First failure of the run: take the hint and stop offering the
            // streaming path to the other 603 files.
            streamingDownloadWorks = false;
            console.log(
              `[mushafFonts] streaming download unavailable (${String(
                (e as Error)?.message ?? e,
              )}) — using the fallback transport for this session`,
            );
          }
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
      // Measured on an emulator: 1.4 ms per file, so this is not what makes a
      // bulk download slow — the transfer is.
      if (!(await isValidFontFile(path))) {
        await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
        throw new Error(`font ${page}: not a usable font`);
      }
      return path;
    } catch (e) {
      console.warn(`mushafFonts: page ${page}`, e);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

export type FontDownloadProgress = { done: number; total: number; failed: number };

export type FontDownloadHandle = {
  /** How it ended — see `DownloadOutcome`, and issue #55 for why three. */
  promise: Promise<DownloadOutcome>;
  cancel: () => void;
};

/**
 * Fetch every page font — the gate on opening the reader, and the offline
 * option in Manage downloads.
 *
 * Four workers, not eight. Eight was inherited from the page-image store,
 * where it roughly tripled throughput — but that was tuned against a desktop
 * connection, and eight parallel TLS streams on a phone radio queue behind
 * each other, stall, and time out into the retry path instead. Fewer, steadier
 * connections finish sooner and, just as importantly, keep the progress moving
 * rather than freezing in blocks while a worker waits out a stall.
 */
export function downloadAllPageFonts({
  concurrency = 4,
  onProgress,
  set = 'v2',
}: {
  concurrency?: number;
  onProgress?: (p: FontDownloadProgress) => void;
  set?: MushafFontSet;
} = {}): FontDownloadHandle {
  let cancelled = false;
  let done = 0;
  let failed = 0;
  /** See `GIVE_UP_AFTER_CONSECUTIVE_FAILURES`, and issue #55. */
  let inARow = 0;
  let interrupted = false;

  const run = async (): Promise<DownloadOutcome> => {
    await ensureStoreDir(set);
    stats.retries = 0;
    stats.failures = 0;
    stats.bytes = 0;
    stats.startedAt = 0;
    stats.lastLog = 0;
    // ── ONE LISTING, NOT SIX HUNDRED AND FOUR STATS ──────────────────
    //
    // Every page went through `ensurePageFontFile`, which asks the disk
    // whether the file is there and then how big it is — two bridge
    // round-trips per page, before a single byte was fetched, on a store
    // that is often mostly full: a tajwīd palette read for a week has
    // hundreds of its pages already, and a download that was interrupted
    // has all the ones before the interruption. The directory listing
    // says in one call which pages are already the right font; only the
    // rest are queued, and the count starts where the disk is rather
    // than walking to 604 through pages it skips.
    const onDisk = await okPagesOnDisk(set);
    const queue: number[] = [];
    for (let i = 1; i <= MUSHAF_TOTAL_PAGES; i++) {
      if (!onDisk.has(i)) queue.push(i);
    }
    done = MUSHAF_TOTAL_PAGES - queue.length;
    if (queue.length === 0) {
      knownComplete.add(set);
      onProgress?.({ done, total: MUSHAF_TOTAL_PAGES, failed });
      return { complete: true, interrupted: false };
    }
    onProgress?.({ done, total: MUSHAF_TOTAL_PAGES, failed });

    const worker = async (): Promise<void> => {
      while (!cancelled && !interrupted) {
        const page = queue.shift();
        if (page == null) return;
        const path = await ensurePageFontFile(page, set);
        if (path == null) {
          failed += 1;
          stats.failures += 1;
          inARow += 1;
          // The connection, not the pages — the same reasoning as the
          // audio queue, and the same ending. A hundred and eighty
          // megabytes of book is a download people walk away from.
          if (inARow >= GIVE_UP_AFTER_CONSECUTIVE_FAILURES) interrupted = true;
        } else {
          inARow = 0;
        }
        done += 1;
        onProgress?.({ done, total: MUSHAF_TOTAL_PAGES, failed });
        noteProgress(done, MUSHAF_TOTAL_PAGES, Date.now());
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const complete = !cancelled && !interrupted && failed === 0;
    if (complete) knownComplete.add(set);
    return { complete, interrupted: interrupted && !cancelled };
  };

  return { promise: run(), cancel: () => { cancelled = true; } };
}

/**
 * The pages whose font on disk is the manifest's — what a bulk download
 * can skip. One `lstat` of the directory; see `fontStoreStats` for why
 * that and not a stat per file.
 */
async function okPagesOnDisk(set: MushafFontSet): Promise<Set<number>> {
  const ok = new Set<number>();
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(storeDir(set)))) return ok;
    const entries = (await ReactNativeBlobUtil.fs.lstat(storeDir(set))) as Array<{
      filename: string;
      size: string | number;
      type: string;
    }>;
    for (const entry of entries) {
      if (entry.type === 'directory' || !entry.filename.endsWith('.ttf')) continue;
      const page = pageOfFileName(entry.filename, set);
      if (page == null) continue;
      if (fontFileState(Number(entry.size) || 0, page, set) === 'ok') ok.add(page);
    }
  } catch {
    /* an unreadable listing just means nothing is skipped */
  }
  return ok;
}

/**
 * Whether this process has seen the store complete. Set by the one listing
 * that found all 604, and by the download that finished them; cleared by the
 * delete. The reader's gate asks this first and opens on the answer, so the
 * second open of the muṣḥaf in a session waits on nothing at all.
 */
const knownComplete = new Set<MushafFontSet>();

export function fontStoreKnownComplete(set: MushafFontSet = 'v2'): boolean {
  return knownComplete.has(set);
}

/**
 * How many page fonts are on disk, and how many bytes they take.
 *
 * ONE call over the bridge, not six hundred and five. This used to `ls` the
 * directory and then `stat` each file in turn, serially, awaiting each — and
 * the reader's gate ran it on every open before it would draw a page. On a
 * phone that was several hundred milliseconds of spinner in front of a
 * muṣḥaf that had been on the device for months. `lstat` on the directory
 * returns every entry with its size in a single round-trip.
 */
export async function fontStoreStats(set: MushafFontSet = 'v2'): Promise<{
  /** Page fonts on disk — the right ones and the stale ones together. */
  pages: number;
  /**
   * Of those, the ones whose size is not the manifest's.
   *
   * REPORTED, NOT ACTED ON. This function is a question the reader's gate,
   * the launch reconciliation and the downloads screen all ask, and a
   * question that quietly starts six hundred downloads is not a question —
   * in a test it also outlives the test that asked it. `repairStaleFonts`
   * is the answer, and `reconcileMushafAssets` is who gives it.
   */
  stalePages: number[];
  bytes: number;
}> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(storeDir(set)))) {
      return { pages: 0, stalePages: [], bytes: 0 };
    }
    const entries = (await ReactNativeBlobUtil.fs.lstat(storeDir(set))) as Array<{
      filename: string;
      size: string | number;
      type: string;
    }>;
    let bytes = 0;
    let pages = 0;
    const stalePages: number[] = [];
    for (const entry of entries) {
      if (entry.type === 'directory' || !entry.filename.endsWith('.ttf')) continue;
      const page = pageOfFileName(entry.filename, set);
      if (page == null) continue;
      const size = Number(entry.size) || 0;
      const state = fontFileState(size, page, set);
      if (state === 'missing') continue;
      pages += 1;
      bytes += size;
      if (state === 'stale') stalePages.push(page);
    }
    if (pages >= MUSHAF_TOTAL_PAGES) knownComplete.add(set);
    return { pages, stalePages, bytes };
  } catch {
    return { pages: 0, stalePages: [], bytes: 0 };
  }
}

/** `QCF2564.ttf` → 564; anything else in the directory → null. */
export function pageOfFileName(name: string, set: MushafFontSet = 'v2'): number | null {
  return SETS[set].page(name);
}

/**
 * Fetch the stale fonts again, quietly, two at a time.
 *
 * Called with what a listing found — from the launch reconciliation, which
 * is where "the files on disk are not the files this build reads" belongs —
 * and at most once per session: a second call while it runs would only
 * queue the same pages behind themselves. A page opened before its turn is
 * not left waiting on this: the surface asks `ensurePageFontFile` for the
 * page, which sees the stale size and fetches it then, sharing the
 * download if it is already in flight.
 */
let repairing = false;
export function repairStaleFonts(pages: number[], set: MushafFontSet = 'v2'): void {
  if (repairing || pages.length === 0) return;
  repairing = true;
  console.log(`[mushafFonts] ${pages.length} stale page fonts — re-fetching`);
  const queue = [...pages];
  const worker = async (): Promise<void> => {
    for (;;) {
      const page = queue.shift();
      if (page == null) return;
      await ensurePageFontFile(page, set);
    }
  };
  void Promise.all([worker(), worker()]).finally(() => {
    repairing = false;
  });
}

/** For tests. */
export function _resetFontStoreForTests(): void {
  repairing = false;
  knownComplete.clear();
}

export async function deletePageFonts(set: MushafFontSet = 'v2'): Promise<void> {
  knownComplete.delete(set);
  if (set === 'v2') {
    await ReactNativeBlobUtil.fs.unlink(storeDir(set)).catch(() => undefined);
    return;
  }
  // The two tajwīd sets share a folder: delete only this set's files.
  const entries = (await ReactNativeBlobUtil.fs
    .lstat(storeDir(set))
    .catch(() => [])) as Array<{ filename: string; path: string }>;
  for (const entry of entries) {
    if (pageOfFileName(entry.filename, set) != null) {
      await ReactNativeBlobUtil.fs.unlink(entry.path).catch(() => undefined);
    }
  }
}
