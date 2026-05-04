/**
 * Encrypted-storage migration + invariants — task #16.
 *
 * Verifies the privacy guarantee: coordinates and the manual-location label
 * NEVER land in plaintext AsyncStorage. They flow exclusively through the
 * encrypted-storage abstraction wrapping iOS Keychain / Android
 * EncryptedSharedPreferences.
 *
 * If these tests fail, someone has accidentally broken the split — either
 * by extending `saveSettings` to write to AsyncStorage directly, or by
 * adding a new sensitive field without registering it in
 * `secureStorage.SECURE_FIELD_NAMES`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');
import { loadSettings, saveSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import { SECURE_FIELD_NAMES } from '../src/settings/secureStorage';

const KEY = 'prayerapp.settings.v1';
const SECURE_KEY = 'prayerapp.location.v1';

beforeEach(async () => {
  // Mock from jest.setup.js exposes a clear() method.
  if ((AsyncStorage as { clear?: () => Promise<void> }).clear) {
    await AsyncStorage.clear();
  }
  EncryptedStorageMock.__reset();
});

describe('saveSettings split: sensitive fields go to encrypted store only', () => {
  test('plaintext AsyncStorage blob never contains coordinate fields after a save', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      manualLatitude: 59.33,
      manualLongitude: 18.07,
      manualLocationLabel: 'Stockholm, Sweden',
      lastFetchedLatitude: 59.34,
      lastFetchedLongitude: 18.06,
    });

    const plaintextRaw = await AsyncStorage.getItem(KEY);
    expect(plaintextRaw).not.toBeNull();
    const plaintext = JSON.parse(plaintextRaw!);

    for (const field of SECURE_FIELD_NAMES) {
      expect(plaintext).not.toHaveProperty(field);
    }
  });

  test('encrypted store carries every sensitive field after a save', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      manualLatitude: 59.33,
      manualLongitude: 18.07,
      manualLocationLabel: 'Stockholm',
      lastFetchedLatitude: 59.34,
      lastFetchedLongitude: 18.06,
    });

    const secureRaw = EncryptedStorageMock.__peek()[SECURE_KEY];
    expect(secureRaw).toBeDefined();
    const secure = JSON.parse(secureRaw);
    expect(secure.manualLatitude).toBeCloseTo(59.33);
    expect(secure.manualLongitude).toBeCloseTo(18.07);
    expect(secure.manualLocationLabel).toBe('Stockholm');
    expect(secure.lastFetchedLatitude).toBeCloseTo(59.34);
    expect(secure.lastFetchedLongitude).toBeCloseTo(18.06);
  });

  test('round-trip: save then load preserves all sensitive fields', async () => {
    const original = {
      ...DEFAULT_SETTINGS,
      manualLatitude: 59.33,
      manualLongitude: 18.07,
      manualLocationLabel: 'Stockholm',
      lastFetchedLatitude: 59.34,
      lastFetchedLongitude: 18.06,
    };
    await saveSettings(original);
    const loaded = await loadSettings();

    expect(loaded.manualLatitude).toBeCloseTo(59.33);
    expect(loaded.manualLongitude).toBeCloseTo(18.07);
    expect(loaded.manualLocationLabel).toBe('Stockholm');
    expect(loaded.lastFetchedLatitude).toBeCloseTo(59.34);
    expect(loaded.lastFetchedLongitude).toBeCloseTo(18.06);
  });
});

describe('migration from pre-task-#16 plaintext-only install', () => {
  test('coordinates in legacy plaintext blob are migrated to encrypted store', async () => {
    // Simulate an existing user pre-migration: plaintext blob contains
    // coordinates, encrypted store is empty.
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        appearance: 'dark',
        language: 'sv',
        manualLatitude: 59.33,
        manualLongitude: 18.07,
        manualLocationLabel: 'Stockholm',
        lastFetchedLatitude: 59.34,
        lastFetchedLongitude: 18.06,
      }),
    );
    expect(EncryptedStorageMock.__peek()[SECURE_KEY]).toBeUndefined();

    const loaded = await loadSettings();

    // Loaded settings reflect both stores merged.
    expect(loaded.manualLatitude).toBeCloseTo(59.33);
    expect(loaded.manualLocationLabel).toBe('Stockholm');
    expect(loaded.appearance).toBe('dark');
    expect(loaded.language).toBe('sv');

    // Encrypted store now contains the coordinates.
    const secureRaw = EncryptedStorageMock.__peek()[SECURE_KEY];
    expect(secureRaw).toBeDefined();
    expect(JSON.parse(secureRaw).manualLatitude).toBeCloseTo(59.33);

    // Plaintext blob has been STRIPPED of coordinates.
    const plaintextRaw = await AsyncStorage.getItem(KEY);
    const plaintext = JSON.parse(plaintextRaw!);
    for (const field of SECURE_FIELD_NAMES) {
      expect(plaintext).not.toHaveProperty(field);
    }
    expect(plaintext.appearance).toBe('dark');
    expect(plaintext.language).toBe('sv');
  });

  test('migration is idempotent — running it again does nothing', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        appearance: 'dark',
        manualLatitude: 59.33,
        manualLongitude: 18.07,
      }),
    );
    await loadSettings(); // first migration
    const plaintextAfterFirst = await AsyncStorage.getItem(KEY);
    const secureAfterFirst = EncryptedStorageMock.__peek()[SECURE_KEY];

    await loadSettings(); // second call: nothing to migrate
    const plaintextAfterSecond = await AsyncStorage.getItem(KEY);
    const secureAfterSecond = EncryptedStorageMock.__peek()[SECURE_KEY];

    expect(plaintextAfterSecond).toBe(plaintextAfterFirst);
    expect(secureAfterSecond).toBe(secureAfterFirst);
  });

  test('post-migration write path: existing user updates settings, plaintext stays clean', async () => {
    // Pre-seed a partially-migrated state.
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        appearance: 'dark',
        language: 'sv',
        manualLatitude: 59.33,
        manualLongitude: 18.07,
      }),
    );
    const loaded = await loadSettings();

    // User changes a setting (theme) — saveSettings is called with the full
    // merged object including the freshly-migrated coords.
    await saveSettings({ ...loaded, appearance: 'light' });

    const plaintextRaw = await AsyncStorage.getItem(KEY);
    const plaintext = JSON.parse(plaintextRaw!);
    expect(plaintext.appearance).toBe('light');
    for (const field of SECURE_FIELD_NAMES) {
      expect(plaintext).not.toHaveProperty(field);
    }
    // Coordinates still safely encrypted.
    const secure = JSON.parse(EncryptedStorageMock.__peek()[SECURE_KEY]);
    expect(secure.manualLatitude).toBeCloseTo(59.33);
  });
});

describe('graceful fallback when encrypted storage is empty / first launch', () => {
  test('first-ever launch returns DEFAULT_SETTINGS', async () => {
    const loaded = await loadSettings();
    expect(loaded.appearance).toBe(DEFAULT_SETTINGS.appearance);
    expect(loaded.language).toBe(DEFAULT_SETTINGS.language);
    expect(loaded.manualLatitude).toBe(DEFAULT_SETTINGS.manualLatitude);
  });

  test('post-migration empty plaintext + populated encrypted reads from encrypted', async () => {
    EncryptedStorageMock.default.setItem(
      SECURE_KEY,
      JSON.stringify({
        manualLatitude: 35.0,
        manualLongitude: 51.0,
        manualLocationLabel: 'Tehran',
      }),
    );
    const loaded = await loadSettings();
    expect(loaded.manualLatitude).toBeCloseTo(35.0);
    expect(loaded.manualLocationLabel).toBe('Tehran');
  });
});
