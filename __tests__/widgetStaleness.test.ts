/**
 * The two ways a widget goes stale, and what actually stops each.
 *
 * ── macOS: replacing the app freezes every card, and no code we ship
 *    prevents it ─────────────────────────────────────────────────────
 *
 * WidgetKit archives each widget's timeline AND its gallery preview to
 * disk, and chronod validates those archives against the bundle that
 * produced them. Replace the app in place and every reload fails with
 *
 *   bundleStubNotSupported("Bundle version did not match;
 *                           LaunchServices DB may need to be rebuilt")
 *
 * and it does not recover — retries were watched being pushed out an hour,
 * then a full day, while every card kept drawing the archive from before
 * the upgrade. Measured on 2026-08-28.
 *
 * It was TEMPTING to blame our own `Text("some_key")` calls: a
 * `LocalizedStringKey` is resolved at draw time, so the archive holds the
 * key plus a bundle reference, which is exactly the shape of thing the
 * error names. That theory was tested and is WRONG. Two consecutive builds
 * with every label resolved to a plain String beforehand — no keys, no
 * bundle references — froze on upgrade just the same: 56 failures, zero
 * archives rewritten. The stub is WidgetKit's reference to the extension
 * bundle itself, and nothing in the view can avoid it.
 *
 * What does clear it, measured both times: restarting chronod. What does
 * NOT, despite the error message saying so: `lsregister -f -R`. So the fix
 * lives in the Homebrew cask, which is the only place that runs code at
 * the moment the app is replaced — hence the postflight test below.
 *
 * ── Android: a kind nothing tells is a kind that never redraws ────────
 *
 * Every kind but the prayer-times ones has `updatePeriodMillis="0"`, so
 * the system never redraws them on its own. `requestUpdate` fans out to
 * all six; the module used to name five of them AGAIN afterwards, so four
 * redrew twice per payload and the Log widget — the one that list forgot —
 * was quietly depending on the fan-out it was written to duplicate.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const ANDROID = path.join(__dirname, '..', 'android', 'app', 'src', 'main');
const KT = path.join(ANDROID, 'java', 'com', 'prayer_times');

describe('android tells every widget kind, exactly once', () => {
  const provider = readFileSync(
    path.join(KT, 'PrayerWidgetProvider.kt'), 'utf8',
  );
  const module = readFileSync(
    path.join(KT, 'PrayerWidgetModule.kt'), 'utf8',
  );

  const KINDS = [
    'PrayerWidgetLogProvider',
    'PrayerWidgetStreakProvider',
    'PrayerWidgetReadingProvider',
    'PrayerWidgetHijriProvider',
    'PrayerWidgetTasbihProvider',
  ];

  it.each(KINDS)('the fan-out redraws %s', kind => {
    expect(provider).toMatch(
      new RegExp(`draw\\(context\\) \\{ ${kind}\\.requestUpdate`),
    );
  });

  it('a new payload asks for one fan-out and nothing else', () => {
    // Not five more calls after it. Four of those redrew a second time, and
    // the list forgot the one kind with no other way to be woken.
    const body = module.slice(
      module.indexOf('fun setData('),
      module.indexOf('fun setAndroidWidgetAppearance('),
    );
    expect(body).toContain('PrayerWidgetProvider.requestUpdate');
    for (const kind of KINDS) {
      expect(body).not.toContain(`${kind}.requestUpdate`);
    }
  });

  it('the kinds Android never redraws on its own are all in the fan-out', () => {
    // `updatePeriodMillis="0"` means being in the fan-out is the ONLY thing
    // keeping them current.
    const xmlDir = path.join(ANDROID, 'res', 'xml');
    const manual = readdirSync(xmlDir)
      .filter(f => f.startsWith('prayer_widget_'))
      .filter(f =>
        /updatePeriodMillis="0"/.test(readFileSync(path.join(xmlDir, f), 'utf8')),
      );
    // Hijri, Log, Log tall, Reading, Streak, Tasbih.
    expect(manual.length).toBeGreaterThanOrEqual(6);
    expect(provider).toContain('ALL_WIDGET_CLASSES');
  });
});

describe('ios asks for a redraw without being throttled', () => {
  const reloader = readFileSync(
    path.join(__dirname, '..', 'ios', 'PrayerApp', 'WidgetTimelineReloader.swift'),
    'utf8',
  );
  const bridge = readFileSync(
    path.join(__dirname, '..', 'ios', 'PrayerApp', 'PrayerWidget.m'),
    'utf8',
  );

  it('coalesces a burst instead of firing five reloads at once', () => {
    // WidgetKit drops these — "ExternalRequestTimelineReloadFilter -
    // throttled reload" — and retries on its own schedule, so the write
    // that prompted the redraw is not what gets drawn.
    expect(reloader).toContain('reloadAllTimelinesIfAvailable');
    expect(reloader).toMatch(/private static let window/);
    expect(reloader).toContain('trailingScheduled');
  });

  it('leaves the queue drains uncoalesced', () => {
    // The card is drawing those taps twice until it redraws; a second of
    // lag there reads as broken rather than as slow.
    expect(reloader).toContain('reloadAllTimelinesNow');
    const drains = bridge.split('takeLogQueue')[1] ?? '';
    expect(drains).toContain('reloadAllTimelinesNow');
  });

  it('flushes the group defaults before asking for the redraw', () => {
    // The extension is a separate process with its own view of the group
    // container. Every other writer in that file already synchronized.
    const setData = bridge.slice(
      bridge.indexOf('RCT_EXPORT_METHOD(setData'),
      bridge.indexOf('takeLogQueue'),
    );
    expect(setData).toContain('[store synchronize]');
  });
});

describe('the macOS cask restarts the widget daemon after an upgrade', () => {
  // The tap is a sibling checkout, not part of this repo, so this test
  // states what it needs and skips rather than failing on a machine that
  // does not have it. `verify-release.sh` checks the published cask, where
  // being absent is not something to be relaxed about.
  const cask = path.join(os.homedir(), 'git', 'homebrew-tap', 'Casks', 'mihrab.rb');

  (existsSync(cask) ? it : it.skip)(
    'carries the postflight that clears the frozen archives',
    () => {
      const src = readFileSync(cask, 'utf8');
      expect(src).toContain('postflight');
      expect(src).toContain('chronod');
      // Never `must_succeed: true` — a Mac with no chronod running is not
      // a failed install.
      expect(src).toContain('must_succeed: false');
    },
  );
});
