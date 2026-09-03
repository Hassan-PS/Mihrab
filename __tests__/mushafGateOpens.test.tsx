/**
 * The muṣḥaf opens without asking the disk six hundred questions.
 *
 * `fontStoreStats` used to `ls` the font directory and then `stat` every
 * file in it, one bridge round-trip at a time, serially — and the reader's
 * gate ran it on every open before it would draw a page. One `lstat` on
 * the directory answers for all of them, and a store seen complete once
 * in a session is complete for the rest of it.
 */
const mockFs = {
  calls: [] as string[],
  entries: [] as Array<{ filename: string; size: number; type: string }>,
};

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: { DocumentDir: '/doc' },
      exists: async () => {
        mockFs.calls.push('exists');
        return true;
      },
      lstat: async () => {
        mockFs.calls.push('lstat');
        return mockFs.entries;
      },
      ls: async () => {
        mockFs.calls.push('ls');
        return mockFs.entries.map(e => e.filename);
      },
      stat: async (p: string) => {
        mockFs.calls.push('stat');
        const e = mockFs.entries.find(x => p.endsWith(x.filename));
        return { size: e?.size ?? 0 };
      },
      unlink: async () => {
        mockFs.calls.push('unlink');
      },
      mkdir: async () => {},
    },
    config: () => ({ fetch: async () => ({ info: () => ({ status: 500 }) }) }),
  },
}));

jest.mock('../src/native/MushafFont', () => ({
  mushafFontAvailable: true,
  isValidFontFile: async () => true,
  loadedPageFont: () => null,
  acquirePageFont: async () => null,
  pinPageFont: () => {},
  unpinPageFont: () => {},
}));

import {
  deletePageFonts,
  fontStoreKnownComplete,
  fontStoreStats,
} from '../src/quran/mushafFontStore';

const fonts = (n: number, size = 300_000) =>
  Array.from({ length: n }, (_, i) => ({
    filename: `QCF2${String(i + 1).padStart(3, '0')}.ttf`,
    size,
    type: 'file',
  }));

beforeEach(async () => {
  mockFs.calls.length = 0;
  await deletePageFonts();
  mockFs.calls.length = 0;
});

describe('fontStoreStats', () => {
  it('asks the disk twice, whatever the store holds', async () => {
    mockFs.entries = fonts(604);
    const stats = await fontStoreStats();
    expect(stats.pages).toBe(604);
    expect(mockFs.calls).toEqual(['exists', 'lstat']);
  });

  it('counts a truncated file as absent', async () => {
    mockFs.entries = [...fonts(603), { filename: 'QCF2604.ttf', size: 12, type: 'file' }];
    expect((await fontStoreStats()).pages).toBe(603);
  });

  it('ignores what is not a font', async () => {
    mockFs.entries = [
      ...fonts(2),
      { filename: 'stamp.json', size: 40, type: 'file' },
      { filename: 'tmp', size: 0, type: 'directory' },
    ];
    expect((await fontStoreStats()).pages).toBe(2);
  });
});

describe('the session verdict', () => {
  it('is unknown until a listing has found every page', async () => {
    mockFs.entries = fonts(603);
    await fontStoreStats();
    expect(fontStoreKnownComplete()).toBe(false);
  });

  it('is set by a complete listing, so the next open waits on nothing', async () => {
    mockFs.entries = fonts(604);
    await fontStoreStats();
    expect(fontStoreKnownComplete()).toBe(true);
  });

  it('is cleared when the fonts are deleted', async () => {
    mockFs.entries = fonts(604);
    await fontStoreStats();
    await deletePageFonts();
    expect(fontStoreKnownComplete()).toBe(false);
  });
});
