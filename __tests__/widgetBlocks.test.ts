/**
 * The blocks the widgets read beyond prayer times.
 *
 * Pure functions on purpose, so the arithmetic that decides what a home
 * screen states about someone's practice can be checked without a device.
 */
import {
  buildHijriBlock,
  buildPracticeBlock,
  buildReadingBlock,
  buildTasbihBlock,
  buildTodayBlock,
  PRACTICE_WINDOW_DAYS,
} from '../src/widget/widgetBlocks';
import { TASBIH_PRESETS } from '../src/tasbih/tasbih';
import type { JournalEntry } from '../src/journal/journal';

const NOW = new Date(2026, 7, 20, 14, 30); // Thu 20 Aug 2026, local

function day(offset: number): string {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function entry(
  date: string,
  prayer: JournalEntry['prayer'],
  status: JournalEntry['status'],
): JournalEntry {
  return { date, prayer, status, loggedAt: `${date}T12:00:00.000Z` };
}

describe('practice', () => {
  it('counts on-time and late as kept, and flags a missed day', () => {
    const block = buildPracticeBlock({
      journal: [
        entry(day(0), 'Fajr', 'on-time'),
        entry(day(0), 'Dhuhr', 'late'),
        entry(day(-1), 'Asr', 'missed'),
      ],
      fasts: [],
      sunnah: {},
      streak: 4,
      bestStreak: 31,
      now: NOW,
    });
    const today = block.days.find(d => d.d === day(0));
    const yesterday = block.days.find(d => d.d === day(-1));
    expect(today?.k).toBe(2);
    expect(yesterday?.k).toBe(0);
    expect(yesterday?.m).toBe(true);
    expect(block.loggedToday).toBe(2);
    expect(block.owed).toBe(1);
  });

  it('omits days with nothing recorded rather than shipping empty squares', () => {
    const block = buildPracticeBlock({
      journal: [entry(day(-3), 'Fajr', 'on-time')],
      fasts: [],
      sunnah: {},
      streak: 0,
      bestStreak: 0,
      now: NOW,
    });
    expect(block.days).toHaveLength(1);
    expect(block.days[0].d).toBe(day(-3));
  });

  it('drops days older than the window — the grid cannot draw them', () => {
    const block = buildPracticeBlock({
      journal: [
        entry(day(-(PRACTICE_WINDOW_DAYS - 1)), 'Fajr', 'on-time'),
        entry(day(-PRACTICE_WINDOW_DAYS), 'Fajr', 'on-time'),
      ],
      fasts: [],
      sunnah: {},
      streak: 0,
      bestStreak: 0,
      now: NOW,
    });
    expect(block.days.map(d => d.d)).toEqual([
      day(-(PRACTICE_WINDOW_DAYS - 1)),
    ]);
  });

  it('counts only completed fasts, and only this month', () => {
    const block = buildPracticeBlock({
      journal: [],
      fasts: [
        { date: day(0), type: 'voluntary', completed: true },
        { date: day(-1), type: 'voluntary', completed: false },
        { date: '2026-06-04', type: 'voluntary', completed: true },
      ] as never,
      sunnah: {},
      streak: 0,
      bestStreak: 0,
      now: NOW,
    });
    expect(block.fastsThisMonth).toBe(1);
    expect(block.days.find(d => d.d === day(0))?.f).toBe(true);
    expect(block.days.find(d => d.d === day(-1))).toBeUndefined();
  });
});

describe('today', () => {
  const TIMINGS = {
    Fajr: '05:10',
    Sunrise: '06:28',
    Dhuhr: '13:12',
    Asr: '16:57',
    Maghrib: '19:56',
    Isha: '21:13',
  };

  it('marks only prayers whose time has arrived as due', () => {
    const block = buildTodayBlock({ journal: [], timings: TIMINGS, now: NOW });
    const due = block.prayers.filter(p => p.due).map(p => p.key);
    // 14:30 — Fajr and Dhuhr have passed, Asr has not.
    expect(due).toEqual(['Fajr', 'Dhuhr']);
  });

  it('is not fooled by a 12-hour clock string sorting wrong', () => {
    // The bug this guards: "1:12 PM" sorts before "5:10 AM" as text, so a
    // block built from FORMATTED times would call Fajr not-yet-due at 2pm.
    const block = buildTodayBlock({ journal: [], timings: TIMINGS, now: NOW });
    expect(block.prayers.find(p => p.key === 'Fajr')?.due).toBe(true);
  });

  it('carries each prayer status and counts what is owed today', () => {
    const block = buildTodayBlock({
      journal: [
        entry(day(0), 'Fajr', 'on-time'),
        entry(day(0), 'Dhuhr', 'missed'),
        entry(day(-1), 'Asr', 'missed'), // yesterday — not this block's business
      ],
      timings: TIMINGS,
      now: NOW,
    });
    expect(block.prayers.find(p => p.key === 'Fajr')?.status).toBe('on-time');
    expect(block.prayers.find(p => p.key === 'Asr')?.status).toBeNull();
    expect(block.logged).toBe(2);
    expect(block.owed).toBe(1);
    expect(block.dateKey).toBe(day(0));
  });

  it('renders a missing time as a dash and never as due', () => {
    const block = buildTodayBlock({
      journal: [],
      timings: { ...TIMINGS, Isha: '' },
      now: NOW,
    });
    const isha = block.prayers.find(p => p.key === 'Isha');
    expect(isha?.time).toBe('—');
    expect(isha?.due).toBe(false);
  });
});

describe('reading', () => {
  const LAST_READ = {
    surah: 4,
    ayah: 1,
    page: 77,
    mode: 'mushaf' as const,
    updatedAt: NOW.getTime() - 2 * 86_400_000,
  };

  it('is null when nothing has ever been read and no plan runs', () => {
    expect(
      buildReadingBlock({ lastRead: null, bookmarks: [], khatmah: null }),
    ).toBeNull();
  });

  describe('which reader a tap opens', () => {
    const call = (mushafDownloaded?: boolean) =>
      buildReadingBlock({
        lastRead: LAST_READ, // mode: 'mushaf'
        bookmarks: [],
        khatmah: null,
        now: NOW,
        mushafDownloaded,
      });

    it('opens the mushaf when that is what they were in and it is on disk', () => {
      expect(call(true)?.mode).toBe('mushaf');
    });

    it('does not send them to a download wall', () => {
      // They were last in the mushaf, but the ~180 MB of pages is not there.
      // The translation reader always works; the download prompt is not a
      // place to land from a widget that says "continue".
      expect(call(false)?.mode).toBe('translation');
    });

    it('treats an unknown mushaf state as absent', () => {
      expect(call(undefined)?.mode).toBe('translation');
    });

    it('keeps the translation reader when that is what they were in', () => {
      const block = buildReadingBlock({
        lastRead: { ...LAST_READ, mode: 'withTranslation' },
        bookmarks: [],
        khatmah: null,
        now: NOW,
        mushafDownloaded: true,
      });
      expect(block?.mode).toBe('translation');
    });
  });

  it('reports the bookmark position when there is no plan', () => {
    const block = buildReadingBlock({
      lastRead: LAST_READ,
      bookmarks: [],
      khatmah: null,
      now: NOW,
    });
    expect(block?.page).toBe(77);
    expect(block?.pagesRead).toBe(77);
    expect(block?.totalPages).toBe(604);
    expect(block?.juz).toBeGreaterThan(0);
    expect(block?.khatmah).toBeUndefined();
  });

  it('prefers the plan position over the last page browsed', () => {
    const block = buildReadingBlock({
      lastRead: LAST_READ, // they wandered off to page 77
      bookmarks: [],
      khatmah: {
        id: 'k',
        startedAt: NOW.getTime() - 13 * 86_400_000,
        targetDays: 30,
        pagesRead: 46,
        completedAt: null,
      },
      now: NOW,
    });
    // The khatmah's own next page, not where they were browsing.
    expect(block?.page).toBe(47);
    expect(block?.pagesRead).toBe(46);
    expect(block?.khatmah?.day).toBe(14);
    expect(block?.khatmah?.targetDays).toBe(30);
    expect(block?.khatmah?.behindBy).toBeGreaterThan(0);
  });

  it('reports pages done today from the day-start snapshot', () => {
    const todayKey = day(0);
    const block = buildReadingBlock({
      lastRead: LAST_READ,
      bookmarks: [],
      khatmah: {
        id: 'k',
        startedAt: NOW.getTime() - 13 * 86_400_000,
        targetDays: 30,
        pagesRead: 50,
        completedAt: null,
        dayStartDate: todayKey,
        dayStartPagesRead: 46,
      },
      now: NOW,
    });
    expect(block?.khatmah?.doneToday).toBe(4);
  });

  it('counts bookmarks', () => {
    const block = buildReadingBlock({
      lastRead: LAST_READ,
      bookmarks: [{}, {}, {}] as never,
      khatmah: null,
      now: NOW,
    });
    expect(block?.bookmarks).toBe(3);
  });
});

describe('hijri', () => {
  it('gives today plus a next month that is always within a Hijri month', () => {
    const block = buildHijriBlock(NOW);
    expect(block.day).toBeGreaterThanOrEqual(1);
    expect(block.day).toBeLessThanOrEqual(30);
    expect(block.month).toBeGreaterThanOrEqual(1);
    expect(block.month).toBeLessThanOrEqual(12);
    expect(block.label).toContain(String(block.year));
    expect(block.nextMonthName).toBeTruthy();
    expect(block.nextMonthInDays).toBeGreaterThan(0);
    expect(block.nextMonthInDays).toBeLessThanOrEqual(31);
  });

  it('names the month that actually follows, wrapping 12 → 1', () => {
    // Walk two Hijri years a day at a time. Every day must name the month it
    // will be in `nextMonthInDays` days — including the December-to-January
    // case, which is the one an off-by-one would survive for eleven months.
    let sawWrap = false;
    for (let i = 0; i < 720; i++) {
      const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + i);
      const b = buildHijriBlock(d);
      const landing = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + b.nextMonthInDays,
      );
      const actual = buildHijriBlock(landing);
      expect(actual.month).toBe(b.month === 12 ? 1 : b.month + 1);
      expect(actual.monthName).toBe(b.nextMonthName);
      // The first day of that month, not some day in the middle of it.
      expect(actual.day).toBe(1);
      if (b.month === 12) sawWrap = true;
    }
    expect(sawWrap).toBe(true);
  });
});

describe('tasbih', () => {
  const FIRST = TASBIH_PRESETS[0].id;
  const SECOND = TASBIH_PRESETS[1].id;

  it('carries every preset count, not just the active one', () => {
    const block = buildTasbihBlock({
      activeId: SECOND,
      counts: { [FIRST]: 33, [SECOND]: 12 },
    });
    expect(block.count).toBe(12);
    expect(block.index).toBe(1);
    expect(block.total).toBe(TASBIH_PRESETS.length);
    expect(block.counts).toHaveLength(TASBIH_PRESETS.length);
    expect(block.counts[0]).toBe(33);
    expect(block.todayTotal).toBe(45);
  });

  it('falls back to the first preset for an id the app does not ship', () => {
    const block = buildTasbihBlock({ activeId: 'retired', counts: {} });
    expect(block.presetId).toBe(FIRST);
    expect(block.count).toBe(0);
  });

  it('reports the open-ended flag so the widget honours it', () => {
    const open = TASBIH_PRESETS.find(p => p.unboundedAfterTarget);
    expect(open).toBeDefined();
    const block = buildTasbihBlock({ activeId: open!.id, counts: {} });
    expect(block.unbounded).toBe(true);
    expect(block.target).toBe(open!.defaultTarget);
  });
});
