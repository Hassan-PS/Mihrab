/**
 * A countdown that reaches zero has to be met by a refresh.
 *
 * Reported as "the countdown to the next prayer can be wrong before Fajr",
 * which is the one window where two separate holes lined up.
 *
 * The DISPLAY has wrapped past midnight for a while: after Isha there is no
 * row left today, so every card counts down to tomorrow's first prayer
 * instead of showing nothing. Good. But `nextBoundaryMillis` — the thing
 * that decides when to wake up next — did not wrap. It looked only at
 * today's rows, found nothing ahead, and returned null, so no boundary
 * alarm was armed at all between Isha and midnight.
 *
 * And the alarm it does arm was `setExact(RTC, …)`. `RTC` does not wake the
 * device, and Doze defers even an exact alarm. Fajr is the hour a phone is
 * most reliably asleep, so the boundary that most needed to land was the
 * one that could not.
 *
 * Together: the card counted down to Fajr, hit zero, kept going, and went
 * on naming a prayer that had already been called until somebody picked the
 * phone up. Both halves are pinned here, because either one alone leaves
 * the bug.
 */
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const KT = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times');
const provider = readFileSync(path.join(KT, 'PrayerWidgetProvider.kt'), 'utf8');
const log = readFileSync(path.join(KT, 'PrayerWidgetLogProvider.kt'), 'utf8');

describe('the next boundary is found even when today has none left', () => {
  it('wraps to the first prayer of the next day in the window', () => {
    expect(provider).toMatch(/val tomorrow = dayAfter\(o, todayDateKey\(\)\)/);
    expect(provider).toMatch(/private fun dayAfter\(o: JSONObject, key: String\): JSONObject\?/);
    expect(provider).toMatch(/return at\(first, 1\)/);
  });

  it('falls back to today\'s own first row rather than to nothing', () => {
    // A legacy payload with no `days[]` window still has to wake up.
    expect(provider).toMatch(/\?: boundaryMinutes\(today, o\)\.minOrNull\(\)/);
  });

  it('builds tomorrow by rolling the calendar, not by adding 24 hours', () => {
    // On the two nights a year the clocks move, those differ by an hour —
    // and one of those nights the alarm would land after Fajr.
    expect(provider).toMatch(/add\(java\.util\.Calendar\.DAY_OF_MONTH, daysAhead\)/);
    expect(provider).not.toMatch(/\+ 24 \* 60 \* 60 \* 1000/);
  });

  it('wakes at the night boundaries too, now that they can be the headline', () => {
    // The same bug in the other direction. These rows used to be skipped
    // everywhere the widget looked for its next moment, which was right
    // while they could not be the headline and wrong the moment they could:
    // a card that says "Last Third" has to be woken when the Last Third
    // arrives, or it sits on "Isha" until something else happens to it.
    expect(provider).toMatch(
      /\(day\?\.optJSONArray\("extraRows"\) \?: root\.optJSONArray\("extraRows"\)\)/,
    );
    expect(provider).not.toMatch(
      /if \(isNightKey\(row\.optString\("key"\)\)\) continue/,
    );
  });
});

describe('the alarm can actually fire at that moment', () => {
  it('wakes the device and pierces Doze', () => {
    expect(provider).toMatch(
      /am\.setExactAndAllowWhileIdle\(android\.app\.AlarmManager\.RTC_WAKEUP, next, pi\)/,
    );
    expect(provider).toMatch(
      /am\.setAndAllowWhileIdle\(android\.app\.AlarmManager\.RTC_WAKEUP, next, pi\)/,
    );
  });

  it('no longer arms the boundary with a non-waking alarm', () => {
    expect(provider).not.toMatch(/setExact\(android\.app\.AlarmManager\.RTC,/);
  });

  it('keeps exactly one outstanding, re-armed by the refresh it triggers', () => {
    // The bound on the cost. requestUpdate arms; the alarm calls
    // requestUpdate; nothing accumulates.
    expect(provider).toMatch(/ACTION_PRAYER_TIME_ELAPSED -> requestUpdate\(context\)/);
    expect(provider).toMatch(/fun requestUpdate\(context: Context\) \{[\s\S]*?armWidgetAlarms\(context\)/);
    const requestCodes = provider.match(/context, 100[12], intent,/g) ?? [];
    expect(requestCodes).toHaveLength(2); // boundary + midnight, one each
  });
});

describe('when it fires, every widget is redrawn', () => {
  // The countdown lives on three different cards. A refresh that reaches
  // only the one that armed the alarm is the same bug with a smaller
  // blast radius.
  it.each([
    'PrayerWidgetLogProvider',
    'PrayerWidgetStreakProvider',
    'PrayerWidgetReadingProvider',
    'PrayerWidgetHijriProvider',
    'PrayerWidgetTasbihProvider',
  ])('%s is redrawn from the one entry point', kind => {
    expect(provider).toMatch(new RegExp(`draw\\(context\\) \\{ ${kind}\\.requestUpdate\\(context\\) \\}`));
  });

  it('and so are the three prayer-times classes', () => {
    expect(provider).toMatch(/PrayerWidgetProvider::class\.java,\s*PrayerWidgetSmallProvider::class\.java,\s*PrayerWidgetLargeProvider::class\.java/);
  });
});

describe('ios and macos already meet the same contract', () => {
  // Nothing to fix here, and that is worth pinning: WidgetKit is told the
  // moment of every future prayer in the window, tomorrow's Fajr included,
  // so the entry that redraws the card is already scheduled for the instant
  // its countdown reaches zero. There is no alarm to wake, and no Doze to
  // pierce — the OS holds the timeline. If this ever collapses to a single
  // entry with a periodic policy, the Android bug arrives on iOS.
  const swift = readFileSync(
    path.join(ROOT, 'ios', 'PrayerWidgetExtension', 'PrayerWidgetExtension.swift'),
    'utf8',
  );

  it('puts an entry at every future prayer across the whole window', () => {
    expect(swift).toMatch(/for p in prayers where p\.date > now \{ boundarySet\.insert\(p\.date\) \}/);
    // Flattened from every day in days[], not just today — which is what
    // makes tomorrow's Fajr one of them — and from every EVENT of each
    // day, not just its five salāh, or the card cannot count down to a
    // night mark the user turned on and cannot wake to leave one.
    expect(swift).toMatch(
      /for info in dayInfos \{\s*let dayEvents = widgetEvents\(\s*rows: info\.day\.rows,\s*sunriseRow: info\.day\.sunriseRow,\s*extraRows: info\.day\.extraRows,?\s*\)/,
    );
  });

  it('takes the earliest event still ahead, not the next row in the list', () => {
    // Display order is not the clock — the same rule the Android providers
    // learned. `computeDynamicNext` walks the whole event list by minute.
    expect(swift).toMatch(
      /if let next = dated\.filter\(\{ \$0\.0 > currentMinutes \}\)\.min\(by: \{ \$0\.0 < \$1\.0 \}\)/,
    );
  });

  it('rolls the rows at each day start too', () => {
    expect(swift).toMatch(/for info in dayInfos where info\.date > now \{ boundarySet\.insert\(info\.date\) \}/);
  });
});

describe('the cards agree on what they are counting to', () => {
  it('the prayer strip wraps past midnight', () => {
    expect(provider).toMatch(/firstRowMinutes\(displayRows\)\?\.let \{ it \+ 24 \* 60 - currentMinutes \}/);
  });

  it('the log card wraps to tomorrow\'s first prayer', () => {
    expect(log).toMatch(/val fajr = tomorrowFirstPrayer\(root, todayKey\)/);
  });

  it('both hand the view an instant, so the tick costs nothing', () => {
    expect(provider).toMatch(/setChronometerCountDown\(R\.id\.widget_remaining, true\)/);
    expect(log).toMatch(/setChronometerCountDown\(R\.id\.widget_log_remaining, true\)/);
  });

  it('the log card counts to whatever the user turned on, not just the five', () => {
    // Its chips are the five loggable prayers. Its countdown is not: it
    // reads the day's full event list out of the payload window, so a phone
    // with the Last Third on does not read "Fajr · in 5:12" beside a Lock
    // Screen counting the forty minutes to the Last Third.
    expect(log).toMatch(/private fun eventsOf\(day: JSONObject\?\): List<JSONObject>/);
    expect(log).toMatch(/day\.optJSONObject\("sunriseRow"\)\?\.let \{ out\.add\(it\) \}/);
    expect(log).toMatch(/nextEvent\(events, currentMinutes\)/);
  });

  it('and both take the earliest thing ahead, not the first one listed', () => {
    // Display order is not the clock. Islamic Midnight and the Last Third
    // are drawn after Isha and belong to the small hours of the same date;
    // the First Third is drawn last and falls that evening. A walk that
    // stopped at the first row later than now would answer "Isha" at nine
    // with the First Third half an hour away.
    expect(provider).toMatch(
      /nextUpdateMinutes < 0 \|\| rowMinutes < nextUpdateMinutes/,
    );
    expect(log).toMatch(/if \(bestAt < 0 \|\| at < bestAt\)/);
  });
});
