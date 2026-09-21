/**
 * THREE WAYS TO ASK FOR THE SAME REFRESH.
 *
 * The month table has had a button for it. Settings → Prayer times now has
 * a row, and the Home page has a pull. They must be one action — not three
 * implementations of a three-step repair, which is three chances to drift
 * and, after issue #56, three chances to quietly go back to filling gaps
 * instead of replacing what is wrong.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const action = read('src', 'prayer', 'refreshStoredData.ts');
const home = read('src', 'screens', 'HomeScreen.tsx');
const settings = read('src', 'screens', 'settings', 'DataSourceCard.tsx');
const month = read('src', 'screens', 'MonthTimesScreen.tsx');
const view = read('src', 'screens', 'home', 'PullToRefresh.tsx');
const en = JSON.parse(read('src', 'i18n', 'locales', 'en.json'));

describe('one action, asked for from three places', () => {
  it('each surface calls it rather than rebuilding it', () => {
    for (const src of [home, settings, month]) {
      expect(src).toContain('refreshStoredPrayerData');
      // None of them reaches past it to the steps underneath.
      expect(src).not.toMatch(/refetchStoredMonths\(/);
      expect(src).not.toMatch(/refreshPrayerDataCache\(/);
    }
  });

  it('and reports its progress, because it is not a quick thing', () => {
    expect(action).toMatch(/onProgress\?:/);
    for (const src of [home, settings, month]) {
      expect(src).toMatch(/onProgress/);
    }
  });
});

describe('the pull on Home', () => {
  it('moves the page on the UI thread, not through JavaScript', () => {
    // The first version drove the pull from a PanResponder — every touch a
    // round trip through the JS thread, which on Home is not idle. It was
    // reported as very laggy, and it was.
    // (Named in the file's history note, so it is the IMPORT that must go.)
    expect(view).not.toMatch(/PanResponder[,\s]*\n?[^*]*from 'react-native'/);
    expect(view).not.toMatch(/PanResponder\.create/);
    expect(view).toContain('PanGestureHandler');
    expect(view).toMatch(/translationY: store\.drag[\s\S]{0,60}useNativeDriver: true/);
    // And the page's transform is the curve over that native value.
    expect(view).toMatch(/transform: \[\{ translateY: store\.translate \}\]/);
    expect(view).toMatch(/this\.drag\.interpolate\(/);
  });

  it('never makes HomeScreen render while a pull is in progress', () => {
    // HomeScreen holds a store, not state, and reads nothing from it that
    // a pull changes. The two small components that DO read it subscribe
    // themselves (`useSyncExternalStore`).
    expect(home).toMatch(/const pull = usePullToRefresh\(onPullRefresh\)/);
    expect(home).not.toMatch(/pull\.(phase|progress|translate)/);
    const hook = view.slice(
      view.indexOf('export function usePullToRefresh'),
      view.indexOf('function usePull('),
    );
    expect(hook).not.toMatch(/useState/);
    expect(view).toContain('useSyncExternalStore');
  });

  it('wraps the page as it is, so reaching the top does not render it', () => {
    expect(home).toMatch(/<PullToRefreshFrame[\s\S]{0,160}store=\{pull\}/);
    expect(home).toMatch(/<\/ScrollView>\s*\n\s*<\/PullToRefreshFrame>/);
  });

  it('is only a pull at the top, and the scroll view waits for it', () => {
    expect(view).toMatch(/enabled=\{enabled && atTop && !running\}/);
    expect(view).toMatch(/<NativeViewGestureHandler waitFor=\{pan\}>/);
    expect(home).toMatch(/pull\.onScroll\(e\)/);
    expect(view).toMatch(/atTop: e\.nativeEvent\.contentOffset\.y <= 0/);
  });

  it('reloads the screen after repairing the cache', () => {
    // The cache being right is not the same as the page showing it: the
    // screen is holding times it read before the refresh.
    expect(home).toMatch(/await refreshStoredPrayerData\([\s\S]{0,120}retry\(true\)/);
  });

  it('is never on the Mac, where a pull is not a gesture anybody makes', () => {
    expect(home).toMatch(/pullEnabled = !isMacCatalyst/);
  });

  it('treats the system taking the gesture as a cancel, not a release', () => {
    // A notification shade, an incoming call.
    expect(view).toMatch(/e\.nativeEvent\.state === State\.END/);
  });
});

describe('the row in Settings', () => {
  it('sits with the source it refreshes, and says how much is stored', () => {
    expect(settings).toContain('settings-refresh-stored');
    expect(settings).toContain('getCacheStatus');
    expect(settings).toContain('month.monthsStored');
  });

  it('uses the month table\'s own words for the same action', () => {
    expect(settings).toContain("t('month.refreshData'");
  });

  it('and does nothing when there is no location to refresh for', () => {
    // (0, 0) is the "no location set" sentinel; fetching for it hits the
    // middle of the Atlantic.
    expect(settings).toMatch(/const located =/);
    expect(settings).toMatch(/\{located \?[\s\S]{0,200}settings-refresh-stored/);
  });
});

describe('the strings it needs, in every language', () => {
  const KEYS = ['pullToRefresh', 'pullRelease', 'pullRefreshing'];
  const locales = ['en', 'ar', 'sv', 'de', 'es', 'fr', 'hi', 'bn', 'id', 'ru', 'tr', 'ur', 'zh'];

  it.each(locales)('%s has them, and none is the English one', loc => {
    const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
    for (const key of KEYS) {
      expect(json.home[key]).toBeTruthy();
      if (loc !== 'en') expect(json.home[key]).not.toBe(en.home[key]);
    }
    expect(json.settings.refreshStoredHelp).toBeTruthy();
  });

  it('and the progress line beside them is a verb, not an adjective', () => {
    // `month.refreshing` is shown as "Refreshing… 40%" in the Settings row
    // and on the month button. Six locales had the ADJECTIVE — "Erfrischend",
    // "Refrescante", "Rafraîchissant" — which is a machine translation of
    // the word rather than of the message.
    const wrong: Record<string, string> = {
      de: 'Erfrischend',
      es: 'Refrescante',
      fr: 'Rafraîchissant',
      ru: 'Освежающий',
      zh: '清爽',
    };
    for (const [loc, bad] of Object.entries(wrong)) {
      const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
      expect(json.month.refreshing).not.toContain(bad);
    }
  });
});
