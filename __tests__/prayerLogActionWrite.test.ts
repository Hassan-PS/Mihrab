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

import { JOURNAL_KEY } from '../src/practice/practiceStore';
import { handlePrayerLogEvent } from '../src/notifications/prayerLogAction';
import { coerceJournalEntries, getEntryStatus } from '../src/journal/journal';

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
