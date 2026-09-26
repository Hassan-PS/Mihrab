/**
 * The tajwīd switch starts the download — and what a bulk font download
 * skips.
 *
 * Two things the plain muṣḥaf's first download already does that the
 * colours did not: start on the person's say-so without a second tap, and
 * not walk the disk one page at a time to find out that most of the book
 * is already there.
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  _resetFontStoreForTests,
  downloadAllPageFonts,
  expectedFontBytes,
  fontFilePath,
} from '../src/quran/mushafFontStore';
import { MUSHAF_TOTAL_PAGES } from '../src/quran/mushafImages';
import { tajweedSetsToFetch } from '../src/quran/tajweedAutoDownload';

// The mock exports the map beside `default` — see jest.setup.js.
const files: Map<string, string> = require('react-native-blob-util').__files;

function putFont(page: number, set: 'v2' | 'tajweed-light' | 'tajweed-dark', bytes = expectedFontBytes(page, set)) {
  files.set(fontFilePath(page, set), 'x'.repeat(bytes));
}

beforeEach(() => {
  files.clear();
  _resetFontStoreForTests();
});

describe('what the switch asks for', () => {
  it('asks for the palette in use, and only that on a fixed tone', async () => {
    for (let p = 1; p <= MUSHAF_TOTAL_PAGES; p++) putFont(p, 'v2');
    await expect(
      tajweedSetsToFetch({
        hafs: true,
        inUse: 'tajweed-light',
        toneAuto: false,
        plainMushafOnDevice: true,
      }),
    ).resolves.toEqual(['tajweed-light']);
  });

  it('asks for both on the auto tone, the one in use first', async () => {
    await expect(
      tajweedSetsToFetch({
        hafs: true,
        inUse: 'tajweed-dark',
        toneAuto: true,
        plainMushafOnDevice: true,
      }),
    ).resolves.toEqual(['tajweed-dark', 'tajweed-light']);
  });

  it('skips a palette that is already complete on disk', async () => {
    for (let p = 1; p <= MUSHAF_TOTAL_PAGES; p++) putFont(p, 'tajweed-light');
    await expect(
      tajweedSetsToFetch({
        hafs: true,
        inUse: 'tajweed-light',
        toneAuto: true,
        plainMushafOnDevice: true,
      }),
    ).resolves.toEqual(['tajweed-dark']);
  });

  it('does nothing on Warsh, where the colours are not drawn', async () => {
    await expect(
      tajweedSetsToFetch({
        hafs: false,
        inUse: 'tajweed-light',
        toneAuto: true,
        plainMushafOnDevice: true,
      }),
    ).resolves.toEqual([]);
  });

  it('does nothing before the plain mushaf is on the device — the book comes first', async () => {
    await expect(
      tajweedSetsToFetch({
        hafs: true,
        inUse: 'tajweed-light',
        toneAuto: false,
        plainMushafOnDevice: false,
      }),
    ).resolves.toEqual([]);
  });
});

describe('what a bulk download skips', () => {
  it('starts the count at what is on disk and fetches only the rest', async () => {
    // Half the light palette is already there, plus one stale page.
    for (let p = 1; p <= 302; p++) putFont(p, 'tajweed-light');
    putFont(303, 'tajweed-light', expectedFontBytes(303, 'tajweed-light') + 1);
    const seen: Array<{ done: number; total: number }> = [];
    const fetched: number[] = [];
    // The transport is not under test: the fallback that the retry loop
    // ends on is what would run, so intercept the page it is asked for.
    const config = jest.spyOn(ReactNativeBlobUtil, 'config').mockImplementation(
      () =>
        ({
          fetch: async (_m: string, url: string) => {
            const page = Number(url.match(/QCF4T(\d{3})L/)?.[1]);
            fetched.push(page);
            files.set(`${fontFilePath(page, 'tajweed-light')}.part`, 'x'.repeat(expectedFontBytes(page, 'tajweed-light')));
            return { info: () => ({ status: 200 }) };
          },
        }) as never,
    );
    // The fake bytes fail the glyph check that follows the fetch; that is
    // after the point under test, and the warning it logs is noise here.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = downloadAllPageFonts({
      set: 'tajweed-light',
      concurrency: 1,
      onProgress: p => seen.push({ done: p.done, total: p.total }),
    });
    // Enough to see where it starts; the rest is 300 fetches we do not need.
    await new Promise(r => setTimeout(r, 50));
    handle.cancel();
    await handle.promise;
    config.mockRestore();
    warn.mockRestore();
    expect(seen[0]).toEqual({ done: 302, total: MUSHAF_TOTAL_PAGES });
    expect(fetched[0]).toBe(303);
    expect(fetched).not.toContain(1);
    expect(fetched).not.toContain(302);
  });

  it('is complete at once, with no fetch, when every page is there', async () => {
    for (let p = 1; p <= MUSHAF_TOTAL_PAGES; p++) putFont(p, 'tajweed-dark');
    const config = jest.spyOn(ReactNativeBlobUtil, 'config');
    const outcome = await downloadAllPageFonts({ set: 'tajweed-dark' }).promise;
    expect(outcome).toEqual({ complete: true, interrupted: false });
    expect(config).not.toHaveBeenCalled();
    config.mockRestore();
  });
});
