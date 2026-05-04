/**
 * Location presets storage round-trip — task #18.
 *
 * Coordinates are PII, so the entire `locationPresets[]` array lives in
 * the encrypted store (joined to existing manual lat/lng there). Verifies:
 *   • Saving a settings object with presets persists the array to the
 *     encrypted store, NEVER the plaintext one.
 *   • Loading round-trips the array back intact.
 *   • An invalid `activeLocationPresetId` is dropped on load (defensive
 *     against corrupted plaintext blobs).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');
import { loadSettings, saveSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const KEY = 'prayerapp.settings.v1';
const SECURE_KEY = 'prayerapp.location.v1';

const PRESETS = [
  {
    id: 'home',
    name: 'Home',
    latitude: 59.33,
    longitude: 18.07,
    label: 'Stockholm',
  },
  { id: 'work', name: 'Work', latitude: 59.35, longitude: 18.05 },
];

beforeEach(async () => {
  if ((AsyncStorage as { clear?: () => Promise<void> }).clear) {
    await AsyncStorage.clear();
  }
  EncryptedStorageMock.__reset();
});

describe('locationPresets storage', () => {
  test('saving presets persists to encrypted store, not plaintext', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, locationPresets: PRESETS });

    const plaintext = JSON.parse((await AsyncStorage.getItem(KEY))!);
    expect(plaintext).not.toHaveProperty('locationPresets');

    const secure = JSON.parse(EncryptedStorageMock.__peek()[SECURE_KEY]);
    expect(secure.locationPresets).toEqual(PRESETS);
  });

  test('loading round-trips the presets array intact', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      locationPresets: PRESETS,
      activeLocationPresetId: 'home',
    });
    const loaded = await loadSettings();
    expect(loaded.locationPresets).toEqual(PRESETS);
    expect(loaded.activeLocationPresetId).toBe('home');
  });

  test('default empty list when nothing is stored', async () => {
    const loaded = await loadSettings();
    expect(loaded.locationPresets).toEqual([]);
    expect(loaded.activeLocationPresetId).toBeUndefined();
  });

  test('drops activeLocationPresetId pointing at a deleted preset', async () => {
    // Pre-seed: encrypted store has 1 preset, plaintext claims a different id is active.
    EncryptedStorageMock.default.setItem(
      SECURE_KEY,
      JSON.stringify({ locationPresets: [PRESETS[0]] }),
    );
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        appearance: 'dark',
        activeLocationPresetId: 'gone',
      }),
    );

    const loaded = await loadSettings();
    expect(loaded.locationPresets).toEqual([PRESETS[0]]);
    expect(loaded.activeLocationPresetId).toBeUndefined();
    // Other settings still load correctly.
    expect(loaded.appearance).toBe('dark');
  });

  test('preserves activeLocationPresetId when it points at an existing preset', async () => {
    EncryptedStorageMock.default.setItem(
      SECURE_KEY,
      JSON.stringify({ locationPresets: PRESETS }),
    );
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ activeLocationPresetId: 'work' }),
    );

    const loaded = await loadSettings();
    expect(loaded.activeLocationPresetId).toBe('work');
  });
});
