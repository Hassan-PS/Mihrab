/**
 * The widget payload and the 12-hour clock — issue #18.
 *
 * The invariant this file exists for: `time` is machine data. The iOS
 * widget's progress ring splits it on ":", `logMinutesOfDay` turns it
 * into minutes-of-day, Android's `epochForDayTime` matches it against
 * `^(\d{1,2}):(\d{2})$` to schedule the Live Activity, and
 * `syncLiveActivity` parses it back into a Date. A "5:31 PM" in that
 * field would not throw — the ring would simply stop advancing and the
 * card would stop rolling over, on devices nobody is testing on.
 *
 * So the 12-hour clock rides in a SEPARATE field, and it rides only when
 * it says something `time` does not.
 */
import { buildWidgetPayload } from '../src/widget/buildWidgetPayload';
import { buildTodayBlock } from '../src/widget/widgetBlocks';
import { _resetActiveClock, setActiveClockFormat } from '../src/utils/activeClock';
import { _setSystemIs24HourForTests } from '../src/native/SystemClock';
import type { JournalEntry } from '../src/journal/journal';

const NOW = new Date(2026, 7, 20, 14, 30);

const TIMINGS = {
  Fajr: '05:10',
  Sunrise: '06:28',
  Dhuhr: '13:12',
  Asr: '16:57',
  Maghrib: '19:56',
  Isha: '21:13',
};

const CANONICAL = /^([01]\d|2[0-3]):[0-5]\d$/;

afterEach(() => {
  _resetActiveClock();
  _setSystemIs24HourForTests(null);
});

function everyRow(payload: ReturnType<typeof buildWidgetPayload>) {
  const rows = [
    ...payload.rows,
    ...(payload.sunriseRow ? [payload.sunriseRow] : []),
    ...(payload.extraRows ?? []),
  ];
  for (const day of payload.days ?? []) {
    rows.push(
      ...day.rows,
      ...(day.sunriseRow ? [day.sunriseRow] : []),
      ...(day.extraRows ?? []),
    );
  }
  return rows;
}

describe('the canonical time survives a 12-hour clock', () => {
  it('keeps every row parseable while drawing AM/PM', () => {
    setActiveClockFormat('12');
    const payload = buildWidgetPayload(TIMINGS, TIMINGS, NOW, 'Malmö');

    const rows = everyRow(payload);
    expect(rows.length).toBeGreaterThan(6);
    for (const row of rows) {
      expect(row.time).toMatch(CANONICAL);
      expect(row.display).toBeDefined();
      expect(row.display).toMatch(/(AM|PM)$/);
    }
    // The next-prayer pair follows the same rule.
    expect(payload.nextPrayerTime).toMatch(CANONICAL);
    expect(payload.nextPrayerDisplay).toMatch(/(AM|PM)$/);
  });

  it('draws the right hour, not merely a differently-formatted one', () => {
    setActiveClockFormat('12');
    const payload = buildWidgetPayload(TIMINGS, TIMINGS, NOW, 'Malmö');
    const byKey = Object.fromEntries(payload.rows.map(r => [r.key, r]));
    expect(byKey.Fajr.display).toBe('5:10 AM');
    expect(byKey.Dhuhr.display).toBe('1:12 PM');
    expect(byKey.Isha.display).toBe('9:13 PM');
    expect(byKey.Fajr.time).toBe('05:10');
  });

  it('carries the same distinction into the log block', () => {
    setActiveClockFormat('12');
    const journal: JournalEntry[] = [];
    const block = buildTodayBlock({ journal, timings: TIMINGS, now: NOW });
    for (const p of block.prayers) {
      expect(p.time).toMatch(CANONICAL);
      expect(p.display).toMatch(/(AM|PM)$/);
    }
  });
});

describe('a 24-hour payload carries no second copy', () => {
  /**
   * `display` would be a byte-for-byte duplicate of `time` here, on a
   * payload that is read from disk on the main thread of a process with
   * milliseconds to live. Native falls back to `time`, which is exactly
   * right when the two agree — see `PrayerWidgetProvider.displayTime`.
   */
  it('omits the display field entirely', () => {
    setActiveClockFormat('24');
    const payload = buildWidgetPayload(TIMINGS, TIMINGS, NOW, 'Malmö');
    for (const row of everyRow(payload)) {
      expect(row.display).toBeUndefined();
    }
    expect(payload.nextPrayerDisplay).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('display');
  });

  it('does the same on auto when the device says 24-hour', () => {
    setActiveClockFormat('auto');
    _setSystemIs24HourForTests(true);
    const payload = buildWidgetPayload(TIMINGS, TIMINGS, NOW, 'Malmö');
    expect(JSON.stringify(payload)).not.toContain('display');
  });

  it('follows the device the other way too', () => {
    setActiveClockFormat('auto');
    _setSystemIs24HourForTests(false);
    const payload = buildWidgetPayload(TIMINGS, TIMINGS, NOW, 'Malmö');
    expect(payload.rows[0].display).toBeDefined();
  });
});
