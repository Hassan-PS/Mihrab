/**
 * Manage downloads has to list what is actually on the device.
 *
 * It did not. The mushaf row read the manifest of the page-IMAGE store at
 * quran/mushaf, but 2.8.0 moved the reader to rendered fonts at
 * quran/fonts/v2 — so a phone holding the complete mushaf, ~180 MB of it,
 * opened this screen and was told "Nothing downloaded yet". The bug was
 * invisible to every existing test because nothing rendered the screen
 * against a filesystem.
 *
 * These tests do exactly that: a fake store, the real screen, and an
 * assertion that the bytes on disk reach the UI. The legacy image store gets
 * its own case because leftovers from an upgrade are the other half of what
 * this screen is for — reclaiming space nothing will ever read again.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

/** path → byte size. Directories are implied by their children. */
const mockFiles = new Map<string, number>();

type Entry = { filename: string; path: string; size: number; type: string };

function mockChildrenOf(dir: string): Entry[] {
  const prefix = `${dir}/`;
  const seen = new Map<string, Entry>();
  for (const [path, size] of mockFiles) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      seen.set(rest, { filename: rest, path, size, type: 'file' });
    } else {
      const name = rest.slice(0, slash);
      if (!seen.has(name)) {
        seen.set(name, {
          filename: name,
          path: `${prefix}${name}`,
          size: 0,
          type: 'directory',
        });
      }
    }
  }
  return [...seen.values()];
}

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: { DocumentDir: '/mock/documents', CacheDir: '/mock/cache' },
      exists: async (path: string) =>
        mockFiles.has(path) || [...mockFiles.keys()].some(p => p.startsWith(`${path}/`)),
      stat: async (path: string) => {
        if (!mockFiles.has(path)) throw new Error('ENOENT');
        return { size: mockFiles.get(path), path };
      },
      lstat: async (dir: string) => mockChildrenOf(dir),
      ls: async (dir: string) => mockChildrenOf(dir).map(e => e.filename),
      unlink: async (path: string) => {
        for (const p of [...mockFiles.keys()]) {
          if (p === path || p.startsWith(`${path}/`)) mockFiles.delete(p);
        }
      },
      mkdir: async () => {},
    },
  },
}));

jest.mock('react-i18next', () => ({
  // The screen now reaches the download manager, which reaches the
  // notification, which imports src/i18n — and that calls `use()` at module
  // load. A mock without this passes `undefined` to i18next and the whole
  // suite fails to run before a single test starts.
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (_key: string, second?: unknown, third?: unknown) => {
      const isOpts = (v: unknown) => v != null && typeof v === 'object';
      const fallback = typeof second === 'string' ? second : '';
      const opts = (isOpts(second)
        ? second
        : isOpts(third)
          ? third
          : {}) as Record<string, unknown>;
      const template =
        typeof opts.defaultValue === 'string' ? opts.defaultValue : fallback;
      return template.replace(/{{(\w+)}}/g, (_m, name) =>
        opts[name] === undefined ? `{{${name}}}` : String(opts[name]),
      );
    },
  }),
}));

jest.mock('../src/hooks/useAppPalette', () => ({
  useAppPalette: () => ({
    palette: {
      accent: '#2E7D5B',
      text: '#111111',
      muted: '#777777',
      controlBg: '#EFEAE3',
      danger: '#B3261E',
      border: '#DDDDDD',
      card: '#FFFFFF',
      bg: '#FFFFFF',
      mode: 'light',
    },
  }),
}));

import { QuranDownloadsScreen } from '../src/screens/QuranDownloadsScreen';
import { MUSHAF_TOTAL_PAGES } from '../src/quran/mushafImages';

const FONT_BYTES = 300_000;

function text(tree: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const kids = (node as { children?: unknown } | null)?.children;
    if (kids !== undefined && kids !== null) walk(kids);
  };
  walk(tree.toJSON());
  return out.join(' ');
}

async function render(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<QuranDownloadsScreen />);
  });
  // One more flush: the inventory is gathered in an effect.
  await act(async () => {});
  return tree;
}

beforeEach(() => {
  mockFiles.clear();
});

test('a complete font store is listed, not reported as an empty device', async () => {
  for (let page = 1; page <= MUSHAF_TOTAL_PAGES; page++) {
    const name = `QCF2${String(page).padStart(3, '0')}.ttf`;
    mockFiles.set(`/mock/documents/quran/fonts/v2/${name}`, FONT_BYTES);
  }

  const body = text(await render());

  expect(body).toContain('Mushaf pages');
  expect(body).toContain(`${MUSHAF_TOTAL_PAGES} of ${MUSHAF_TOTAL_PAGES} pages`);
  expect(body).not.toContain('Nothing downloaded yet');
  // 604 × 300 KB ≈ 173 MB, and it has to reach the total line.
  expect(body).toMatch(/Total on device: 17\d MB/);
});

test('a partial store reports the pages it really holds', async () => {
  for (let page = 1; page <= 12; page++) {
    const name = `QCF2${String(page).padStart(3, '0')}.ttf`;
    mockFiles.set(`/mock/documents/quran/fonts/v2/${name}`, FONT_BYTES);
  }

  const body = text(await render());

  expect(body).toContain(`12 of ${MUSHAF_TOTAL_PAGES} pages`);
});

test('the retired image store is listed on its own so it can be reclaimed', async () => {
  mockFiles.set('/mock/documents/quran/mushaf/v1/manifest.json', 4_096);
  mockFiles.set('/mock/documents/quran/mushaf/v1/001.png', 2_000_000);
  mockFiles.set('/mock/documents/quran/mushaf/render/001@2x.png', 3_000_000);

  const body = text(await render());

  expect(body).toContain('Older mushaf pages');
  expect(body).not.toContain('Nothing downloaded yet');
  // The whole tree, render cache included — not just the versioned pages.
  expect(body).toMatch(/Total on device: 4\.8 MB/);
});

test('an empty device still says so', async () => {
  const body = text(await render());

  expect(body).toContain('Nothing downloaded yet');
  expect(body).toContain('Total on device: 0 MB');
});
