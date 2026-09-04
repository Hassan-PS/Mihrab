/**
 * The clock-format setting, from stored blob to what the widget reads.
 *
 * Two things worth pinning. Installs that predate issue #18 have no
 * `clockFormat` at all, and they must land on 'auto' rather than on
 * whatever `undefined` coerces to downstream. And the non-React mirror
 * in `activeClock` — the one the widget and Live Activity payloads read,
 * because they are built by plain functions that cannot call a hook —
 * has to answer the same question the same way the screens do.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EncryptedStorageMock = require('react-native-encrypted-storage');
import { loadSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import {
  _resetActiveClock,
  activeClock,
  getActiveClockFormat,
  setActiveClockFormat,
} from '../src/utils/activeClock';
import { _setSystemIs24HourForTests } from '../src/native/SystemClock';

const KEY = 'prayerapp.settings.v1';

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'android',
  select: (obj: Record<string, unknown>) => obj.android ?? obj.default,
}));

jest.mock('react-native', () => ({
  NativeModules: { I18nManager: { localeIdentifier: 'en_GB' } },
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}));

beforeEach(async () => {
  if ((AsyncStorage as { clear?: () => Promise<void> }).clear) {
    await AsyncStorage.clear();
  }
  EncryptedStorageMock.__reset();
  _resetActiveClock();
  _setSystemIs24HourForTests(null);
});

async function storedAs(blob: Record<string, unknown>) {
  await AsyncStorage.setItem(KEY, JSON.stringify(blob));
  return loadSettings();
}

describe('the stored setting', () => {
  it('defaults to auto', () => {
    expect(DEFAULT_SETTINGS.clockFormat).toBe('auto');
  });

  it('lands on auto for an install written before the setting existed', async () => {
    const s = await storedAs({ language: 'en', languagePicked: true });
    expect(s.clockFormat).toBe('auto');
  });

  it('keeps an explicit choice', async () => {
    expect((await storedAs({ clockFormat: '12' })).clockFormat).toBe('12');
    expect((await storedAs({ clockFormat: '24' })).clockFormat).toBe('24');
  });

  it('refuses anything that is not one of the three', async () => {
    expect((await storedAs({ clockFormat: '12h' })).clockFormat).toBe('auto');
    expect((await storedAs({ clockFormat: 12 })).clockFormat).toBe('auto');
    expect((await storedAs({ clockFormat: null })).clockFormat).toBe('auto');
  });
});

describe('the non-React mirror', () => {
  it('starts on auto and follows what it is told', () => {
    expect(getActiveClockFormat()).toBe('auto');
    setActiveClockFormat('12');
    expect(getActiveClockFormat()).toBe('12');
    expect(activeClock()('17:31')).toBe('5:31 PM');
    setActiveClockFormat('24');
    expect(activeClock()('17:31')).toBe('17:31');
  });

  it('follows the device on auto', () => {
    setActiveClockFormat('auto');
    _setSystemIs24HourForTests(false);
    expect(activeClock().hour12).toBe(true);
    _setSystemIs24HourForTests(true);
    expect(activeClock().hour12).toBe(false);
  });

  /**
   * The memo has three inputs and re-reads all three; a formatter cached
   * against a stale device answer is how a widget ends up disagreeing
   * with the screen that pushed it.
   */
  it('hands back the same formatter until an input actually moves', () => {
    setActiveClockFormat('12');
    const first = activeClock();
    expect(activeClock()).toBe(first);
    setActiveClockFormat('24');
    expect(activeClock()).not.toBe(first);
  });
});
