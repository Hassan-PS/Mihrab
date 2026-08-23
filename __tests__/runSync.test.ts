/**
 * When a round runs, when it refuses, and what it writes down afterwards.
 *
 * The algorithm has its own test with two whole devices in it. This is the
 * layer above: the decisions about whether to run at all, which are the ones
 * a user actually meets — no folder chosen, a folder that has gone away, a
 * build with no folder module in it.
 */
const mockStore = new Map<string, string>();
let mockHasPicker = true;
let mockReachable = true;
let mockDefaultFolder: unknown = null;
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

jest.mock('../src/sync/folderAccess', () => ({
  hasFolderPicker: () => mockHasPicker,
  folderStillReachable: async () => mockReachable,
  // Android has no default folder; iOS hands back its own. Null here is the
  // Android case, which is what "no folder chosen" has to keep meaning.
  defaultSyncFolder: async () => mockDefaultFolder,
  folderAt: () => {
    throw new Error('folderAt should not be reached when a folder is injected');
  },
}));

jest.mock('../src/sync/secureRandom', () => ({
  hasSecureRandom: () => mockHasRandom,
}));

const mockSync = jest.fn();
jest.mock('../src/sync/folderSync', () => ({
  syncWithFolder: (...args: unknown[]) => mockSync(...args),
}));

import { runSyncNow } from '../src/sync/runSync';
import {
  forgetCachedSyncSettings,
  getSyncSettings,
  updateSyncSettings,
} from '../src/sync/syncSettings';

const FOLDER = {
  list: async () => [],
  read: async () => '',
  write: async () => undefined,
};

const OUTCOME = {
  wrote: 'mihrab-AAAAAAAAAAAA.sync.json',
  read: 1,
  learned: 0,
  merged: null,
  skipped: { notOurs: 0, notForUs: 0, unreadable: 0 },
};

beforeEach(() => {
  mockStore.clear();
  mockHasPicker = true;
  mockReachable = true;
  mockDefaultFolder = null;
  mockHasRandom = true;
  mockSync.mockReset();
  mockSync.mockResolvedValue(OUTCOME);
  forgetCachedSyncSettings();
});

describe('refusing, with the reason named', () => {
  it('says so when the device has no secure randomness', async () => {
    mockHasRandom = false;
    expect(await runSyncNow()).toEqual({ ok: false, reason: 'no-identity' });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('says so when this build has no folder module', async () => {
    mockHasPicker = false;
    expect(await runSyncNow()).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('says so when no folder has been chosen', async () => {
    expect(await runSyncNow()).toEqual({ ok: false, reason: 'no-folder' });
  });

  it('says so when the folder has gone away, and remembers that', async () => {
    await updateSyncSettings({
      folder: { handle: 'content://tree/1', label: 'Sync', kind: 'picked' as const },
    });
    mockReachable = false;

    expect(await runSyncNow()).toEqual({ ok: false, reason: 'folder-gone' });
    // The screen reads this on next open rather than discovering it again.
    expect((await getSyncSettings()).lastError).toBe('folder-gone');
  });

  it('reports what went wrong when the round itself throws', async () => {
    mockSync.mockRejectedValue(new Error('provider said no'));
    const result = await runSyncNow({ folder: FOLDER });

    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect((await getSyncSettings()).lastError).toBe('provider said no');
  });
});

describe('running', () => {
  it('passes the chosen categories through, not everything', async () => {
    await updateSyncSettings({
      selection: {
        prayers: true,
        fasting: true,
        dhikr: true,
        sunnah: true,
        quran: true,
        settings: false,
        location: false,
      },
    });
    await runSyncNow({ folder: FOLDER, now: new Date('2026-08-23T12:00:00Z') });

    const passed = mockSync.mock.calls[0][1];
    expect(passed.selection.prayers).toBe(true);
    // The two the default deliberately leaves off — a tablet's adhan volume
    // and a set of coordinates are about a device, not about a person.
    expect(passed.selection.settings).toBe(false);
    expect(passed.selection.location).toBe(false);
  });

  it('records when it last ran and clears the previous error', async () => {
    await updateSyncSettings({ lastError: 'folder-gone' });
    const at = new Date('2026-08-23T12:00:00.000Z');

    const result = await runSyncNow({ folder: FOLDER, now: at });
    expect(result).toMatchObject({ ok: true, at: '2026-08-23T12:00:00.000Z' });

    const settings = await getSyncSettings();
    expect(settings.lastSyncAt).toBe('2026-08-23T12:00:00.000Z');
    expect(settings.lastError).toBeNull();
  });

  it('counts a round that found nothing as a success', async () => {
    mockSync.mockResolvedValue({ ...OUTCOME, read: 0, wrote: null });
    const result = await runSyncNow({ folder: FOLDER });
    // "Last checked" is what the user wants to see. A quiet round is not a
    // failure, and telling them it was would train them to ignore the word.
    expect(result.ok).toBe(true);
    expect((await getSyncSettings()).lastSyncAt).not.toBeNull();
  });
});

describe('the stored settings', () => {
  it('defaults to the record and not to the device', async () => {
    const { selection, autoFrequency, folder } = await getSyncSettings();
    expect(selection).toEqual({
      prayers: true,
      fasting: true,
      dhikr: true,
      sunnah: true,
      quran: true,
      settings: false,
      location: false,
    });
    expect(autoFrequency).toBe('open');
    expect(folder).toBeNull();
  });

  it('gives a category added in a later version its default, not false', async () => {
    // Someone who turned sync on before `quran` existed has a stored
    // selection with no opinion about it. Treating silence as "off" would
    // leave it off forever, silently, for exactly the people who use sync.
    mockStore.set(
      'prayerapp.sync.settings.v1',
      JSON.stringify({ selection: { prayers: true, settings: true } }),
    );
    const { selection } = await getSyncSettings();
    expect(selection.quran).toBe(true);
    expect(selection.settings).toBe(true);
    expect(selection.location).toBe(false);
  });

  it('survives a corrupt blob', async () => {
    mockStore.set('prayerapp.sync.settings.v1', 'not json');
    const settings = await getSyncSettings();
    expect(settings.folder).toBeNull();
    expect(settings.selection.prayers).toBe(true);
  });

  it('ignores a stored folder with no handle', async () => {
    mockStore.set(
      'prayerapp.sync.settings.v1',
      JSON.stringify({ folder: { label: 'Somewhere' } }),
    );
    expect((await getSyncSettings()).folder).toBeNull();
  });
});
