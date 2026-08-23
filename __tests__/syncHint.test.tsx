/**
 * The pointer on the Quran and Log screens: when it appears, and — the part
 * that matters — every way it goes away.
 *
 * A hint that outstays its welcome is worse than no hint. There are three
 * exits and the user only has to find one of them: set sync up, dismiss it,
 * or be on a build that cannot sync at all. Each is pinned here.
 */
const mockStore = new Map<string, string>();
let mockPeers: Array<{ pk: string }> = [];
let mockHasPicker = true;
let mockHasRandom = true;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockStore.delete(k);
    }),
  },
}));

jest.mock('../src/sync/peers', () => ({
  listPeers: async () => mockPeers,
}));

jest.mock('../src/sync/folderAccess', () => ({
  hasFolderPicker: () => mockHasPicker,
}));

jest.mock('../src/sync/secureRandom', () => ({
  hasSecureRandom: () => mockHasRandom,
}));

import {
  dismissSyncHint,
  resetSyncHints,
  shouldShowSyncHint,
} from '../src/screens/sync/SyncHint';
import {
  forgetCachedSyncSettings,
  updateSyncSettings,
} from '../src/sync/syncSettings';

const FOLDER = { handle: 'content://tree/1', label: 'Sync', kind: 'picked' as const };
const A_PEER = [{ pk: 'AAAA' }];

beforeEach(async () => {
  mockStore.clear();
  mockPeers = [];
  mockHasPicker = true;
  mockHasRandom = true;
  forgetCachedSyncSettings();
  await resetSyncHints();
});

describe('when it has something to say', () => {
  it('shows on both screens before anything is set up', async () => {
    expect(await shouldShowSyncHint('quran')).toBe(true);
    expect(await shouldShowSyncHint('log')).toBe(true);
  });

  it('still shows with a folder but no paired device', async () => {
    await updateSyncSettings({ folder: FOLDER });
    // Half a setup syncs nothing, so the hint is still telling the truth
    // and still has somewhere useful to send them.
    expect(await shouldShowSyncHint('quran')).toBe(true);
  });

  it('still shows with a paired device but no folder', async () => {
    mockPeers = A_PEER;
    expect(await shouldShowSyncHint('log')).toBe(true);
  });
});

describe('the three ways out', () => {
  it('goes away by itself once sync actually works', async () => {
    await updateSyncSettings({ folder: FOLDER });
    mockPeers = A_PEER;

    expect(await shouldShowSyncHint('quran')).toBe(false);
    expect(await shouldShowSyncHint('log')).toBe(false);
  });

  it('goes away when dismissed, and stays away', async () => {
    await dismissSyncHint('log');
    expect(await shouldShowSyncHint('log')).toBe(false);

    // A fresh read of storage, as a relaunch would do.
    forgetCachedSyncSettings();
    expect(await shouldShowSyncHint('log')).toBe(false);
  });

  it('dismisses one screen without silencing the other', async () => {
    await dismissSyncHint('log');
    // Someone who does not want it on the Log may still want it where they
    // read. Dismissal is per place, not a global "never mention sync".
    expect(await shouldShowSyncHint('quran')).toBe(true);
  });

  it('never appears on a build that cannot sync', async () => {
    mockHasPicker = false;
    expect(await shouldShowSyncHint('quran')).toBe(false);

    mockHasPicker = true;
    mockHasRandom = false;
    // No secure randomness means no identity, ever. Pointing someone at a
    // screen that cannot help them is worse than saying nothing.
    expect(await shouldShowSyncHint('log')).toBe(false);
  });
});

describe('dismissal storage', () => {
  it('accumulates rather than replacing', async () => {
    await dismissSyncHint('quran');
    await dismissSyncHint('log');
    expect(await shouldShowSyncHint('quran')).toBe(false);
    expect(await shouldShowSyncHint('log')).toBe(false);
  });

  it('is idempotent', async () => {
    await dismissSyncHint('log');
    await dismissSyncHint('log');
    expect(JSON.parse(mockStore.get('mihrab.syncHint.dismissed.v1') ?? '[]'))
      .toEqual(['log']);
  });

  it('treats a corrupt value as nothing dismissed', async () => {
    mockStore.set('mihrab.syncHint.dismissed.v1', 'not json');
    // Showing a hint once more is a smaller failure than a hint that can
    // never be dismissed again because the store is unreadable.
    expect(await shouldShowSyncHint('quran')).toBe(true);
  });
});
