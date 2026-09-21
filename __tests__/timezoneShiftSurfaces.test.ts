/**
 * WHAT THE READER SEES WHEN THE COUNTRY CHANGES ITS CLOCKS — issue #56.
 *
 * The stores are pinned next door. These are the three places the fix has
 * to be visible or it has not happened: the load that must invalidate
 * BEFORE it reads, the banner that explains an hour-wide jump in Fajr, and
 * the refresh button that could not repair anything because it skipped
 * every day it already had.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const hook = read('src', 'hooks', 'usePrayerDay.ts');
const banners = read('src', 'screens', 'home', 'PermissionBanners.tsx');
const home = read('src', 'screens', 'HomeScreen.tsx');
const month = read('src', 'screens', 'MonthTimesScreen.tsx');
const habous = read('src', 'providers', 'habousDataset.ts');
const ifis = read('src', 'providers', 'islamiskaForbundetDataset.ts');
const en = JSON.parse(read('src', 'i18n', 'locales', 'en.json'));

describe('the check happens in front of the load', () => {
  it('is awaited before anything is fetched', () => {
    // The ordering IS the fix: a load that starts first reads exactly the
    // rows the invalidation exists to throw away.
    const at = hook.indexOf('await settleTimezoneShift');
    const fetchAt = hook.indexOf('getOrFetchPrayerTimes({');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(fetchAt);
  });

  it('and the load it guards is the one for this location', () => {
    expect(hook).toMatch(
      /settleTimezoneShift\(\{\s*\n\s*provider,\s*\n\s*latitude,\s*\n\s*longitude,/,
    );
  });

  it('never fails the load over it', () => {
    // Offline when the clocks change: the stored rows still go, and the
    // computed chain answers from the device's own clock.
    expect(hook).toMatch(/settleTimezoneShift\([\s\S]{0,300}\}\)\.catch\(\(\) => null\)/);
  });
});

describe('the dataset is re-downloaded rather than re-polled', () => {
  it('on both published tables, because no country owns this', () => {
    for (const src of [habous, ifis]) {
      expect(src).toMatch(/nextIndexPollAt = 0/);
      expect(src).toMatch(/removeItem\(/);
      expect(src).toMatch(/await downloadCity\(/);
    }
    expect(habous).toContain('refetchHabousDatasetNow');
    expect(ifis).toContain('refetchIslamiskaForbundetDatasetNow');
  });

  it('which is the six hours the report waited', () => {
    // The polite path asks index.json at most every six hours, and only
    // while a lookup is happening. That is right for a builder quietly
    // accumulating another Hijri month and wrong for a country that has
    // just moved.
    const config = read('src', 'config', 'datasets.ts');
    expect(config).toMatch(/HABOUS_INDEX_POLL_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/);
  });
});

describe('the banner that explains the hour', () => {
  it('says what changed, in the words of the announcement', () => {
    expect(banners).toContain('home.timezoneShiftNotice');
    expect(banners).toContain('formatUtcOffset');
    expect(en.home.timezoneShiftNotice).toContain('{{from}}');
    expect(en.home.timezoneShiftNotice).toContain('{{to}}');
  });

  it('is dismissible, and above the notices about how data was obtained', () => {
    expect(banners).toMatch(/timezoneShift &&[\s\S]{0,900}onDismissTimezoneShift/);
    expect(banners.indexOf('timezoneShift &&')).toBeLessThan(
      banners.indexOf('{usingLocalFallback &&'),
    );
  });

  it('and dismissing one does not silence the next', () => {
    // Keyed by when it was noticed: a reader who dismisses September's
    // shift still hears about the next one.
    expect(home).toMatch(/state\.timezoneShift\.at !== tzNoticeDismissedAt/);
    expect(home).toContain('clearTimezoneShiftNotice()');
  });

  it('clears the space above it, like every other banner there', () => {
    expect(home).toMatch(/timezoneShift != null;/);
  });
});

describe('"Refresh stored data" can now repair', () => {
  // The action itself moved into `refreshStoredPrayerData` once three
  // surfaces came to ask for it — the month button, a row in Settings and
  // a pull on Home. Three copies of a three-step repair is three chances
  // to drift.
  const action = read('src', 'prayer', 'refreshStoredData.ts');

  it('re-downloads the table, drops the month, then fills', () => {
    const order = ['refetchDatasetFor', 'refetchStoredMonths', 'refreshPrayerDataCache'];
    let at = -1;
    for (const step of order) {
      const next = action.indexOf(`await ${step}`);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
  });

  it('and the month button asks for the month it is showing', () => {
    expect(month).toMatch(/refreshStoredPrayerData\(cacheParams, \{/);
    expect(month).toMatch(/month: new Date\(viewYear, viewMonth, 1\)/);
  });

  it('bounded to one month of re-fetching, not a year of requests', () => {
    expect(action).toMatch(/refetchStoredMonths\(params, \[monthKeyOf\(month\)\]\)/);
  });
});

describe('the string, in every language', () => {
  const locales = ['en', 'ar', 'sv', 'de', 'es', 'fr', 'hi', 'bn', 'id', 'ru', 'tr', 'ur', 'zh'];
  it.each(locales)('%s has it, keeps the offsets, and is not English', loc => {
    const json = JSON.parse(read('src', 'i18n', 'locales', `${loc}.json`));
    const value = json.home.timezoneShiftNotice;
    expect(value).toBeTruthy();
    expect(value).toContain('{{from}}');
    expect(value).toContain('{{to}}');
    if (loc !== 'en') expect(value).not.toBe(en.home.timezoneShiftNotice);
  });
});
