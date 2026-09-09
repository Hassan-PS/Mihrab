/**
 * A record that could not be read is not one the app may write over.
 *
 * Issue #38: a journal with weeks in it, gone — replaced by the one prayer
 * the user had just tapped. Every writer of the journal read the blob, added
 * an entry and wrote the blob back, and every one of them treated a FAILED
 * read as an EMPTY journal. So did the practice store the screens render
 * from: a read that failed hydrated them onto three empty stores, the
 * screen drew a blank record, and the next tap wrote "blank plus this one"
 * to disk. The sunnah log survived only because nothing wrote it that day.
 *
 * These pin the four locks that replaced that:
 *
 *   1. `durableEncryptedGet(key, { strict: true })` throws for a key that
 *      has been written before and cannot be read now — and still answers
 *      null for one that never was, so a first launch stays a first launch.
 *   2. The practice store's read is strict, so a failure leaves it
 *      unhydrated instead of empty.
 *   3. `primePractice` before hydration holds the patch rather than
 *      publishing EMPTY-plus-patch as if it were the whole record.
 *   4. The quick-log check and the notification's "Log" button refuse to
 *      write from a store they could not read.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    cancelNotification: async () => {},
    cancelTriggerNotification: async () => {},
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

import {
  durableEncryptedGet,
  durableEncryptedSet,
  isEncryptedReadError,
  resetEncryptedStoreDegraded,
  resetEncryptedWitnesses,
} from '../src/storage/durableWrite';
import {
  _resetPracticeStore,
  JOURNAL_KEY,
  SUNNAH_KEY,
  loadPractice,
  primePractice,
  subscribePractice,
} from '../src/practice/practiceStore';
import { logPrayerOnTime } from '../src/notifications/prayerLogAction';
import { logAllPrayersOnTime } from '../src/notifications/endOfDayLog';

const enc = EncryptedStorage as jest.Mocked<typeof EncryptedStorage>;
const WEDGED = new Error('KeyStoreException: Failed to unwrap key');

/** A working store with a journal of two entries in it. */
const disk = new Map<string, string>();
const JOURNAL = JSON.stringify([
  { date: '2026-09-01', prayer: 'Fajr', status: 'on-time', loggedAt: 'x' },
  { date: '2026-09-01', prayer: 'Dhuhr', status: 'late', loggedAt: 'x' },
]);

function storeWorks() {
  enc.getItem.mockImplementation(async k => disk.get(k) ?? null);
  enc.setItem.mockImplementation(async (k, v) => {
    disk.set(k, v);
  });
}
function storeWedged() {
  enc.getItem.mockRejectedValue(WEDGED);
  enc.setItem.mockRejectedValue(WEDGED);
}
/** The store answers again — but only reads; writes are what we count. */
function readsFailWritesWork() {
  enc.getItem.mockRejectedValue(WEDGED);
  enc.setItem.mockImplementation(async (k, v) => {
    disk.set(k, v);
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  disk.clear();
  resetEncryptedStoreDegraded();
  resetEncryptedWitnesses();
  _resetPracticeStore();
  await AsyncStorage.clear();
});

describe('a strict read', () => {
  it('throws for a key that was written before and cannot be read now', async () => {
    storeWorks();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    storeWedged();
    let caught: unknown;
    await durableEncryptedGet(JOURNAL_KEY, { strict: true, attempts: 1 }).catch(
      e => {
        caught = e;
      },
    );
    expect(isEncryptedReadError(caught)).toBe(true);
  });

  it('still answers null for a key nobody ever wrote — a first launch is not an error', async () => {
    storeWedged();
    await expect(
      durableEncryptedGet(JOURNAL_KEY, { strict: true, attempts: 1 }),
    ).resolves.toBeNull();
  });

  it('remembers the witness across a restart, not only in memory', async () => {
    storeWorks();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    resetEncryptedWitnesses(); // the process died; the plaintext bit did not
    storeWedged();
    await expect(
      durableEncryptedGet(JOURNAL_KEY, { strict: true, attempts: 1 }),
    ).rejects.toBeTruthy();
  });

  it('prefers the plaintext fallback to throwing, when there is one', async () => {
    // The Homebrew macOS channel: the Keychain never works, every write
    // lands in the fallback, and every read comes from there.
    storeWedged();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    await expect(
      durableEncryptedGet(JOURNAL_KEY, { strict: true, attempts: 1 }),
    ).resolves.toBe(JOURNAL);
  });

  it('is opt-in: the plain read keeps answering null, as every scheduler expects', async () => {
    storeWorks();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    storeWedged();
    await expect(
      durableEncryptedGet(JOURNAL_KEY, { attempts: 1 }),
    ).resolves.toBeNull();
  });
});

describe('the practice store', () => {
  it('stays unhydrated when the journal cannot be read, and reads again later', async () => {
    storeWorks();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    storeWedged();
    await expect(loadPractice()).rejects.toBeTruthy();
    // The store comes back; the next read is a real one.
    storeWorks();
    const data = await loadPractice();
    expect(data.journal).toHaveLength(2);
  });

  it('does not publish EMPTY-plus-patch when primed before hydration', async () => {
    storeWorks();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    await durableEncryptedSet(SUNNAH_KEY, JSON.stringify({ '2026-09-01': { fajr: 1 } }));
    const seen: Array<{ journal: number; sunnah: number }> = [];
    subscribePractice(() => {
      void loadPractice().then(d => {
        seen.push({
          journal: d.journal.length,
          sunnah: Object.keys(d.sunnah).length,
        });
      });
    });
    // A writer publishes its journal while nothing has been read yet.
    primePractice({
      journal: [
        { date: '2026-09-02', prayer: 'Fajr', status: 'on-time', loggedAt: 'y' },
      ],
    });
    const data = await loadPractice();
    await new Promise(r => setTimeout(r, 0));
    // The patch is on top of the disk's sunnah log, not on top of nothing.
    expect(data.journal).toHaveLength(1);
    expect(Object.keys(data.sunnah)).toHaveLength(1);
    expect(seen.every(s => s.sunnah === 1)).toBe(true);
  });
});

describe('the writers', () => {
  it('the notification’s "Log" refuses to write over a journal it could not read', async () => {
    storeWorks();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    readsFailWritesWork();
    await expect(logPrayerOnTime('2026-09-02', 'Asr')).rejects.toBeTruthy();
    // Retries take a moment; the point is what is on disk afterwards.
    expect(disk.get(JOURNAL_KEY)).toBe(JOURNAL);
  }, 10_000);

  it('the end-of-day "log the day" refuses likewise', async () => {
    storeWorks();
    await durableEncryptedSet(JOURNAL_KEY, JOURNAL);
    readsFailWritesWork();
    await expect(logAllPrayersOnTime('2026-09-02')).rejects.toBeTruthy();
    expect(disk.get(JOURNAL_KEY)).toBe(JOURNAL);
  }, 10_000);

  it('both still write on a first launch, where there is nothing to lose', async () => {
    storeWorks();
    expect(await logPrayerOnTime('2026-09-02', 'Asr')).toBe(true);
    expect(JSON.parse(disk.get(JOURNAL_KEY)!)).toHaveLength(1);
  });
});
