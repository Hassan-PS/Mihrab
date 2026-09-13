/**
 * What a cold start reads from disk, and how many times.
 *
 * Profiled on the device clock, a cold start asked for the settings six
 * times inside 35 ms, parsed the ~170 KB prayer cache once per day it
 * wanted — twenty-three times in a row for the widget's window — and read
 * the Swedish dataset's city file seven times at once because all seven
 * callers found the memo empty in the same instant. None of it was
 * wrong; all of it was the same bytes, again. These pin the "once".
 *
 * The rule under each: concurrent callers share a read, and a write
 * always comes before the next read. Nothing is cached across time —
 * that is the line between "read once" and "served stale", and every
 * test in the second half is about staying on the right side of it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, saveSettings } from '../src/settings/storage';
import { DEFAULT_SETTINGS } from '../src/settings/types';
import {
  getCachedPrayerTimes,
  getCachedPrayerTimesMany,
  saveStoredPrayerData,
} from '../src/prayer/prayerStorage';
import { cachedDaysFrom, cachedDaysBefore } from '../src/prayer/widgetDayWindow';
import { addDays } from '../src/utils/prayerTimes';
import { formatLocalDate } from '../src/utils/date';
import type { TimingsMap } from '../src/types/prayer';

const SETTINGS_KEY = 'prayerapp.settings.v1';
const getItem = AsyncStorage.getItem as jest.Mock;

const DAY = {
  Fajr: '04:00',
  Sunrise: '05:30',
  Dhuhr: '12:30',
  Asr: '16:00',
  Sunset: '19:30',
  Maghrib: '19:30',
  Isha: '21:00',
  Imsak: '03:50',
  Midnight: '00:30',
  Firstthird: '22:30',
  Lastthird: '02:30',
};

const PARAMS = {
  provider: 'aladhan' as const,
  latitude: 59.33,
  longitude: 18.07,
  calculationMethod: 3,
  school: 0 as const,
};

/** Write `days` consecutive days from `from`, all `DAY`, in one blob. */
async function storeRun(from: Date, days: number): Promise<void> {
  const months: Record<string, Record<string, TimingsMap>> = {};
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (months[m] ??= {})[formatLocalDate(d)] = DAY;
  }
  await saveStoredPrayerData({ ...PARAMS, months });
}

/** Add one more day to what is stored, keeping the rest. */
async function storeOneMore(date: Date): Promise<void> {
  const m = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const existing = await getCachedPrayerTimesMany(PARAMS, [date]);
  expect(existing[0]).toBeNull();
  // saveStoredPrayerData replaces the entry wholesale, so re-read the
  // months it holds first via the blob's own shape.
  const raw = await AsyncStorage.getItem('prayer_times_cache.v2');
  const v2 = JSON.parse(raw ?? '{"caches":{}}');
  const key = Object.keys(v2.caches)[0];
  const months = v2.caches[key].months;
  (months[m] ??= {})[formatLocalDate(date)] = DAY;
  await saveStoredPrayerData({ ...PARAMS, months });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  getItem.mockClear();
});

describe('the settings', () => {
  it('are read once for everyone who asks at the same time', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    getItem.mockClear();
    // Six, because that is how many asked inside the first 35 ms of a
    // measured cold start: the provider, the widget, the Live Activity,
    // the queue drain, and two more.
    const all = await Promise.all(
      Array.from({ length: 6 }, () => loadSettings()),
    );
    const settingsReads = getItem.mock.calls.filter(c => c[0] === SETTINGS_KEY);
    expect(settingsReads).toHaveLength(1);
    // And everyone got the same answer.
    for (const s of all) expect(s).toEqual(all[0]);
  });

  it('read again once the first read has settled', async () => {
    // Shared while in flight, not remembered afterwards. A caller who asks
    // after the read is done gets a fresh one — otherwise a change on
    // disk made by anything but `saveSettings` would never be seen.
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    await loadSettings();
    getItem.mockClear();
    await loadSettings();
    expect(getItem.mock.calls.filter(c => c[0] === SETTINGS_KEY)).toHaveLength(1);
  });

  it('never hand a caller the read from before a save', async () => {
    // THE ONE THAT MATTERS. Start a read, save while it is in flight, ask
    // again. The second ask must not be handed the first read's promise:
    // that promise resolves to the settings from before the save.
    // Stored the way the app stores it — `saveSettings` splits the secure
    // fields out. A raw blob that still carries them would trip the
    // one-time migration inside the load, which re-saves the plaintext,
    // and this test would then be measuring that instead.
    await saveSettings({ ...DEFAULT_SETTINGS, sunriseEnabled: false });
    const first = loadSettings();
    await saveSettings({ ...DEFAULT_SETTINGS, sunriseEnabled: true });
    const second = await loadSettings();
    expect(second.sunriseEnabled).toBe(true);
    // The first read answers with what it read; that is fine — it was
    // asked before the save.
    await first;
  });
});

describe('the prayer cache', () => {
  beforeEach(async () => {
    // Eight consecutive days on disk, today first.
    await storeRun(new Date(2026, 8, 13), 8);
    getItem.mockClear();
  });

  it('answers a run of days from one read', async () => {
    const now = new Date(2026, 8, 13);
    const dates = Array.from({ length: 8 }, (_, i) => addDays(now, i));
    const days = await getCachedPrayerTimesMany(PARAMS, dates);
    expect(days).toHaveLength(8);
    expect(days.every(d => d != null)).toBe(true);
    expect(getItem.mock.calls.filter(c => c[0] === 'prayer_times_cache.v2')).toHaveLength(1);
  });

  it('answers positionally, null where the day is not there', async () => {
    const now = new Date(2026, 8, 13);
    const days = await getCachedPrayerTimesMany(PARAMS, [
      addDays(now, 0),
      addDays(now, 40),
      addDays(now, 1),
    ]);
    expect(days[0]).not.toBeNull();
    expect(days[1]).toBeNull();
    expect(days[2]).not.toBeNull();
  });

  it('is what the single-day read is built on', async () => {
    const now = new Date(2026, 8, 13);
    expect(await getCachedPrayerTimes({ ...PARAMS, date: now })).toEqual(DAY);
    expect(await getCachedPrayerTimes({ ...PARAMS, date: addDays(now, 40) })).toBeNull();
  });

  it('gives the widget its window from one read, gapless', async () => {
    // Days 7…29 of a 30-day window: eight are on disk (0…7), so the window
    // past the week is day 7 alone, and the loop must stop there rather
    // than skip the gap. One parse of the blob, not twenty-three.
    const now = new Date(2026, 8, 13);
    const extra = await cachedDaysFrom(7, PARAMS, now);
    expect(extra).toHaveLength(1);
    expect(getItem.mock.calls.filter(c => c[0] === 'prayer_times_cache.v2')).toHaveLength(1);
  });

  it('gives the days behind from one read, gapless, nearest first', async () => {
    // Today is day 3 of the stored run: three days behind it, then a gap.
    const now = new Date(2026, 8, 16);
    const past = await cachedDaysBefore(PARAMS, now);
    expect(past).toHaveLength(3);
    expect(getItem.mock.calls.filter(c => c[0] === 'prayer_times_cache.v2')).toHaveLength(1);
  });

  it('shares one read between callers who ask at once', async () => {
    const now = new Date(2026, 8, 13);
    await Promise.all([
      getCachedPrayerTimes({ ...PARAMS, date: now }),
      getCachedPrayerTimes({ ...PARAMS, date: addDays(now, 1) }),
      getCachedPrayerTimes({ ...PARAMS, date: addDays(now, 2) }),
    ]);
    expect(getItem.mock.calls.filter(c => c[0] === 'prayer_times_cache.v2')).toHaveLength(1);
  });

  it('reads fresh after a write', async () => {
    // A read in flight when a write lands must not be what the next
    // caller receives. Start one, write, ask again: two reads.
    const now = new Date(2026, 8, 13);
    const first = getCachedPrayerTimes({ ...PARAMS, date: now });
    await storeOneMore(addDays(now, 30));
    getItem.mockClear();
    const late = await getCachedPrayerTimes({ ...PARAMS, date: addDays(now, 30) });
    expect(late).toEqual(DAY);
    expect(getItem.mock.calls.filter(c => c[0] === 'prayer_times_cache.v2')).toHaveLength(1);
    await first;
  });
});
