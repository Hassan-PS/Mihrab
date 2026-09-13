/**
 * The table turns both ways, and says which day it shows in words.
 *
 * The week strip only looked forward — "back-logging a missed prayer
 * belongs to the Log tab" — and the reader who missed Asr yesterday had
 * to leave the screen to say so. Now the pages run a week back as well
 * as a week ahead; the strip is a line — the weekday, both dates, and a
 * mark that says "Today" until the table has been swiped off it, when it
 * becomes the way back. And the rows sit on the page's own edges, not on
 * the card's that is no longer there.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { cachedDaysBefore, PAST_DAYS } from '../src/prayer/widgetDayWindow';

const mockDataset = jest.fn();
const mockMany = jest.fn();
jest.mock('../src/prayer/prayerStorage', () => ({
  // The device-only readers: the dataset rung per day, then the cache
  // ONCE for every day the dataset did not have. Never a fetch.
  getDatasetPrayerTimesOrNull: (...a: unknown[]) => mockDataset(...a),
  getCachedPrayerTimesMany: (...a: unknown[]) => mockMany(...a),
}));

const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

/** A cache that holds the days for which `has(date)` is true. */
const cacheWith = (has: (d: Date) => boolean) =>
  mockMany.mockImplementation(async (_p: unknown, dates: Date[]) =>
    dates.map(d => (has(d) ? { Fajr: `0${d.getDate()}:00` } : null)),
  );

describe('the days behind today', () => {
  const params = {
    provider: 'aladhan' as never,
    latitude: 59.33,
    longitude: 18.07,
    calculationMethod: 3 as never,
    school: 0 as never,
  };
  const now = new Date(2026, 8, 9, 12, 0);

  beforeEach(() => {
    mockDataset.mockReset();
    mockMany.mockReset();
    mockDataset.mockResolvedValue(null);
  });

  it('come from the cache alone, nearest first, and stop at the first gap', async () => {
    cacheWith(d => d.getDate() >= 5);
    const past = await cachedDaysBefore(params, now);
    expect(past.map(d => d.Fajr)).toEqual(['08:00', '07:00', '06:00', '05:00']);
    // Never a fetch: the only thing asked is the cache — and asked ONCE,
    // for the whole week behind, not once per day. The loop this replaced
    // parsed the ~170 KB blob seven times to learn what one parse tells.
    expect(mockMany).toHaveBeenCalledTimes(1);
    expect((mockMany.mock.calls[0][1] as Date[]).map(d => d.getDate())).toEqual([
      8, 7, 6, 5, 4, 3, 2,
    ]);
  });

  it('reach a week back at most', async () => {
    cacheWith(() => true);
    const past = await cachedDaysBefore(params, now);
    expect(past).toHaveLength(PAST_DAYS);
    expect(PAST_DAYS).toBe(7);
  });

  it('treat a cache that throws as a cache that has nothing', async () => {
    mockMany.mockRejectedValue(new Error('disk'));
    await expect(cachedDaysBefore(params, now)).resolves.toEqual([]);
  });

  it('read the dataset rung first, and the cache only for what it lacks', async () => {
    // A Swedish reader: the dataset has the two nearest days, the cache
    // the two before that, and nothing holds the fifth. The dataset is
    // asked per day (memoised, free after the first), the cache once
    // for exactly the days the dataset did not answer — and the result
    // is still one gapless run, nearest first.
    mockDataset.mockImplementation(async ({ date }: { date: Date }) =>
      date.getDate() >= 7 ? { Fajr: `ds-${date.getDate()}` } : null,
    );
    cacheWith(d => d.getDate() === 5 || d.getDate() === 6);
    const past = await cachedDaysBefore(params, now);
    expect(past.map(d => d.Fajr)).toEqual(['ds-8', 'ds-7', '06:00', '05:00']);
    expect(mockDataset).toHaveBeenCalledTimes(7);
    expect(mockMany).toHaveBeenCalledTimes(1);
    expect((mockMany.mock.calls[0][1] as Date[]).map(d => d.getDate())).toEqual([
      6, 5, 4, 3, 2,
    ]);
  });

  it('read through the dataset rung, which the cache never holds', () => {
    // The two dataset providers are served before the cache and never
    // written to it — a cache-only reader saw nothing for them.
    const src = readFileSync(join(__dirname, '..', 'src/prayer/widgetDayWindow.ts'), 'utf8');
    expect(src).toMatch(/getDatasetPrayerTimesOrNull\(\{ \.\.\.params, date \}\)/);
    const storage = readFileSync(join(__dirname, '..', 'src/prayer/prayerStorage.ts'), 'utf8');
    const fn = storage.slice(storage.indexOf('export async function getStoredPrayerTimes'), storage.indexOf('export async function getOrFetchPrayerTimes'));
    expect(fn).toMatch(/getIslamiskaForbundetDatasetTimes/);
    expect(fn).toMatch(/getHabousDatasetTimes/);
    expect(fn).toMatch(/return getCachedPrayerTimes\(params\);/);
    expect(fn).not.toMatch(/fetchWithLocalLastResort/);
  });
});

describe('the pages', () => {
  const card = read('src/screens/home/TodayCard.tsx');

  it('run from the oldest past day through the week, opening where the day says', () => {
    expect(card).toMatch(/pastDays\.slice\(\)\.reverse\(\)\.concat\(week\)/);
    expect(card).toMatch(/const todayIndex = pastDays\.length;/);
    // Today, until today is spent, and then tomorrow — see
    // `dayRollsOverAfterLastTime.test.tsx` for the rule itself.
    expect(card).toMatch(/initialScrollIndex=\{todayIndex \+ landedAtMount\}/);
    expect(card).toMatch(/renderDay\(index - todayIndex\)/);
  });

  it('keep the selection as an offset from today, negative behind it', () => {
    expect(card).toMatch(/const offset = page - todayIndex;/);
    expect(card).toMatch(/Math\.max\(-pastDays\.length, Math\.min\(week\.length - 1, offset\)\)/);
    expect(card).toMatch(/offset < 0 \? pastDays\[-offset - 1\] : week\[offset\]/);
  });

  it('have no week strip', () => {
    expect(card).not.toMatch(/DayStrip/);
    expect(() => readFileSync(join(__dirname, '..', 'src/screens/home/DayStrip.tsx'))).toThrow();
  });
});

describe('the day bar', () => {
  const card = read('src/screens/home/TodayCard.tsx');
  const home = read('src/screens/HomeScreen.tsx');
  const bar = card.slice(
    card.indexOf('<View style={styles.dayBar}>'),
    card.indexOf('onLayout={onTableLayout}'),
  );

  it('says the weekday and both dates of the day on show', () => {
    // …except for the one day the card turned to by itself, which is named
    // "Tomorrow" rather than by its weekday — see
    // `dayRollsOverAfterLastTime.test.tsx`.
    expect(bar).toMatch(/getWeekday\(selected\)/);
    expect(bar).toMatch(/\{getDayDate\(selected\)\}/);
    expect(bar).toMatch(/getHijriDate\(selected\)/);
    // The weekday is the weekday, today included — "Today" is the dot's word.
    expect(home).toMatch(/const getWeekday = useCallback\([\s\S]*?weekday: 'long'/);
  });

  it('steps a day at each edge, and stops at the ends of the record', () => {
    expect(bar).toMatch(/log\.previousDay[\s\S]*?handleSelect\(selected - 1\)/);
    expect(bar).toMatch(/log\.nextDay[\s\S]*?handleSelect\(selected \+ 1\)/);
    expect(bar).toMatch(/disabled=\{!canGoBack\}/);
    expect(bar).toMatch(/disabled=\{!canGoForward\}/);
    expect(card).toMatch(/const canGoBack = selected > -pastDays\.length;/);
    expect(card).toMatch(/const canGoForward = selected < week\.length - 1;/);
    // The chevrons are drawn, not typed, and they mirror in RTL.
    expect(bar).toMatch(/<Chevron back=\{!rtl\}/);
    expect(bar).toMatch(/<Chevron back=\{rtl\}/);
  });

  /**
   * Nothing in the bar is a box: the step arrows are a stroked path with
   * a hit slop, and the way back is a word in the accent. They were a
   * quotation-mark glyph inside a filled circle.
   */
  it('draws the arrows as ink rather than buttons', () => {
    expect(card).toMatch(/const CHEVRON_SIZE = 20;/);
    expect(card).toMatch(/strokeWidth=\{1\.75\}/);
    expect(card).toMatch(/strokeLinecap="round"/);
    expect(card).toMatch(/dayStep: \{ padding: SPACING\.xs/);
    // No fill, no radius, on any part of the bar.
    const bar_styles = card.slice(card.indexOf('  dayBar: {'), card.indexOf('  tableBleed:'));
    expect(bar_styles).not.toMatch(/backgroundColor/);
    expect(bar_styles).not.toMatch(/borderRadius: RADIUS\.full/);
    expect(bar).not.toMatch(/palette\.controlBg/);
    expect(bar).not.toMatch(/palette\.accentBg/);
  });

  it('marks today with a dot, and is the way back once the table has left it', () => {
    expect(bar).toMatch(/disabled=\{onToday\}/);
    expect(bar).toMatch(/onPress=\{\(\) => handleSelect\(0\)\}/);
    expect(bar).toMatch(/onToday \?[\s\S]*?styles\.todayDot/);
    expect(bar).toMatch(/home\.backToToday/);
    expect(card).toMatch(/const onToday = selected === 0;/);
  });

  it('names yesterday for the sheet and for screen readers', () => {
    expect(home).toMatch(/if \(dayOffset === -1\) return t\('home\.yesterday'\);/);
    for (const l of ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh']) {
      const h = JSON.parse(readFileSync(join(__dirname, '..', `src/i18n/locales/${l}.json`), 'utf8')).home;
      expect(typeof h.yesterday).toBe('string');
      expect(typeof h.backToToday).toBe('string');
    }
  });

  it('no longer repeats today’s date under the countdown', () => {
    expect(card).not.toMatch(/dateLine/);
  });

  /**
   * A tablet held upright: the hero must not grow into the page's slack,
   * and the day must sit in the middle of the page rather than the sky
   * filling it — see HOME_ROOMY_MIN_HEIGHT.
   */
  it('stops the hero growing on a roomy page, and centres the day', () => {
    expect(home).toMatch(/const isRoomy =[\s\S]*?screenWidth >= BREAKPOINT_REGULAR &&[\s\S]*?screenHeight >= HOME_ROOMY_MIN_HEIGHT/);
    expect(home).toMatch(/!isRoomy && styles\.fillColumn/);
    expect(home).toMatch(/scrollContentRoomy: \{[\s\S]*?justifyContent: 'center'/);
    expect(home).toMatch(/roomy=\{isRoomy\}/);
    expect(card).toMatch(/roomy\s*\?\s*styles\.cardRoomy\s*:\s*styles\.cardBleed/);
    expect(card).toMatch(/const roomyHeroHeight = roomy/);
    // The status bar is the page's on a roomy page, not the sky's — and
    // not the sky's either when a banner is above the hero (#41 follow-up).
    expect(card).toMatch(
      /const underStatusBar = fullBleed && !roomy && !bannerAbove;/,
    );
    expect(card).toMatch(/ownsStatusBar=\{underStatusBar\}/);
  });
});

describe('the edges', () => {
  const row = read('src/screens/home/PrayerRow.tsx');
  const card = read('src/screens/home/TodayCard.tsx');

  it('give the rows the hero’s own inset, on both sides, with nothing wrapped round them', () => {
    expect(row).toMatch(/row: \{[\s\S]*?paddingHorizontal: SPACING\.xl,[\s\S]*?position: 'relative',\s*\}/);
    expect(row).not.toMatch(/paddingStart: SPACING\.xl/);
    expect(row).toMatch(/divider: \{[\s\S]*?start: SPACING\.xl,\s*end: SPACING\.xl,/);
    expect(card).toMatch(/tableBleed: \{\},/);
    expect(card).toMatch(/dayBar: \{[\s\S]*?paddingHorizontal: SPACING\.xl,/);
    expect(card).toMatch(/monthRow: \{[\s\S]*?paddingHorizontal: SPACING\.xl,/);
  });
});
