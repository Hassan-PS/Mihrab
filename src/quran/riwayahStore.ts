/**
 * Where a riwayah's muṣḥaf lives once the reader has obtained it.
 *
 *   <Documents>/quran/riwayat/v1/<id>/pages.json
 *   <Documents>/quran/riwayat/v1/<id>/text.json
 *   <Documents>/quran/riwayat/v1/<id>/source.json
 *
 * ── WHY THE DEVICE AND NOT THE BUNDLE ─────────────────────────────────
 *
 * The app shipped these files, briefly, as empty placeholders — because
 * Metro resolves `require()` at bundle time, so a riwayah's data had to
 * exist at a fixed path in every checkout whether or not it existed at
 * all. That was a workaround for a design that was wrong underneath it.
 *
 * Mihrab does not have the right to distribute the Warsh corpus. QUL's
 * resources state no licence, its credits name KFGQPC and Tanzil, and
 * nobody publishes a Warsh text under terms anyone can point at (looked,
 * September 2026: Tanzil is Hafs only, alquran.cloud has no Warsh
 * edition, DigitalKhatt is Hafs, ITQAN's catalogue states no licences at
 * all). Asking is one route. The other is not to distribute it: the app
 * ships a reader, the reader obtains the muṣḥaf from whoever publishes
 * it, and it arrives here — on their device, from the publisher, without
 * Mihrab ever holding a copy or standing in the chain.
 *
 * `source.json` is not bookkeeping. It records where a file came from and
 * when, because a muṣḥaf whose provenance nobody can state is exactly the
 * thing this design exists to avoid, and the reader is entitled to see
 * the answer on the screen that offers to delete it.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { mkdirDeep } from './mushafDownload';
import type { RiwayahDataset } from './riwayahImport';
import type { RiwayahId } from './riwayat';

/**
 * The store's path under Documents — and its identity for the sync
 * decision.
 *
 * Named `..._KEY` on purpose, though it is a directory rather than an
 * AsyncStorage key: `syncCompleteness.test.ts` reads the source for
 * declared stores and fails the build until each one is recorded as either
 * travelling in an export or deliberately staying. A store that quietly
 * escaped that check is exactly the thing the test was written to catch,
 * and a muṣḥaf on the device is a store however it is spelled.
 */
export const RIWAYAH_STORE_KEY = 'quran/riwayat/v1';

/** Where the datasets live. */
export function riwayahStoreDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${RIWAYAH_STORE_KEY}`;
}

export function riwayahDir(id: RiwayahId): string {
  return `${riwayahStoreDir()}/${id}`;
}

/** How a muṣḥaf on this device got here. */
export type RiwayahProvenance = {
  /** Where the reader took it from — a URL, or a description of a file. */
  from: string;
  /** ISO date it was installed. */
  at: string;
  /** Ayahs and pages it turned out to hold, as verified at install. */
  ayahs: number;
  pages: number;
  /** Bytes on disk, for the screen that offers to remove it. */
  bytes: number;
};

async function readJson<T>(path: string): Promise<T | null> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(path))) return null;
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * The dataset for a riwayah, or null when this device does not have it.
 *
 * Both halves or neither: a `pages.json` without its `text.json` is a
 * pagination with nothing to paginate, and rendering it would produce a
 * muṣḥaf of blank pages rather than an honest absence.
 */
export async function readRiwayahDataset(
  id: RiwayahId,
): Promise<RiwayahDataset | null> {
  const dir = riwayahDir(id);
  const pages = await readJson<{
    pages: RiwayahDataset['pages'];
    surahs: RiwayahDataset['surahs'];
    ayahCounts?: RiwayahDataset['ayahCounts'];
  }>(`${dir}/pages.json`);
  const text = await readJson<Record<string, string>>(`${dir}/text.json`);
  if (!pages || !text) return null;
  if (!Array.isArray(pages.pages) || pages.pages.length === 0) return null;
  if (Object.keys(text).length === 0) return null;
  return {
    pages: pages.pages,
    surahs: pages.surahs ?? [],
    // Absent in a muṣḥaf written by 2.13, which assumed every riwayah had
    // the Ḥafṣ counts. Derived from the text it actually holds rather than
    // re-fetched: the file on disk is the truth about what was installed.
    ayahCounts: pages.ayahCounts ?? countsFromText(text),
    text,
  };
}

/**
 * Ayahs per surah, read off a stored text map.
 *
 * The fallback for a muṣḥaf installed before `ayahCounts` was written
 * beside the pagination. Counting keys is exact — the text map holds one
 * entry per ayah and nothing else.
 */
function countsFromText(text: Record<string, string>): number[] {
  const counts = new Array<number>(114).fill(0);
  for (const key of Object.keys(text)) {
    const m = /^(\d+):(\d+)$/.exec(key);
    if (!m) continue;
    const surah = Number(m[1]);
    if (surah < 1 || surah > 114) continue;
    counts[surah - 1] = Math.max(counts[surah - 1], Number(m[2]));
  }
  return counts;
}

/**
 * Bytes a string takes as UTF-8 — which is what it takes on disk.
 *
 * `String.length` is UTF-16 CODE UNITS, and for an Arabic muṣḥaf that is
 * not close: nearly every character of it — letters and the marks alike —
 * sits in U+0600–U+06FF, which is ONE code unit and TWO bytes. Measured
 * against the real file, the Warsh text came out 774 KB by `.length` and
 * 1.38 MB on disk, a factor of 1.82, so the one screen whose job is to
 * tell a reader what a muṣḥaf costs them was reporting a little over half
 * of it.
 *
 * Counted by hand rather than with `TextEncoder`, which Hermes does not
 * have — `hermesGlobals.test.ts` is the guard that stops that assumption
 * being made again.
 */
export function utf8Length(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // A surrogate PAIR is one code point in four bytes; consume both.
        bytes += 4;
        i += 1;
        continue;
      }
      bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** The three files a muṣḥaf is stored in. */
const RIWAYAH_FILES = ['pages.json', 'text.json', 'source.json'];

/**
 * What this muṣḥaf actually occupies, asked of the filesystem.
 *
 * Provenance written before the fix above carries a UTF-16 count, and
 * there is no way to tell one number from the other by looking at it. So
 * the size is not trusted from the file at all — it is measured, once,
 * when the provenance is read into the cache. That repairs every muṣḥaf
 * already installed without asking anyone to download it again.
 *
 * `stat` reports the file's own length, not its allocation, so it does
 * not vary with the block size the way the original comment here feared.
 */
async function bytesOnDisk(id: RiwayahId): Promise<number | null> {
  const dir = riwayahDir(id);
  let total = 0;
  for (const name of RIWAYAH_FILES) {
    try {
      const stat = await ReactNativeBlobUtil.fs.stat(`${dir}/${name}`);
      const size = Number(stat?.size);
      if (Number.isFinite(size) && size > 0) total += size;
    } catch {
      // A missing file is a real answer: it contributes nothing.
    }
  }
  return total > 0 ? total : null;
}

export async function readRiwayahProvenance(
  id: RiwayahId,
): Promise<RiwayahProvenance | null> {
  const stored = await readJson<RiwayahProvenance>(
    `${riwayahDir(id)}/source.json`,
  );
  if (!stored) return null;
  const measured = await bytesOnDisk(id);
  return measured != null ? { ...stored, bytes: measured } : stored;
}

/**
 * Write a verified dataset, then its provenance.
 *
 * In that order, deliberately: `source.json` is what the store treats as
 * "this one is finished". A write interrupted halfway leaves a dataset
 * with no provenance, which reads as absent and is replaced on the next
 * attempt — rather than a half-written muṣḥaf that looks installed.
 */
export async function writeRiwayahDataset(
  id: RiwayahId,
  dataset: RiwayahDataset,
  from: string,
): Promise<RiwayahProvenance> {
  const dir = riwayahDir(id);
  await mkdirDeep(dir);
  const pagesBlob = JSON.stringify({
    pages: dataset.pages,
    surahs: dataset.surahs,
  });
  const textBlob = JSON.stringify(dataset.text);
  await ReactNativeBlobUtil.fs.writeFile(
    `${dir}/pages.json`,
    pagesBlob,
    'utf8',
  );
  await ReactNativeBlobUtil.fs.writeFile(`${dir}/text.json`, textBlob, 'utf8');
  const provenance: RiwayahProvenance = {
    from,
    at: new Date().toISOString(),
    ayahs: Object.keys(dataset.text).length,
    pages: dataset.pages.length,
    // UTF-8, not `String.length` — see `utf8Length`. This is the number
    // read back from `source.json` on a platform where the stat above
    // cannot answer; where it can, the stat wins, because it is the only
    // one that also fixes a muṣḥaf installed before this was right.
    bytes: utf8Length(pagesBlob) + utf8Length(textBlob),
  };
  await ReactNativeBlobUtil.fs.writeFile(
    `${dir}/source.json`,
    JSON.stringify(provenance),
    'utf8',
  );
  return provenance;
}

/** Remove a riwayah's muṣḥaf from this device, provenance and all. */
export async function eraseRiwayahDataset(id: RiwayahId): Promise<void> {
  const dir = riwayahDir(id);
  for (const name of ['source.json', 'text.json', 'pages.json']) {
    try {
      await ReactNativeBlobUtil.fs.unlink(`${dir}/${name}`);
    } catch {
      // Already gone is the state we wanted.
    }
  }
  try {
    await ReactNativeBlobUtil.fs.unlink(dir);
  } catch {
    // A directory that will not go is not a failure to remove the muṣḥaf.
  }
}
