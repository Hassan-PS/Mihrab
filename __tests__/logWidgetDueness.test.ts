/**
 * The Log widget has to know what time it is.
 *
 * Reported on iOS, macOS and Android at once, which was the clue: the
 * adhan passes, and the prayer it belongs to is not offered for logging
 * until the app is opened. No chip to tap, the footer still naming the
 * prayer that has already been called, the countdown still counting to a
 * moment in the past.
 *
 * One cause, three symptoms. `buildTodayBlock` stamps a `due` boolean into
 * the payload — `at <= now` at the instant the app writes it — and every
 * renderer read that flag as though it tracked the clock. It cannot: the
 * payload is written when the app is open, and the whole point of a widget
 * is the hours when it is not.
 *
 * Both platforms were ALREADY waking up correctly. Android arms an alarm
 * at each prayer boundary and fans a redraw out to every provider; iOS
 * emits a timeline entry at each remaining prayer time. Both then redrew
 * the identical frozen boolean, which is why the wake-ups were invisible
 * and the bug looked like "the widget never refreshes".
 *
 * So the fix is not more refreshing. It is that the renderer decides
 * dueness itself, from the row's `HH:mm` against the clock at the moment
 * it is drawing — with the payload's flag kept only as the fallback for a
 * row whose time will not parse, or a block that is not about today.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const kt = (name: string) =>
  readFileSync(
    path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times', name),
    'utf8',
  );
const swift = (name: string) =>
  readFileSync(path.join(ROOT, 'ios', 'PrayerWidgetExtension', name), 'utf8');

const log = kt('PrayerWidgetLogProvider.kt');
const provider = kt('PrayerWidgetProvider.kt');
const logToday = swift('LogTodayWidget.swift');

describe('android decides dueness at draw time', () => {
  it('has one predicate, and it reads the clock', () => {
    expect(log).toMatch(/private fun isDue\(\s*row: JSONObject\?, describesToday: Boolean, nowMinutes: Int\s*\)/);
    expect(log).toMatch(/return at <= nowMinutes/);
  });

  it('reads the payload flag only as a fallback', () => {
    // Exactly one `due` read left in the file: the one inside isDue that
    // covers an unparseable time or a block about another day.
    const reads = log.match(/optBoolean\("due"/g) ?? [];
    expect(reads).toHaveLength(1);
    expect(log).toMatch(/if \(!describesToday \|\| at < 0\) return row\.optBoolean\("due", false\)/);
  });

  it('feeds the clock to every place that asked the flag', () => {
    // The chips, the footer line, and the countdown's "what is next".
    expect(log).toMatch(/val due = isDue\(row, describesToday, nowMinutes\)/);
    expect(log).toMatch(/if \(isDue\(o, describesToday, nowMinutes\) && status == null/);
    expect(log).toMatch(/if \(!isDue\(o, describesToday, nowMinutes\)\) return o/);
  });

  it('knows which day the block is about', () => {
    // Dueness computed from today's clock is a claim about today. Asserting
    // it over a stale block would offer prayers for logging against a date
    // the user never touched.
    expect(log).toMatch(/val describesToday = dateKey == PrayerWidgetProvider\.todayDateKey\(\)/);
    expect(provider).toMatch(/\n    fun todayDateKey\(\): String \{/);
  });

  it('still gets woken at each boundary', () => {
    // The fix above is worthless without this, and this was worthless
    // without the fix above.
    expect(provider).toMatch(/ACTION_PRAYER_TIME_ELAPSED -> requestUpdate\(context\)/);
    expect(provider).toMatch(/draw\(context\) \{ PrayerWidgetLogProvider\.requestUpdate\(context\) \}/);
    expect(provider).toMatch(/fun armWidgetAlarms/);
  });
});

describe('ios and macos decide dueness per timeline entry', () => {
  it('has the predicate, and it takes the moment to judge against', () => {
    expect(logToday).toMatch(/func logIsDue\(/);
    expect(logToday).toMatch(/at when: Date/);
    expect(logToday).toMatch(/return at <= \(c\.hour \?\? 0\) \* 60 \+ \(c\.minute \?\? 0\)/);
  });

  it('judges against the entry date, not the render time', () => {
    // WidgetKit builds the whole day's entries in one pass, so "now" during
    // construction is the wrong clock for an entry dated four hours out.
    expect(logToday).toMatch(/logIsDue\(p, in: t, at: entry\.date\)/);
  });

  it('reads the payload flag only as a fallback', () => {
    const reads = logToday.match(/\breturn p\.due\b/g) ?? [];
    expect(reads).toHaveLength(2); // unparseable time / not today, and no block
    expect(logToday).not.toMatch(/p\.due \? \.due : \.waiting/);
    expect(logToday).toMatch(/default: return isDue\(p\) \? \.due : \.waiting/);
  });

  it('the footer counts to the next EVENT, not the next loggable chip', () => {
    // The chips are the five, by definition — they are what you tap. The
    // countdown is what is next, which on a phone with the Last Third
    // turned on is the Last Third. Reading the chip list here is what had
    // this card saying "Fajr" beside a Lock Screen counting the forty
    // minutes to it.
    expect(logToday).toMatch(/private func nextEvent\(\)/);
    expect(logToday).toMatch(
      /widgetEvents\(rows: \$0\.rows, sunriseRow: \$0\.sunriseRow, extraRows: \$0\.extraRows\)/,
    );
    expect(logToday).not.toMatch(/first\(where: \{ !isDue\(\$0, t\) \}\)/);
  });

  it('takes the earliest still ahead, not the first in the list', () => {
    // Display order is not the clock: the First Third is listed last and
    // falls that evening, the night marks are listed under the date whose
    // small hours they belong to.
    expect(logToday).toMatch(/\.min\(by: \{ \$0\.0 < \$1\.0 \}\)/);
  });

  it('still emits an entry at every remaining prayer time', () => {
    // Deciding correctly at draw time only helps if something draws.
    expect(logToday).toMatch(/var boundaries: \[Date\] = \[now\]/);
    expect(logToday).toMatch(/boundaries\.append\(d\)/);
    expect(logToday).toMatch(/policy: \.after\(nextMidnight\)/);
  });

  it('wakes at the night marks too, or the countdown cannot leave one', () => {
    expect(logToday).toMatch(/times \+= widgetEvents\(/);
  });
});

describe('the payload still carries the flag', () => {
  // Not dead weight: an older widget binary reading a newer payload — the
  // state of every device between the app updating and the user rebooting
  // — has nothing else to go on.
  it('buildTodayBlock keeps writing due', () => {
    const blocks = readFileSync(path.join(ROOT, 'src', 'widget', 'widgetBlocks.ts'), 'utf8');
    expect(blocks).toMatch(/due: at != null && at\.getTime\(\) <= now\.getTime\(\)/);
  });

  it('and a 24-hour time for the widgets to compare', () => {
    // formatDisplayTime zero-pads and never localises; both native
    // predicates split on ":" and would fail on "1:12 PM".
    const times = readFileSync(path.join(ROOT, 'src', 'utils', 'prayerTimes.ts'), 'utf8');
    expect(times).toMatch(
      /export function formatDisplayTime[\s\S]*?padStart\(2, '0'\)}:\$\{String\(minute\)\.padStart\(2, '0'\)}/,
    );
  });
});
