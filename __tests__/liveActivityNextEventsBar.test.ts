/**
 * The Live Activity's bar shows what is coming, to scale.
 *
 * The Timeline and Markers designs drew the whole solar day — midnight of
 * one night to midnight of the next, six events inside it. A lovely
 * diagram and a poor instrument: nine tenths of it is time you are not
 * waiting for, the interval you actually care about is a sliver, and the
 * night takes the width that would have made the evening legible.
 *
 * It runs from the event just gone to the third one ahead now, with the
 * three gaps drawn to scale against each other — how long is left of this
 * interval, and how that compares with the two after it.
 *
 * Pinned against the Kotlin source, like the widget's countdown contract:
 * there is no unit-test harness on that side of the bridge, and these are
 * the lines that carry the meaning.
 */
import { readFileSync } from 'fs';
import path from 'path';

const module_ = readFileSync(
  path.join(
    __dirname,
    '..',
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'prayer_times',
    'MihrabLiveActivityModule.kt',
  ),
  'utf8',
);

describe('the bar spans the next three events', () => {
  it('reaches three ahead', () => {
    expect(module_).toMatch(/private const val AHEAD = 3/);
    expect(module_).toMatch(/events\.filter \{ it > now \}\.take\(AHEAD\)/);
  });

  it('anchors its left edge on the event just gone', () => {
    // Or nothing would ever be filled, and a progress bar that cannot
    // progress is a picture.
    expect(module_).toMatch(
      /events\.lastOrNull \{ it <= now \} \?: \(upcoming\.first\(\) - 3600_000L\)/,
    );
  });

  it('sizes each gap by the real time in it', () => {
    expect(module_).toMatch(
      /\(marks\[it \+ 1\] - marks\[it\]\)\.coerceAtLeast\(1L\)/,
    );
  });

  it('floors a short gap so it stays visible, and caps the floors', () => {
    // A twelve-minute Maghrib→Isha beside a five-hour Isha→Fajr would
    // otherwise be a hairline; the cap is what keeps the long gaps long.
    expect(module_).toMatch(/val minShare = minOf\(0\.12, 0\.66 \/ n\)/);
  });

  it('counts the night marks the user turned on', () => {
    // The day timeline left them out on purpose — they were not among
    // "the six". This bar is about what is next, and what is next is
    // whatever the toggles say it is.
    expect(module_).toMatch(/private fun datedEvents\(p: JSONObject\): List<Long>/);
    expect(module_).toMatch(/day\.optJSONArray\("extraRows"\)\?\.let \{ extra ->/);
  });

  it('has no whole-day cycle left to fall back to', () => {
    expect(module_).not.toMatch(/buildDayProgressStyle/);
    expect(module_).not.toMatch(/nightMids/);
    expect(module_).not.toMatch(/cycleStart/);
  });
});

describe('which designs use it', () => {
  it('timeline and markers both draw it — the two Android paths', () => {
    const uses = module_.match(/buildNextEventsProgressStyle\(/g) ?? [];
    // The declaration plus the Android 16 and Android 17 call sites.
    expect(uses).toHaveLength(3);
  });

  it('markers is the one that labels every event', () => {
    expect(module_).toMatch(/addPoints = design == "markers"/);
    expect(module_).toMatch(
      /trackerIcon = if \(design == "markers"\) \{/,
    );
  });

  it('countdown keeps its plain linear bar', () => {
    expect(module_).toMatch(/builder\.setProgress\(100, progressPct, false\)/);
  });
});
