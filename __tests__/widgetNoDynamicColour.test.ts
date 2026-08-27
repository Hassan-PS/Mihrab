/**
 * Dynamic colour is gone from the Android widgets. Asked for on
 * 2026-08-27: Material You gave the card whatever hue the wallpaper
 * produced, which on many wallpapers is nothing like the app's accent and
 * on some is barely distinguishable from the card it sits on.
 *
 * "Gone" has to mean four separate things, and the first pass only did
 * two of them — the drawing ignored the flag, and JS stopped sending it,
 * while the widget's OWN configure screen still offered "Dynamic (phone
 * accent)" as a radio button that now did nothing at all. This pins all
 * four, because three of them are in files no TypeScript test would
 * otherwise look at.
 */
import { readFileSync } from 'fs';
import path from 'path';

const repo = (...parts: string[]) =>
  readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const CONFIGURE_ACTIVITY = [
  'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times',
  'PrayerWidgetConfigureActivity.kt',
];
const PROVIDER = [
  'android', 'app', 'src', 'main', 'java', 'com', 'prayer_times',
  'PrayerWidgetProvider.kt',
];
const LAYOUT = [
  'android', 'app', 'src', 'main', 'res', 'layout',
  'activity_prayer_widget_configure.xml',
];

describe('the option is not offered', () => {
  it('the widget configure screen has no Dynamic radio button', () => {
    expect(repo(...LAYOUT)).not.toContain('widget_configure_highlight_dynamic');
  });

  it('the configure screen cannot store "dynamic" as the choice', () => {
    const kt = repo(...CONFIGURE_ACTIVITY);
    expect(kt).not.toContain('R.id.widget_configure_highlight_dynamic');
    expect(kt).not.toMatch(/->\s*"dynamic"/);
  });

  it('saving writes the legacy flag off rather than leaving it', () => {
    // The key stays in the store so a downgrade still finds what it wrote,
    // but the one moment we know the user has looked at this screen is the
    // right moment to stop an old `true` sitting there for ever.
    expect(repo(...CONFIGURE_ACTIVITY)).toMatch(
      /putBoolean\(\s*PrayerWidgetProvider\.PREFS_WIDGET_HIGHLIGHT_DYNAMIC,\s*false,?\s*\)/,
    );
  });

  it('the strings it used are gone from every locale', () => {
    // Left behind, they are 14 translations of a control that no longer
    // exists — and the next person to grep for "dynamic" finds them and
    // wonders what broke.
    const values = repo(
      'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml',
    );
    expect(values).not.toContain('widget_configure_highlight_dynamic');
    expect(values).not.toContain('widget_configure_theme_accent_hint');
  });
});

describe('nothing can draw a wallpaper colour any more', () => {
  it('the provider has no dynamic-accent resolver left to call', () => {
    const kt = repo(...PROVIDER);
    // Deleted rather than left unreachable: an unreachable branch is how
    // this comes back by accident.
    expect(kt).not.toMatch(/fun resolveDynamicHighlightColor/);
    expect(kt).not.toContain('system_accent1_600');
  });

  it('the widget style has no dynamic flag to set', () => {
    expect(repo(...PROVIDER)).not.toContain('useDynamicHighlight');
  });

  it('JS never asks Android for a dynamic highlight', () => {
    const ts = repo('src', 'widget', 'syncWidgetUiHints.ts');
    expect(ts).toMatch(/if \(Platform\.OS === 'android'\) return false;/);
  });
});
