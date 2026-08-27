/**
 * A change to the record schedules a sync — from anywhere, including the
 * paths that run with the app closed.
 *
 * Asked for on 2026-08-27: "every new change in the log should trigger a
 * sync, even if the change was logged through a notification". The two
 * halves that make that hard are both pinned here — a merge must not
 * trigger a merge, and computing prayer times is not a change.
 */
const mockRunSyncNow = jest.fn();
const mockSyncIsReady = jest.fn();

jest.mock('../src/sync/runSync', () => ({
  runSyncNow: (...a: unknown[]) => mockRunSyncNow(...a),
  syncIsReady: (...a: unknown[]) => mockSyncIsReady(...a),
}));

import {
  JOURNAL_KEY,
  FASTING_KEY,
  DHIKR_KEY,
  SUNNAH_KEY,
} from '../src/practice/practiceStore';
import {
  flushRecordSync,
  noteRecordWrite,
  resetRecordSync,
  whileApplyingSnapshot,
  RECORD_SYNC_DEBOUNCE_MS,
} from '../src/sync/recordChanged';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  resetRecordSync();
  mockSyncIsReady.mockResolvedValue(true);
  mockRunSyncNow.mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('what counts as a change', () => {
  it.each([
    ['a prayer', JOURNAL_KEY],
    ['a fast', FASTING_KEY],
    ['a dhikr set', DHIKR_KEY],
    ['a sunnah', SUNNAH_KEY],
  ])('syncs after %s is written', async (_what, key) => {
    noteRecordWrite(key);
    await flushRecordSync();
    expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the settings blob', 'prayerapp.settings.v1'],
    ['the stored location', 'prayerapp.location.v1'],
    ['a cached prayer-times month', 'prayerapp.prayers.2026-08'],
    ['the sync identity', 'prayerapp.sync.identity.v1'],
  ])('does not sync after %s is written', async (_what, key) => {
    // Prayer times are computed, not recorded. A day rolling over on a
    // phone in a drawer is not news for anybody's other device.
    noteRecordWrite(key);
    await flushRecordSync();
    expect(mockRunSyncNow).not.toHaveBeenCalled();
  });
});

describe('how often', () => {
  it('turns a burst into one round', async () => {
    // "Mark all on time" writes five entries.
    for (let i = 0; i < 5; i++) noteRecordWrite(JOURNAL_KEY);
    await flushRecordSync();
    expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  });

  it('waits before running, so the burst can finish', () => {
    noteRecordWrite(JOURNAL_KEY);
    jest.advanceTimersByTime(RECORD_SYNC_DEBOUNCE_MS - 1);
    expect(mockRunSyncNow).not.toHaveBeenCalled();
  });

  it('runs on its own once the gap passes', async () => {
    noteRecordWrite(JOURNAL_KEY);
    jest.advanceTimersByTime(RECORD_SYNC_DEBOUNCE_MS);
    // The timer fired; let the round it started settle.
    await Promise.resolve();
    expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is nowhere to sync to', async () => {
    mockSyncIsReady.mockResolvedValue(false);
    noteRecordWrite(JOURNAL_KEY);
    await flushRecordSync();
    expect(mockRunSyncNow).not.toHaveBeenCalled();
  });
});

describe('a merge is not a change', () => {
  it('stays quiet while a snapshot is being applied', async () => {
    // applySnapshot writes all four keys. Without this, every round would
    // end by asking for another one, on every paired device, for ever.
    await whileApplyingSnapshot(async () => {
      noteRecordWrite(JOURNAL_KEY);
      noteRecordWrite(SUNNAH_KEY);
    });
    await flushRecordSync();
    expect(mockRunSyncNow).not.toHaveBeenCalled();
  });

  it('listens again afterwards', async () => {
    await whileApplyingSnapshot(async () => {
      noteRecordWrite(JOURNAL_KEY);
    });
    noteRecordWrite(JOURNAL_KEY);
    await flushRecordSync();
    expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  });

  it('listens again even when the merge threw', async () => {
    await expect(
      whileApplyingSnapshot(async () => {
        throw new Error('storage locked');
      }),
    ).rejects.toThrow();

    noteRecordWrite(JOURNAL_KEY);
    await flushRecordSync();
    expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  });
});

describe('the headless paths', () => {
  it('flushing runs the round now, not in three seconds', async () => {
    // A notification action's process may be torn down the moment its task
    // resolves, taking any pending timer with it.
    noteRecordWrite(JOURNAL_KEY);
    await flushRecordSync();
    expect(mockRunSyncNow).toHaveBeenCalledTimes(1);
  });

  it('flushing with nothing pending is free', async () => {
    await flushRecordSync();
    expect(mockSyncIsReady).not.toHaveBeenCalled();
  });

  it('never throws — a round that fails is not the caller’s problem', async () => {
    mockRunSyncNow.mockRejectedValue(new Error('folder gone'));
    noteRecordWrite(JOURNAL_KEY);
    await expect(flushRecordSync()).resolves.toBeUndefined();
  });
});
