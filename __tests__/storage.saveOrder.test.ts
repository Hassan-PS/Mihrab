/**
 * Settings-write serialization.
 *
 * `updateSettings` fires `saveSettings(next)` on every change. Each save is two
 * async writes (encrypted + plaintext). Two rapid changes — e.g. removing a
 * saved location and then picking a new place — must not land out of order and
 * leave the OLDER snapshot on disk (the user would see their location change
 * "not take" and have to redo it). saveSettings now chains writes through one
 * queue so the most recent state always wins.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');
import { saveSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const KEY = 'prayerapp.settings.v1';

beforeEach(async () => {
  if ((AsyncStorage as { clear?: () => Promise<void> }).clear) {
    await AsyncStorage.clear();
  }
  EncryptedStorageMock.__reset();
});

afterEach(() => {
  EncryptedStorageMock.default.setItem.mockReset();
  EncryptedStorageMock.default.setItem.mockImplementation(async () => {});
});

it('persists the most recent save when two are fired back-to-back', async () => {
  // Make the FIRST secure write slow. Without serialization the second save's
  // plaintext write would land first and the slow first save would overwrite
  // it — persisting the stale (first) snapshot. With the queue, the second
  // save waits and wins.
  let calls = 0;
  EncryptedStorageMock.default.setItem.mockImplementation(async () => {
    calls += 1;
    if (calls === 1) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  });

  const first = { ...DEFAULT_SETTINGS, appAccentId: 'first' };
  const second = { ...DEFAULT_SETTINGS, appAccentId: 'second' };

  const p1 = saveSettings(first);
  const p2 = saveSettings(second);
  await Promise.all([p1, p2]);

  const raw = await AsyncStorage.getItem(KEY);
  expect(raw).toBeTruthy();
  expect(JSON.parse(raw as string).appAccentId).toBe('second');
});
