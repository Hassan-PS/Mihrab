/**
 * Reconciling the Quran files on disk with the ones this build actually reads.
 *
 * Two kinds of stale file can be sitting in an install that has been UPDATED
 * rather than freshly installed, and neither of them announces itself:
 *
 * - **The retired page images.** Up to ~120 MB of PNGs plus their render
 *   cache, from the mushaf reader that 2.8.0 replaced with the font-rendered
 *   one. Nothing has read them since. They were only ever swept when the user
 *   happened to start a font download from inside the reader, so anyone who
 *   opened the reader once, said "not now" and never went back is still
 *   carrying the whole thing.
 * - **Page fonts from a superseded release.** The store had no record of
 *   which release filled it, so a corrected font could be published and every
 *   existing reader would keep drawing from the old files forever — the one
 *   failure mode you cannot ask a user to work around, because from inside
 *   the app the pages look fine.
 *
 * So the store now carries a stamp naming the release it was filled from, and
 * this runs once per launch: sweep what is retired, drop what is superseded,
 * and leave alone what is current.
 *
 * A store with NO stamp is adopted rather than dropped. It predates the stamp
 * and its files are the current release by construction — re-fetching 180 MB
 * on the strength of a missing bookkeeping file would be this update charging
 * every existing reader for our own change of mind.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  FONT_RELEASE,
  deletePageFonts,
  fontStoreDir,
  fontStoreStats,
} from './mushafFontStore';
import { deleteLegacyImageStore, mkdirDeep } from './mushafDownload';

/**
 * What the files on disk have to match. Bumping `FONT_RELEASE` bumps this,
 * which is what makes every reader re-fetch the pages.
 */
export const MUSHAF_ASSET_GENERATION = FONT_RELEASE;

const STAMP_FILE = 'release.txt';

function stampPath(): string {
  return `${fontStoreDir()}/${STAMP_FILE}`;
}

export type MushafStoreState = {
  /** The release the store says it was filled from, or null if unstamped. */
  stamp: string | null;
  /** How many page fonts are on disk. */
  pagesOnDisk: number;
};

export type MushafAssetAction =
  /** The files match this build. Nothing to do. */
  | 'keep'
  /** Unstamped, so take it at its word and record the current release. */
  | 'adopt'
  /** Stamped with something else — drop it so the pages come back fresh. */
  | 'refetch';

/**
 * The decision, with no filesystem in it, so every branch can be tested
 * rather than reasoned about.
 */
export function assetActionFor(
  state: MushafStoreState,
  generation: string = MUSHAF_ASSET_GENERATION,
): MushafAssetAction {
  if (state.pagesOnDisk <= 0) return 'adopt';
  if (state.stamp === null) return 'adopt';
  return state.stamp === generation ? 'keep' : 'refetch';
}

export type MushafReconciliation = {
  /** Bytes reclaimed from the retired page-image store. */
  imageBytesFreed: number;
  /** True when superseded page fonts were dropped and will be re-fetched. */
  fontsDropped: boolean;
  action: MushafAssetAction;
};

async function readStamp(): Promise<string | null> {
  try {
    if (!(await ReactNativeBlobUtil.fs.exists(stampPath()))) return null;
    const raw = await ReactNativeBlobUtil.fs.readFile(stampPath(), 'utf8');
    const value = String(raw).trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function writeStamp(generation: string): Promise<void> {
  try {
    await mkdirDeep(fontStoreDir());
    await ReactNativeBlobUtil.fs.writeFile(stampPath(), generation, 'utf8');
  } catch (e) {
    // Not fatal: the worst case is that the next launch reconciles again.
    console.warn('mushafAssets: could not stamp the font store', e);
  }
}

/**
 * Run once per launch. Cheap when there is nothing to do — one `exists` on
 * the retired store, one small read — and it never blocks anything: the
 * reader gates on `fontStoreStats()` and will ask for whatever is missing.
 */
export async function reconcileMushafAssets(
  generation: string = MUSHAF_ASSET_GENERATION,
): Promise<MushafReconciliation> {
  let imageBytesFreed = 0;
  try {
    imageBytesFreed = await deleteLegacyImageStore();
  } catch (e) {
    console.warn('mushafAssets: could not sweep the retired image store', e);
  }

  const [stamp, stats] = await Promise.all([readStamp(), fontStoreStats()]);
  const action = assetActionFor(
    { stamp, pagesOnDisk: stats.pages },
    generation,
  );

  let fontsDropped = false;
  if (action === 'refetch') {
    await deletePageFonts().catch(() => undefined);
    fontsDropped = true;
  }
  if (action !== 'keep') await writeStamp(generation);

  const notes: string[] = [];
  if (imageBytesFreed > 0) {
    notes.push(
      `freed ${(imageBytesFreed / 1048576).toFixed(0)} MB of retired page images`,
    );
  }
  if (fontsDropped) notes.push('page fonts superseded, will re-fetch');
  if (notes.length > 0) console.log(`[mushafAssets] ${notes.join('; ')}`);
  return { imageBytesFreed, fontsDropped, action };
}
