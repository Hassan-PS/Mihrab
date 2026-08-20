/**
 * The Log Today widget's queue — the rules the Kotlin receiver has to
 * match, written down where they can be checked.
 */
import {
  applyTap,
  coerceLogQueue,
  drainWidgetLogQueue,
  MAX_QUEUE_AGE_MS,
  partitionQueue,
  UNDO_WINDOW_MS,
  type WidgetLogEntry,
} from '../src/widget/widgetLogQueue';

const T0 = 1_787_000_000_000;
const DAY = '2026-08-20';

describe('reading a stored queue back', () => {
  it('keeps entries that could have come from a real tap', () => {
    const q = coerceLogQueue([{ d: DAY, p: 'Dhuhr', t: T0 }]);
    expect(q).toEqual([{ d: DAY, p: 'Dhuhr', t: T0 }]);
  });

  it('drops anything malformed rather than writing it to the journal', () => {
    const q = coerceLogQueue([
      { d: 'not-a-date', p: 'Dhuhr', t: T0 },
      { d: DAY, p: 'Tahajjud', t: T0 },
      { d: DAY, p: 'Dhuhr', t: 0 },
      { d: DAY, p: 'Dhuhr' },
      null,
      'nonsense',
      { d: DAY, p: 'Asr', t: T0 },
    ]);
    expect(q).toEqual([{ d: DAY, p: 'Asr', t: T0 }]);
  });

  it('treats junk as an empty queue', () => {
    expect(coerceLogQueue(null)).toEqual([]);
    expect(coerceLogQueue({ d: DAY })).toEqual([]);
    expect(coerceLogQueue('[]')).toEqual([]);
  });
});

describe('tapping', () => {
  it('adds a prayer that is not queued', () => {
    const q = applyTap([], DAY, 'Dhuhr', T0);
    expect(q).toEqual([{ d: DAY, p: 'Dhuhr', t: T0 }]);
  });

  it('takes it back when the same prayer is tapped inside the window', () => {
    const once = applyTap([], DAY, 'Dhuhr', T0);
    const twice = applyTap(once, DAY, 'Dhuhr', T0 + UNDO_WINDOW_MS - 1);
    expect(twice).toEqual([]);
  });

  it('leaves it alone when tapped again long after', () => {
    // An hour later is someone confirming, not someone retracting — and
    // silently un-logging a prayer they believe they logged would be the
    // worst outcome available here.
    const once = applyTap([], DAY, 'Dhuhr', T0);
    const later = applyTap(once, DAY, 'Dhuhr', T0 + 60 * 60 * 1000);
    expect(later).toEqual(once);
  });

  it('keeps prayers and days apart', () => {
    let q: WidgetLogEntry[] = [];
    q = applyTap(q, DAY, 'Dhuhr', T0);
    q = applyTap(q, DAY, 'Asr', T0 + 10);
    q = applyTap(q, '2026-08-19', 'Dhuhr', T0 + 20);
    expect(q).toHaveLength(3);
    // Undoing one must not touch the others.
    q = applyTap(q, DAY, 'Asr', T0 + 30);
    expect(q.map(e => `${e.d}/${e.p}`)).toEqual([
      `${DAY}/Dhuhr`,
      '2026-08-19/Dhuhr',
    ]);
  });
});

describe('what a drain writes', () => {
  it('writes oldest first, so a day lands in the order it was tapped', async () => {
    const order: string[] = [];
    const res = await drainWidgetLogQueue({
      take: async () => [
        { d: DAY, p: 'Asr', t: T0 + 200 },
        { d: DAY, p: 'Fajr', t: T0 },
        { d: DAY, p: 'Dhuhr', t: T0 + 100 },
      ],
      write: async (_d, p) => {
        order.push(p);
        return true;
      },
      now: T0 + 1000,
    });
    expect(order).toEqual(['Fajr', 'Dhuhr', 'Asr']);
    expect(res.written).toBe(3);
  });

  it('writes each tap to the day it was FOR, not to today', async () => {
    // The Isha-at-23:40-answered-at-00:05 case. Getting this wrong credits
    // the wrong day and leaves the real one blank.
    const seen: Array<[string, string]> = [];
    await drainWidgetLogQueue({
      take: async () => [{ d: '2026-08-19', p: 'Isha', t: T0 }],
      write: async (d, p) => {
        seen.push([d, p]);
        return true;
      },
      now: T0 + 25 * 60 * 60 * 1000,
    });
    expect(seen).toEqual([['2026-08-19', 'Isha']]);
  });

  it('counts a prayer the app already logged as skipped, not failed', async () => {
    const res = await drainWidgetLogQueue({
      take: async () => [{ d: DAY, p: 'Dhuhr', t: T0 }],
      // logPrayerOnTime returns false when a status is already recorded.
      write: async () => false,
      now: T0 + 100,
    });
    expect(res).toMatchObject({ written: 0, skipped: 1, failed: 0 });
  });

  it('drops taps older than the staleness limit instead of backfilling', async () => {
    const written: string[] = [];
    const res = await drainWidgetLogQueue({
      take: async () => [
        { d: '2026-01-01', p: 'Fajr', t: T0 - MAX_QUEUE_AGE_MS - 1 },
        { d: DAY, p: 'Asr', t: T0 },
      ],
      write: async (_d, p) => {
        written.push(p);
        return true;
      },
      now: T0 + 100,
    });
    expect(written).toEqual(['Asr']);
    expect(res).toMatchObject({ written: 1, dropped: 1 });
  });

  it('counts a failed write instead of throwing and losing the rest', async () => {
    // The queue has already been taken by the time a write runs, so a throw
    // here would lose the remaining taps rather than report them.
    const written: string[] = [];
    const res = await drainWidgetLogQueue({
      take: async () => [
        { d: DAY, p: 'Fajr', t: T0 },
        { d: DAY, p: 'Dhuhr', t: T0 + 1 },
      ],
      write: async (_d, p) => {
        if (p === 'Fajr') throw new Error('keychain unavailable');
        written.push(p);
        return true;
      },
      now: T0 + 100,
    });
    expect(written).toEqual(['Dhuhr']);
    expect(res).toMatchObject({ written: 1, failed: 1 });
  });

  it('survives the native side failing to hand over a queue', async () => {
    const res = await drainWidgetLogQueue({
      take: async () => {
        throw new Error('no such module');
      },
      write: async () => true,
      now: T0,
    });
    expect(res).toEqual({ written: 0, skipped: 0, dropped: 0, failed: 0 });
  });
});

describe('partitioning', () => {
  it('separates stale from writable without reordering the stale ones', () => {
    const { write, stale } = partitionQueue(
      [
        { d: DAY, p: 'Fajr', t: T0 - MAX_QUEUE_AGE_MS - 5 },
        { d: DAY, p: 'Asr', t: T0 },
      ],
      T0 + 1,
    );
    expect(write.map(e => e.p)).toEqual(['Asr']);
    expect(stale.map(e => e.p)).toEqual(['Fajr']);
  });
});
