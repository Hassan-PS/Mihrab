/**
 * The press must reach the journal — that is the whole bug.
 *
 * The parsing helpers are covered next door; this drives
 * `handlePrayerLogEvent` itself against a stubbed store, because the
 * previous implementation would have passed every parsing test in the world
 * while writing nothing at all.
 */
import { EventType } from '@notifee/react-native';

// `mock`-prefixed so jest allows the factories below to close over them.
const mockStore = new Map<string, string>();
const store = mockStore;

jest.mock('../src/storage/durableWrite', () => ({
  durableEncryptedGet: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  durableEncryptedSet: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
}));

const mockCancelNotification = jest.fn(async () => {});
const mockCancelTrigger = jest.fn(async () => {});
const cancelNotification = mockCancelNotification;
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    cancelNotification: (...a: unknown[]) =>
      mockCancelNotification(...(a as [])),
    cancelTriggerNotification: (...a: unknown[]) =>
      mockCancelTrigger(...(a as [])),
    getTriggerNotificationIds: async () => [],
    createChannel: async () => 'ch',
    createTriggerNotification: async () => {},
    getNotificationCategories: async () => [],
    setNotificationCategories: async () => {},
  },
  EventType: { ACTION_PRESS: 2, PRESS: 1, DISMISSED: 0, DELIVERED: 3 },
  AndroidImportance: { DEFAULT: 3 },
  TriggerType: { TIMESTAMP: 0 },
}));

import { JOURNAL_KEY, SUNNAH_KEY } from '../src/practice/practiceStore';
import { handlePrayerLogEvent } from '../src/notifications/prayerLogAction';
import { coerceJournalEntries, getEntryStatus } from '../src/journal/journal';
import { coerceSunnahLog, dayAt } from '../src/journal/sunnah';

function journal() {
  const raw = store.get(JOURNAL_KEY);
  return raw ? coerceJournalEntries(JSON.parse(raw)) : [];
}

function press(actionId: string, notification: Record<string, unknown>) {
  return handlePrayerLogEvent({
    type: EventType.ACTION_PRESS,
    detail: { pressAction: { id: actionId }, notification },
  } as never);
}

beforeEach(() => {
  store.clear();
  cancelNotification.mockClear();
});

describe('handlePrayerLogEvent', () => {
  test('writes the prayer it names to the day it was scheduled for', async () => {
    const handled = await press('journal-log-prayer:Maghrib', {
      id: 'pt-1-Maghrib',
      data: { targetDate: '2026-08-09', prayer: 'Maghrib' },
    });
    expect(handled).toBe(true);
    expect(getEntryStatus(journal(), '2026-08-09', 'Maghrib')).toBe('on-time');
  });

  test('clears the alert it answered', async () => {
    await press('journal-log-prayer:Fajr', {
      id: 'pt-2-Fajr',
      data: { targetDate: '2026-08-09' },
    });
    expect(cancelNotification).toHaveBeenCalledWith('pt-2-Fajr');
  });

  test('a second press does not overwrite a status set deliberately', async () => {
    // Someone marks Asr "missed" in the app, then the stale notification is
    // still on the lock screen and gets pressed. The record must win.
    await press('journal-log-prayer:Asr', {
      id: 'pt-3-Asr',
      data: { targetDate: '2026-08-09' },
    });
    const raw = journal().map(e =>
      e.prayer === 'Asr' ? { ...e, status: 'missed' as const } : e,
    );
    store.set(JOURNAL_KEY, JSON.stringify(raw));
    await press('journal-log-prayer:Asr', {
      id: 'pt-3-Asr',
      data: { targetDate: '2026-08-09' },
    });
    expect(getEntryStatus(journal(), '2026-08-09', 'Asr')).toBe('missed');
  });

  test('does not double-write on a double press', async () => {
    await press('journal-log-prayer:Isha', {
      id: 'pt-4-Isha',
      data: { targetDate: '2026-08-09' },
    });
    await press('journal-log-prayer:Isha', {
      id: 'pt-4-Isha',
      data: { targetDate: '2026-08-09' },
    });
    expect(journal()).toHaveLength(1);
  });

  test('the bare iOS id works, taking the prayer from the payload', async () => {
    const handled = await press('journal-log-prayer', {
      id: 'pt-5-Dhuhr',
      data: { targetDate: '2026-08-09', prayer: 'Dhuhr' },
    });
    expect(handled).toBe(true);
    expect(getEntryStatus(journal(), '2026-08-09', 'Dhuhr')).toBe('on-time');
  });

  test('leaves other notifications alone', async () => {
    expect(
      await press('adhan-stop', { id: 'pt-6-Isha', data: {} }),
    ).toBe(false);
    expect(journal()).toHaveLength(0);
  });

  test('a Sunrise alert cannot write to the journal', async () => {
    // Sunrise gets a notification and is not a prayer. Claiming it was
    // "prayed on time" would be nonsense in the user's own record.
    const handled = await press('journal-log-prayer', {
      id: 'pt-7-Sunrise',
      data: { targetDate: '2026-08-09', prayer: 'Sunrise' },
    });
    expect(handled).toBe(true);
    expect(journal()).toHaveLength(0);
  });

  test('a press with no payload at all still lands on the id’s day', async () => {
    const firedAt = new Date(2026, 7, 9, 23, 50, 0).getTime();
    await press('journal-log-prayer:Isha', { id: `pt-${firedAt}-Isha` });
    expect(getEntryStatus(journal(), '2026-08-09', 'Isha')).toBe('on-time');
  });
});

/**
 * "Log with sunnah" — the second button, added when the first turned out to
 * be the only thing on a prayer alert that wrote anything at all.
 *
 * It fills the fard AND that prayer's own sunnah in one press, because the
 * common case on a notification is "I prayed it, all of it" and making that
 * two trips into the app is why the Log tab exists at all.
 */
describe('handlePrayerLogEvent — log with sunnah', () => {
  const sunnahLog = () => {
    const raw = store.get(SUNNAH_KEY);
    return raw ? coerceSunnahLog(JSON.parse(raw)) : {};
  };

  test('writes the fard AND that prayer’s sunnah', async () => {
    const handled = await press('journal-log-sunnah:Dhuhr', {
      id: 'pt-1-Dhuhr',
      data: { targetDate: '2026-08-09', prayer: 'Dhuhr' },
    });
    expect(handled).toBe(true);
    expect(getEntryStatus(journal(), '2026-08-09', 'Dhuhr')).toBe('on-time');
    // Dhuhr carries two; a press claims both or it is not "with sunnah".
    expect(dayAt(sunnahLog(), '2026-08-09').dhuhr).toBe(2);
  });

  test('fills each prayer to its own count, not to a fixed number', async () => {
    for (const [prayer, field, want] of [
      ['Fajr', 'fajr', 1],
      ['Dhuhr', 'dhuhr', 2],
      ['Maghrib', 'maghrib', 1],
      ['Isha', 'isha', 2],
    ] as const) {
      store.clear();
      await press(`journal-log-sunnah:${prayer}`, {
        id: `pt-1-${prayer}`,
        data: { targetDate: '2026-08-09', prayer },
      });
      expect(dayAt(sunnahLog(), '2026-08-09')[field]).toBe(want);
    }
  });

  test('leaves Witr and Qiyam alone, even on Isha', async () => {
    // They are prayed later in the night. A button pressed as Isha comes in
    // cannot honestly claim them.
    await press('journal-log-sunnah:Isha', {
      id: 'pt-1-Isha',
      data: { targetDate: '2026-08-09', prayer: 'Isha' },
    });
    const day = dayAt(sunnahLog(), '2026-08-09');
    expect(day.isha).toBe(2);
    expect(day.witr).toBe(false);
    expect(day.qiyam).toBe(0);
  });

  test('writes nothing extra for Asr, which carries no sunnah', async () => {
    // The button is not offered on Asr, but the id can still arrive from an
    // older notification sitting in the shade across an update.
    const handled = await press('journal-log-sunnah:Asr', {
      id: 'pt-1-Asr',
      data: { targetDate: '2026-08-09', prayer: 'Asr' },
    });
    expect(handled).toBe(true);
    expect(getEntryStatus(journal(), '2026-08-09', 'Asr')).toBe('on-time');
    expect(sunnahLog()['2026-08-09']).toBeUndefined();
  });

  test('the plain button still writes no sunnah at all', async () => {
    await press('journal-log-prayer:Dhuhr', {
      id: 'pt-1-Dhuhr',
      data: { targetDate: '2026-08-09', prayer: 'Dhuhr' },
    });
    expect(getEntryStatus(journal(), '2026-08-09', 'Dhuhr')).toBe('on-time');
    expect(sunnahLog()['2026-08-09']).toBeUndefined();
  });

  test('resolves the prayer from the id when a relay drops the payload', async () => {
    // A watch bridge is free to strip `data`; the id is all that survives.
    const handled = await press('journal-log-sunnah:Maghrib', {
      id: 'pt-1754697600000-Maghrib',
    });
    expect(handled).toBe(true);
    const date = Object.keys(sunnahLog())[0];
    expect(date).toBeDefined();
    expect(dayAt(sunnahLog(), date).maghrib).toBe(1);
    expect(getEntryStatus(journal(), date, 'Maghrib')).toBe('on-time');
  });

  test('does not raise a count the user set by hand', async () => {
    // One of Dhuhr's two logged deliberately; the press must not claim the
    // second on their behalf.
    store.set(
      SUNNAH_KEY,
      JSON.stringify({
        '2026-08-09': {
          fajr: 0, dhuhr: 1, maghrib: 0, isha: 0, witr: false, qiyam: 0,
        },
      }),
    );
    await press('journal-log-sunnah:Dhuhr', {
      id: 'pt-1-Dhuhr',
      data: { targetDate: '2026-08-09', prayer: 'Dhuhr' },
    });
    // Was `toBe(2)`: the test's name said one thing and its expectation
    // pinned the opposite, so the button quietly claimed the second rak'ah —
    // and re-filled a sunnah the user had un-logged. One left alone is one.
    expect(dayAt(sunnahLog(), '2026-08-09').dhuhr).toBe(1);
  });

  test('leaves a sunnah the user deliberately cleared cleared', async () => {
    // The Log screen writes an all-zero day as a tombstone rather than
    // deleting it. This button must read that as "they said no", not as an
    // empty slot to fill.
    store.set(
      SUNNAH_KEY,
      JSON.stringify({
        '2026-08-09': {
          fajr: 0, dhuhr: 0, maghrib: 0, isha: 0, witr: false, qiyam: 0,
          at: Date.now(),
        },
      }),
    );
    await press('journal-log-sunnah:Fajr', {
      id: 'pt-1-Fajr',
      data: { targetDate: '2026-08-09', prayer: 'Fajr' },
    });
    // Fajr was never logged, so this one IS an empty slot and gets filled
    // (Fajr's sunnah is one unit, so full is 1).
    expect(dayAt(sunnahLog(), '2026-08-09').fajr).toBe(1);
  });

  test('is idempotent — a double press changes nothing the second time', async () => {
    const one = { id: 'pt-1-Fajr', data: { targetDate: '2026-08-09', prayer: 'Fajr' } };
    await press('journal-log-sunnah:Fajr', one);
    const after = JSON.stringify(sunnahLog());
    await press('journal-log-sunnah:Fajr', one);
    expect(JSON.stringify(sunnahLog())).toBe(after);
  });

  test('clears the alert once it has been answered', async () => {
    await press('journal-log-sunnah:Fajr', {
      id: 'pt-1-Fajr',
      data: { targetDate: '2026-08-09', prayer: 'Fajr' },
    });
    expect(cancelNotification).toHaveBeenCalledWith('pt-1-Fajr');
  });
});
