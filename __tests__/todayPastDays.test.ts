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

const mockCached = jest.fn();
jest.mock('../src/prayer/prayerStorage', () => ({
  getCachedPrayerTimes: (...a: unknown[]) => mockCached(...a),
}));

const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('the days behind today', () => {
  const params = {
    provider: 'aladhan' as never,
    latitude: 59.33,
    longitude: 18.07,
    calculationMethod: 3 as never,
    school: 0 as never,
  };
  const now = new Date(2026, 8, 9, 12, 0);

  it('come from the cache alone, nearest first, and stop at the first gap', async () => {
    mockCached.mockImplementation(async ({ date }: { date: Date }) =>
      date.getDate() >= 5 ? { Fajr: `0${date.getDate()}:00` } : null,
    );
    const past = await cachedDaysBefore(params, now);
    expect(past.map(d => d.Fajr)).toEqual(['08:00', '07:00', '06:00', '05:00']);
    // Never a fetch: the only thing asked is the cache.
    expect(mockCached).toHaveBeenCalledTimes(5);
  });

  it('reach a week back at most', async () => {
    mockCached.mockResolvedValue({ Fajr: '04:00' });
    const past = await cachedDaysBefore(params, now);
    expect(past).toHaveLength(PAST_DAYS);
    expect(PAST_DAYS).toBe(7);
  });

  it('treat a cache that throws as a cache that has nothing', async () => {
    mockCached.mockRejectedValue(new Error('disk'));
    await expect(cachedDaysBefore(params, now)).resolves.toEqual([]);
  });
});

describe('the pages', () => {
  const card = read('src/screens/home/TodayCard.tsx');

  it('run from the oldest past day through the week, opening on today', () => {
    expect(card).toMatch(/pastDays\.slice\(\)\.reverse\(\)\.concat\(week\)/);
    expect(card).toMatch(/const todayIndex = pastDays\.length;/);
    expect(card).toMatch(/initialScrollIndex=\{todayIndex\}/);
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

describe('the day line', () => {
  const card = read('src/screens/home/TodayCard.tsx');
  const home = read('src/screens/HomeScreen.tsx');

  it('says the weekday and both dates of the day on show', () => {
    expect(card).toMatch(/\{getWeekday\(selected\)\}/);
    expect(card).toMatch(/`\$\{getDayDate\(selected\)\} · \$\{getHijriDate\(selected\)\}`/);
    // The weekday is the weekday, today included — "Today" is the mark's word.
    expect(home).toMatch(/const getWeekday = useCallback\([\s\S]*?weekday: 'long'/);
  });

  it('marks today, and turns into the way back once the table has left it', () => {
    const line = card.slice(card.indexOf('styles.dayLine,'), card.indexOf('onLayout={onTableLayout}'));
    expect(line).toMatch(/selected === 0 \?[\s\S]*?t\('home\.today'\)[\s\S]*?: \([\s\S]*?onPress=\{\(\) => handleSelect\(0\)\}[\s\S]*?home\.backToToday/);
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
});

describe('the edges', () => {
  const row = read('src/screens/home/PrayerRow.tsx');
  const card = read('src/screens/home/TodayCard.tsx');

  it('give the rows the hero’s own inset, on both sides, with nothing wrapped round them', () => {
    expect(row).toMatch(/row: \{[\s\S]*?paddingHorizontal: SPACING\.xl,[\s\S]*?position: 'relative',\s*\}/);
    expect(row).not.toMatch(/paddingStart: SPACING\.xl/);
    expect(row).toMatch(/divider: \{[\s\S]*?start: SPACING\.xl,\s*end: SPACING\.xl,/);
    expect(card).toMatch(/tableBleed: \{\},/);
    expect(card).toMatch(/dayLine: \{[\s\S]*?paddingHorizontal: SPACING\.xl,/);
    expect(card).toMatch(/monthRow: \{[\s\S]*?paddingHorizontal: SPACING\.xl,/);
  });
});
