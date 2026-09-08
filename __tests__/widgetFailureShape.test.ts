/**
 * What a prayer widget does when something goes wrong — issue #31.
 *
 * The report is a Huawei Nova 11i on 2.17.1 showing "Could not load
 * widget data" on the two widgets this provider draws, while the five
 * that do not use it were fine, and remove-and-re-add not helping. The
 * cause is on that phone and cannot be reproduced here, which is the
 * whole point of this file: the SHAPE of the failure was wrong in three
 * ways that can be fixed without owning the device.
 *
 *  1. The reason was discarded. `catch (_: Exception)` threw away the
 *     one piece of information that existed, in the one process that
 *     had it, and left a user and a maintainer looking at a sentence
 *     with no cause attached.
 *  2. An extra could take the times down. Everything after the six times
 *     — the night line, the streak, the practice grid — shared one
 *     try/catch with them, so any throw in a decoration replaced a
 *     perfectly good prayer card with an error.
 *  3. `Calendar.getInstance()` follows the default locale. On Thai and
 *     Japanese locales that is not a Gregorian year, and the payload's
 *     dateKey always is, so no day would ever match.
 *
 * Plus the tap, reported in the same issue and confirmed by reading the
 * code rather than by reproducing it: the root of these two widgets was
 * a bare MainActivity intent, which is what "opens the app wherever I
 * was before" means.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const PROVIDER = read(
  'android/app/src/main/java/com/prayer_times/PrayerWidgetProvider.kt',
);

describe('a tapped prayer widget has somewhere to go', () => {
  it('opens Today rather than wherever the app was left', () => {
    expect(PROVIDER).toMatch(
      /val click = Intent\(Intent\.ACTION_VIEW, Uri\.parse\("mihrab:\/\/today"\)\)/,
    );
    // Every other widget's root does this too; a bare MainActivity intent
    // in this file is the bug, not a style.
    expect(PROVIDER).not.toMatch(
      /val click = Intent\(context, MainActivity::class\.java\)/,
    );
  });

  it('keeps the link inside this app', () => {
    // An implicit VIEW for a scheme somebody else registers is an app
    // chooser on a home-screen tap.
    const click = PROVIDER.slice(
      PROVIDER.indexOf('val click = Intent(Intent.ACTION_VIEW'),
    ).slice(0, 400);
    expect(click).toMatch(/setPackage\(context\.packageName\)/);
  });
});

describe('when a render fails, it says why', () => {
  it('does not swallow the exception', () => {
    expect(PROVIDER).not.toMatch(/catch \(_: Exception\) \{\s*\n\s*showMessageOnly/);
    expect(PROVIDER).toMatch(/Log\.e\(WIDGET_LOG_TAG, "widget render failed", e\)/);
  });

  it('puts the cause on the card, and only the cause', () => {
    // A screenshot of a broken widget should be a diagnosis. The message
    // is deliberately not shown — it can carry payload content.
    expect(PROVIDER).toMatch(/\$\{e\.javaClass\.simpleName\}/);
    expect(PROVIDER).not.toMatch(/\$\{e\.message\}/);
  });
});

describe('an extra cannot take the times down', () => {
  // From the seam comment, so the first binder has its runCatching
  // ahead of it in the slice like the other three do.
  const AFTER_ROWS = PROVIDER.slice(
    PROVIDER.indexOf('THE TIMES ARE THE PROMISE'),
  );

  it.each([
    'bindNightRow',
    'bindLoggedLine',
    'bindStripHeader',
    'bindPracticeStrip',
  ])('%s is wrapped', (binder: string) => {
    // Each call site sits inside a runCatching, so the practice grid
    // failing costs the grid rather than Maghrib.
    const at = AFTER_ROWS.indexOf(`${binder}(`);
    expect(at).toBeGreaterThan(-1);
    expect(AFTER_ROWS.slice(Math.max(0, at - 120), at)).toMatch(/runCatching \{/);
  });

  it('says which extra failed', () => {
    expect(PROVIDER).toMatch(
      /Log\.w\(WIDGET_LOG_TAG, "widget extra failed: \$what", e\)/,
    );
  });
});

describe('the day the widget thinks it is', () => {
  /** Just this function — the next one down calls Calendar.getInstance(). */
  const fn = (() => {
    const from = PROVIDER.indexOf('fun todayDateKey(): String {');
    const rest = PROVIDER.slice(from);
    // Comments only, stripped: the comment in this very function
    // explains what `Calendar.getInstance()` would do, and an assertion
    // that reads comments is an assertion about prose.
    return rest
      .slice(0, rest.indexOf('\n    }') + 6)
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
  })();

  it('is Gregorian whatever the phone’s locale calendar is', () => {
    expect(fn).toMatch(/java\.util\.GregorianCalendar\(/);
    expect(fn).toMatch(/java\.util\.Locale\.US/);
    // `Calendar.getInstance()` is a BuddhistCalendar on th-TH and a
    // JapaneseImperialCalendar on ja-JP-JP. The payload's dateKey is
    // written by JavaScript and is always Gregorian.
    expect(fn).not.toMatch(/Calendar\.getInstance\(\)/);
  });

  it('still follows the phone’s time zone', () => {
    // Which DAY it is has to be the device's answer; only the calendar
    // system is pinned.
    expect(fn).toMatch(/TimeZone\.getDefault\(\)/);
  });
});

describe('every plural the widgets format has an “other”', () => {
  // `getQuantityString` throws Resources.NotFoundException when the
  // selected quantity has no entry and no `other` to fall back on — and
  // Arabic selects zero/two/few/many where English never does. It would
  // land exactly where #31 lands: inside a widget render, as an
  // exception, on one user's phone and nobody else's.
  const RES = path.join(ROOT, 'android/app/src/main/res');
  const valueDirs = readdirSync(RES).filter(d => d.startsWith('values'));

  it.each(valueDirs)('%s', (dir: string) => {
    let xml = '';
    try {
      xml = read(path.join('android/app/src/main/res', dir, 'strings.xml'));
    } catch {
      return; // Not every values-* dir carries strings.
    }
    const plurals = xml.match(/<plurals name="[^"]+">[\s\S]*?<\/plurals>/g) ?? [];
    for (const block of plurals) {
      const name = /name="([^"]+)"/.exec(block)?.[1];
      expect([name, block.includes('quantity="other"')]).toEqual([name, true]);
    }
  });
});
