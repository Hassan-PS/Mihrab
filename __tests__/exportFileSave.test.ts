/**
 * "Save to Files" — the two roads to the same place.
 *
 * saveExportToFiles takes an already-written export and lands it in the
 * Files app: on Android through the native create-document call, on Apple
 * platforms through react-native-share's `saveToFiles`. These lock in that
 * each platform takes its own road, passes the right things, and reads a
 * user cancel as "not saved" rather than an error.
 */
import { NativeModules, Platform } from 'react-native';
import RNShare from 'react-native-share';
import type { ExportResult } from '../src/sync/exportFile';

const result: ExportResult = {
  path: '/mock/cache/exports/mihrab-backup-2026-09-15.json',
  fileName: 'mihrab-backup-2026-09-15.json',
  bytes: 7,
  snapshot: {} as ExportResult['snapshot'],
  text: '{"a":1}',
};

function load(): typeof import('../src/sync/exportFile') {
  let mod!: typeof import('../src/sync/exportFile');
  jest.isolateModules(() => {
    mod = require('../src/sync/exportFile');
  });
  return mod;
}

const originalOS = Platform.OS;

afterEach(() => {
  Platform.OS = originalOS;
  (NativeModules as { SyncFolder?: unknown }).SyncFolder = undefined;
  jest.clearAllMocks();
});

describe('saveExportToFiles', () => {
  test('Android: writes through the native create-document call', async () => {
    Platform.OS = 'android';
    const saveFile = jest.fn().mockResolvedValue({ name: 'mihrab-backup-2026-09-15.json' });
    (NativeModules as { SyncFolder?: unknown }).SyncFolder = { saveFile };
    const { saveExportToFiles } = load();

    await expect(saveExportToFiles(result)).resolves.toBe(true);
    expect(saveFile).toHaveBeenCalledWith(
      'mihrab-backup-2026-09-15.json',
      '{"a":1}',
      'application/json',
    );
  });

  test('Android: a cancel (native resolves null) reports not saved', async () => {
    Platform.OS = 'android';
    const saveFile = jest.fn().mockResolvedValue(null);
    (NativeModules as { SyncFolder?: unknown }).SyncFolder = { saveFile };
    const { saveExportToFiles } = load();

    await expect(saveExportToFiles(result)).resolves.toBe(false);
  });

  test('Android: no native saver present resolves false, never throws', async () => {
    Platform.OS = 'android';
    (NativeModules as { SyncFolder?: unknown }).SyncFolder = undefined;
    const { saveExportToFiles } = load();

    await expect(saveExportToFiles(result)).resolves.toBe(false);
  });

  test('iOS: opens the Files save flow via share saveToFiles', async () => {
    Platform.OS = 'ios';
    const { saveExportToFiles } = load();

    await expect(saveExportToFiles(result)).resolves.toBe(true);
    expect(RNShare.open).toHaveBeenCalledWith(
      expect.objectContaining({
        saveToFiles: true,
        filename: 'mihrab-backup-2026-09-15.json',
        url: `file://${result.path}`,
      }),
    );
  });
});

describe('hasFileSaver', () => {
  test('always true off Android', () => {
    Platform.OS = 'ios';
    expect(load().hasFileSaver()).toBe(true);
  });

  test('Android: true only when the native saveFile is present', () => {
    Platform.OS = 'android';
    (NativeModules as { SyncFolder?: unknown }).SyncFolder = { saveFile: jest.fn() };
    expect(load().hasFileSaver()).toBe(true);

    (NativeModules as { SyncFolder?: unknown }).SyncFolder = {};
    expect(load().hasFileSaver()).toBe(false);
  });
});
