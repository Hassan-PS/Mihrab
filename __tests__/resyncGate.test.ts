/**
 * The foreground gate must never make the app WRONG to make it cheap.
 *
 * Every `'active'` event used to cost a GPS fix, a rewrite of ~48 alarms and
 * a full journal decrypt — and `'active'` fires several times a minute in
 * ordinary use. The obvious fix, "don't do it more than once a minute", is
 * the dangerous one: the entire reason to resync on foreground is that the
 * answer may have changed, and a day rollover or a landed plane must not
 * wait behind a timer.
 *
 * So these tests are mostly about the cases that MUST get through.
 */
import {
  RESYNC_MIN_GAP_MS,
  dayTzFingerprint,
  forgetResyncGates,
  markResynced,
  shouldResync,
} from '../src/utils/resyncGate';

const KEY = 'test.key';
const T0 = 1_700_000_000_000;

beforeEach(() => {
  forgetResyncGates();
});

describe('what must always get through', () => {
  test('the first run, always', () => {
    expect(shouldResync(KEY, 'a', T0)).toBe(true);
  });

  test('a changed fingerprint, however soon after the last run', () => {
    markResynced(KEY, 'a', T0);
    // One millisecond later. A new day, a new timezone or a changed
    // calculation method beats the gap every time.
    expect(shouldResync(KEY, 'b', T0 + 1)).toBe(true);
  });

  test('a day rollover', () => {
    const before = dayTzFingerprint(new Date(2026, 7, 24, 23, 59, 30));
    const after = dayTzFingerprint(new Date(2026, 7, 25, 0, 0, 30));
    expect(before).not.toBe(after);
    markResynced(KEY, before, T0);
    expect(shouldResync(KEY, after, T0 + 60_000)).toBe(true);
  });

  test('a clock that went backwards does not lock the gate shut', () => {
    // An NTP correction or a manual clock change makes `now - at` negative.
    // Reading that as "no gap yet" would suppress every resync until real
    // time caught back up.
    markResynced(KEY, 'a', T0);
    expect(shouldResync(KEY, 'a', T0 - 5 * 60_000)).toBe(true);
  });

  test('work that threw is not recorded, so the retry runs', () => {
    // markResynced is deliberately separate from shouldResync: the caller
    // marks on success only.
    expect(shouldResync(KEY, 'a', T0)).toBe(true);
    // ...the run fails, nothing is marked...
    expect(shouldResync(KEY, 'a', T0 + 1)).toBe(true);
  });
});

describe('what gets suppressed', () => {
  test('an identical repeat inside the gap', () => {
    markResynced(KEY, 'a', T0);
    expect(shouldResync(KEY, 'a', T0 + 1_000)).toBe(false);
    expect(shouldResync(KEY, 'a', T0 + RESYNC_MIN_GAP_MS - 1)).toBe(false);
  });

  test('but not once the gap has passed', () => {
    markResynced(KEY, 'a', T0);
    expect(shouldResync(KEY, 'a', T0 + RESYNC_MIN_GAP_MS)).toBe(true);
  });

  test('the burst one user action produces', () => {
    // A share sheet opening and closing, a permission dialog, an unlock:
    // several 'active' events within a second or two. One of them should do
    // the work.
    let ran = 0;
    for (const at of [T0, T0 + 120, T0 + 400, T0 + 900, T0 + 1500]) {
      if (shouldResync(KEY, 'same', at)) {
        ran += 1;
        markResynced(KEY, 'same', at);
      }
    }
    expect(ran).toBe(1);
  });

  test('keys do not interfere with each other', () => {
    markResynced('one', 'a', T0);
    expect(shouldResync('two', 'a', T0 + 1)).toBe(true);
  });
});

describe('the fingerprint', () => {
  test('is the DEVICE day, so it changes at local midnight', () => {
    const late = dayTzFingerprint(new Date(2026, 0, 1, 23, 0, 0));
    const early = dayTzFingerprint(new Date(2026, 0, 2, 1, 0, 0));
    expect(late).not.toBe(early);
  });

  test('the same moment on the same day is the same fingerprint', () => {
    const a = dayTzFingerprint(new Date(2026, 0, 1, 9, 0, 0), 'x', 3);
    const b = dayTzFingerprint(new Date(2026, 0, 1, 17, 30, 0), 'x', 3);
    expect(a).toBe(b);
  });

  test('any extra input changes it', () => {
    const base = new Date(2026, 0, 1, 9, 0, 0);
    expect(dayTzFingerprint(base, 'automatic')).not.toBe(
      dayTzFingerprint(base, 'manual'),
    );
    expect(dayTzFingerprint(base, 'x', 1)).not.toBe(
      dayTzFingerprint(base, 'x', 2),
    );
  });
});

describe('the call sites are gated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const read = (p: string) =>
    fs.readFileSync(path.join(__dirname, '..', p), 'utf-8') as string;

  test('the foreground location refresh', () => {
    const src = read('src/hooks/usePrayerDay.ts');
    expect(src).toMatch(/shouldResync\(RESYNC_KEY/);
    // And it still refreshes on a real change: the fingerprint carries the
    // settings that decide the times.
    expect(src).toMatch(/settings\.calculationMethod,[\s\S]{0,80}settings\.school/);
  });

  test('the prayer-alarm rewrite and the end-of-day rewrite', () => {
    const src = read('src/screens/HomeScreen.tsx');
    expect(src).toMatch(/shouldResync\(NOTIF_RESYNC_KEY/);
    expect(src).toMatch(/shouldResync\(EOD_RESYNC_KEY/);
    // Marked in .then, never before the work — see the "threw" test above.
    expect(src).toMatch(/\.then\(\(\) => markResynced\(NOTIF_RESYNC_KEY/);
    expect(src).toMatch(/\.then\(\(\) => markResynced\(EOD_RESYNC_KEY/);
  });
});

describe('the opportunistic year-ahead fill can be stopped', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src/prayer/prayerStorage.ts'),
    'utf-8',
  ) as string;

  test('it asks between batches, and keeps what it fetched', () => {
    expect(src).toMatch(/shouldContinue\?\: \(\) => boolean/);
    // `break`, not `return`: the single write after the loop is what makes a
    // stop resumable. A `return` here would throw away the whole run.
    expect(src).toMatch(/if \(shouldContinue && !shouldContinue\(\)\) break;/);
  });

  test('the Wi-Fi trigger passes the app-state check', () => {
    expect(src).toMatch(/refreshPrayerDataCache\(params, 12, undefined, \(\) => !isAppBackgrounded\(\)\)/);
  });
});
