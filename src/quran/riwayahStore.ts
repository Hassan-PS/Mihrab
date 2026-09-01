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

const STORE_VERSION = 'v1';

/** Where the datasets live. */
export function riwayahStoreDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/riwayat/${STORE_VERSION}`;
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
  }>(`${dir}/pages.json`);
  const text = await readJson<Record<string, string>>(`${dir}/text.json`);
  if (!pages || !text) return null;
  if (!Array.isArray(pages.pages) || pages.pages.length === 0) return null;
  if (Object.keys(text).length === 0) return null;
  return { pages: pages.pages, surahs: pages.surahs ?? [], text };
}

export async function readRiwayahProvenance(
  id: RiwayahId,
): Promise<RiwayahProvenance | null> {
  return readJson<RiwayahProvenance>(`${riwayahDir(id)}/source.json`);
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
    // Measured from what was written rather than stat'ed: the two files
    // are the muṣḥaf, and a directory listing on some platforms rounds to
    // block size, which would report a different number every install.
    bytes: pagesBlob.length + textBlob.length,
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
