/**
 * Which language the app opens in.
 *
 * The rule has two halves and the interesting one is the second:
 *
 *   • Nobody has chosen → follow the phone, every launch. Someone who
 *     switches their device to Arabic should not have to find the picker.
 *   • Somebody has chosen → their choice, forever. A phone that changes
 *     language must not move an app that was told what to speak.
 *
 * The migration is what makes this safe on an install that predates the
 * flag. Before it, the picker and the default wrote the same field, so a
 * stored 'en' could mean either "I chose English" or "nobody ever asked" —
 * and every install that never touched the picker had exactly that. Any
 * OTHER stored language can only have come from the picker, so it counts
 * as chosen. That is the difference between fixing an Arabic phone stuck
 * in English and throwing away the French someone picked on purpose.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');
import { loadSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';

const KEY = 'prayerapp.settings.v1';

/** The device says Swedish. Read through NativeModules by deviceLanguage.ts. */
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'android',
  select: (obj: Record<string, unknown>) => obj.android ?? obj.default,
}));

jest.mock('react-native', () => ({
  NativeModules: { I18nManager: { localeIdentifier: 'sv_SE' } },
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
}));

beforeEach(async () => {
  if ((AsyncStorage as { clear?: () => Promise<void> }).clear) {
    await AsyncStorage.clear();
  }
  EncryptedStorageMock.__reset();
});

async function storedAs(blob: Record<string, unknown>) {
  await AsyncStorage.setItem(KEY, JSON.stringify(blob));
  return loadSettings();
}

/** A blob as an install from before the flag would have written it. */
function legacy(language: string) {
  const rest: Record<string, unknown> = { ...DEFAULT_SETTINGS, language };
  delete rest.languagePicked;
  return rest;
}

describe('the language an install opens in', () => {
  test('a first run follows the device', async () => {
    const settings = await loadSettings();
    expect(settings.language).toBe('sv');
    expect(settings.languagePicked).toBe(false);
  });

  test('an install that never chose keeps following the device', async () => {
    // The pre-flag shape: English stored because English was the default.
    const settings = await storedAs(legacy('en'));
    expect(settings.language).toBe('sv');
    expect(settings.languagePicked).toBe(false);
  });

  test('a language from the old picker is treated as chosen', async () => {
    // Before the flag, 'fr' could only have been picked by hand.
    const settings = await storedAs(legacy('fr'));
    expect(settings.language).toBe('fr');
    expect(settings.languagePicked).toBe(true);
  });

  test('an explicit choice survives, even when it matches the old default', async () => {
    const settings = await storedAs({
      ...DEFAULT_SETTINGS,
      language: 'en',
      languagePicked: true,
    });
    expect(settings.language).toBe('en');
  });

  test('a corrupt blob still opens in the device language', async () => {
    await AsyncStorage.setItem(KEY, 'not json');
    expect((await loadSettings()).language).toBe('sv');
  });
});
