/**
 * What an updated install is still carrying, and what it should do about it.
 *
 * The two failures being guarded here are opposites, and both are silent:
 * keeping files this build will never read (the retired page images, and
 * page fonts from a superseded release), and re-fetching 180 MB of files
 * that were perfectly good because we changed how we keep track of them.
 */
jest.mock('../src/quran/mushafDownload', () => ({
  deleteLegacyImageStore: jest.fn(async () => 0),
  mkdirDeep: jest.fn(async () => undefined),
}));

jest.mock('../src/quran/mushafFontStore', () => ({
  FONT_RELEASE: 'mushaf-fonts-v2',
  fontStoreDir: () => '/mock/documents/quran/fonts/v2',
  deletePageFonts: jest.fn(async () => undefined),
  fontStoreStats: jest.fn(async () => ({ pages: 0, stalePages: [], bytes: 0 })),
  repairStaleFonts: jest.fn(),
}));

import ReactNativeBlobUtil from 'react-native-blob-util';
import { deleteLegacyImageStore } from '../src/quran/mushafDownload';
import {
  deletePageFonts,
  fontStoreStats,
  repairStaleFonts,
} from '../src/quran/mushafFontStore';
import {
  MUSHAF_ASSET_GENERATION,
  assetActionFor,
  reconcileMushafAssets,
} from '../src/quran/mushafAssets';

const sweepImages = deleteLegacyImageStore as unknown as jest.Mock;
const dropFonts = deletePageFonts as unknown as jest.Mock;
const storeStats = fontStoreStats as unknown as jest.Mock;
const repair = repairStaleFonts as unknown as jest.Mock;

const STAMP = '/mock/documents/quran/fonts/v2/release.txt';
const GEN = MUSHAF_ASSET_GENERATION;

const seedStamp = (value: string) =>
  ReactNativeBlobUtil.fs.writeFile(STAMP, value, 'utf8');
const readStamp = async () =>
  (await ReactNativeBlobUtil.fs.exists(STAMP))
    ? String(await ReactNativeBlobUtil.fs.readFile(STAMP, 'utf8'))
    : null;

/** A store that is full, so there is something to keep or drop. */
const full = () =>
  storeStats.mockResolvedValue({ pages: 604, stalePages: [], bytes: 1 });

beforeEach(async () => {
  jest.clearAllMocks();
  await ReactNativeBlobUtil.fs.unlink(STAMP).catch(() => undefined);
  sweepImages.mockResolvedValue(0);
  storeStats.mockResolvedValue({ pages: 0, stalePages: [], bytes: 0 });
  repair.mockClear();
});

describe('assetActionFor', () => {
  it('keeps a store stamped with this release', () => {
    expect(assetActionFor({ stamp: GEN, pagesOnDisk: 604 }, GEN)).toBe('keep');
  });

  it('re-fetches a store stamped with a different one', () => {
    expect(
      assetActionFor({ stamp: 'mushaf-fonts-v1', pagesOnDisk: 604 }, GEN),
    ).toBe('refetch');
    expect(
      assetActionFor({ stamp: 'mushaf-fonts-v3', pagesOnDisk: 12 }, GEN),
    ).toBe('refetch');
  });

  it('adopts an unstamped store rather than making everyone re-download', () => {
    expect(assetActionFor({ stamp: null, pagesOnDisk: 604 }, GEN)).toBe('adopt');
    expect(assetActionFor({ stamp: null, pagesOnDisk: 3 }, GEN)).toBe('adopt');
  });

  it('adopts an empty store whatever it claims — there is nothing to drop', () => {
    expect(assetActionFor({ stamp: 'anything', pagesOnDisk: 0 }, GEN)).toBe(
      'adopt',
    );
  });
});

describe('reconcileMushafAssets', () => {
  it('sweeps the retired page images even when the fonts are current', async () => {
    sweepImages.mockResolvedValue(126_000_000);
    full();
    await seedStamp(GEN);

    const r = await reconcileMushafAssets();

    expect(r.imageBytesFreed).toBe(126_000_000);
    expect(r.action).toBe('keep');
    expect(r.fontsDropped).toBe(false);
    expect(dropFonts).not.toHaveBeenCalled();
  });

  it('drops page fonts from a superseded release and stamps the new one', async () => {
    full();
    await seedStamp('mushaf-fonts-v1');

    const r = await reconcileMushafAssets();

    expect(r.fontsDropped).toBe(true);
    expect(dropFonts).toHaveBeenCalledTimes(1);
    expect(await readStamp()).toBe(GEN);
  });

  it('adopts an unstamped store: nothing deleted, stamp written', async () => {
    full();

    const r = await reconcileMushafAssets();

    expect(r.action).toBe('adopt');
    expect(r.fontsDropped).toBe(false);
    expect(dropFonts).not.toHaveBeenCalled();
    expect(await readStamp()).toBe(GEN);
  });
});

describe('reconcileMushafAssets, on a bad day', () => {
  it('is idempotent — the second launch has nothing left to do', async () => {
    full();
    await reconcileMushafAssets();
    jest.clearAllMocks();
    sweepImages.mockResolvedValue(0);
    full();

    const r = await reconcileMushafAssets();

    expect(r.action).toBe('keep');
    expect(dropFonts).not.toHaveBeenCalled();
  });

  it('treats a blank stamp as no stamp, not as a mismatch', async () => {
    full();
    await seedStamp('   \n');

    const r = await reconcileMushafAssets();

    expect(r.fontsDropped).toBe(false);
    expect(await readStamp()).toBe(GEN);
  });

  it('still reconciles the fonts when sweeping the images throws', async () => {
    sweepImages.mockRejectedValue(new Error('disk busy'));
    full();
    await seedStamp('mushaf-fonts-v1');

    const r = await reconcileMushafAssets();

    expect(r.imageBytesFreed).toBe(0);
    expect(r.fontsDropped).toBe(true);
  });

  it('sweeps the images on a fresh install without touching the fonts', async () => {
    const r = await reconcileMushafAssets();

    expect(r.action).toBe('adopt');
    expect(sweepImages).toHaveBeenCalledTimes(1);
    expect(dropFonts).not.toHaveBeenCalled();
  });
});

/**
 * The twenty fonts cut short of their pages (2026-09-03) reached devices
 * under the right names. Nothing about them looks wrong from inside the
 * app, so the launch reconciliation — which exists for exactly "the files
 * on disk are not the files this build reads" — is what replaces them.
 */
describe('stale page fonts', () => {
  it('are re-fetched at launch, without dropping the store', async () => {
    storeStats.mockResolvedValue({
      pages: 604,
      stalePages: [564, 592],
      bytes: 1,
    });
    await seedStamp(GEN);
    await reconcileMushafAssets();
    expect(repair).toHaveBeenCalledWith([564, 592]);
    expect(dropFonts).not.toHaveBeenCalled();
  });

  it('and a store with none is left alone', async () => {
    full();
    await seedStamp(GEN);
    await reconcileMushafAssets();
    expect(repair).not.toHaveBeenCalled();
  });
});
