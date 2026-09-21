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
  it('is wired to the page, above it and moving with it', () => {
    expect(home).toContain('usePullToRefresh');
    expect(home).toMatch(/<PullIndicator[\s\S]{0,200}translateY=\{pull\.translateY\}/);
    expect(home).toMatch(/transform: \[\{ translateY: pull\.translateY \}\]/);
    expect(home).toMatch(/\{\.\.\.pull\.panHandlers\}/);
  });

  it('knows when the page is at the top, from the scroll it shares', () => {
    // The claim depends on it, and the scroll view is the only thing that
    // knows — so the existing handler carries it rather than a second
    // listener being bolted on.
    expect(home).toMatch(/pull\.onScroll\(e\)/);
    expect(view).toMatch(/atTop\.current = e\.nativeEvent\.contentOffset\.y <= 0/);
  });

  it('reloads the screen after repairing the cache', () => {
    // The cache being right is not the same as the page showing it: the
    // screen is holding times it read before the refresh.
    expect(home).toMatch(/await refreshStoredPrayerData\([\s\S]{0,120}retry\(true\)/);
  });

  it('is never on the Mac, where a pull is not a gesture anybody makes', () => {
    expect(home).toMatch(/pullEnabled = !isMacCatalyst/);
    expect(view).toMatch(/panHandlers: enabled \? responder\.panHandlers : \{\}/);
  });

  it('cannot be started twice, or taken away mid-refresh', () => {
    expect(view).toMatch(/onMoveShouldSetPanResponder:[\s\S]{0,120}!running\.current/);
    expect(view).toMatch(/onPanResponderTerminationRequest: \(\) => !running\.current/);
  });

  it('and puts the page back if the system takes the gesture', () => {
    // A notification shade, an incoming call: not a release.
    expect(view).toMatch(/onPanResponderTerminate: \(\) => \{\s*\n\s*if \(!running\.current\) settle\(0\)/);
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
