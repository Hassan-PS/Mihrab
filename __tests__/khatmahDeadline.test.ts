/**
 * "FINISH BY THE 30th" — the second way to pace a khatmah (issue #53).
 *
 * A duration plan is cut once and its day number is the reader's. A
 * deadline plan is cut every morning out of what is left, and its day
 * number is the calendar's. These hold the second one: the quota that
 * grows when a day is missed, the day that does not recede as it is read,
 * the date that has already gone by, and — the whole reason this mode
 * exists — "days left" meaning days, not portions.
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  getQuranState,
  khatmahCurrentPortion,
  khatmahDay,
  khatmahDaysLeft,
  khatmahDeadline,
  khatmahPaceToday,
  khatmahPages,
  khatmahPerDayPages,
  khatmahBehindBy,
  khatmahUnreadAyahs,
  recordKhatmahPageTurn,
  setKhatmahDeadline,
  startKhatmah,
  KHATMAH_TOTAL_AYAHS,
  type KhatmahPlan,
} from '../src/quran/quranState';
import { mergeKhatmah } from '../src/sync/merge';
import {
  daysToDeadline,
  deadlineDayNumber,
  deadlineTotalDays,
} from '../src/quran/khatmahPace';

const ymd = (at: number) => {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
};
const DAY = 24 * 60 * 60 * 1000;
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).getTime();

const plan = (over: Partial<KhatmahPlan> = {}): KhatmahPlan => ({
  id: 'k1',
  startedAt: at(2026, 8, 1),
  targetDays: 30,
  pagesRead: 0,
  completedAt: null,
  deadline: '2026-09-30',
  deadlineAt: at(2026, 8, 1),
  ...over,
});

describe('the calendar, counted the way a reader counts it', () => {
  it('days left is days, not portions — the number the issue was about', () => {
    // Reported: a target of 30 September showed 18 days on 16 September,
    // because it was counting portions nobody had read yet.
    expect(daysToDeadline('2026-09-30', at(2026, 8, 16))).toBe(15);
    expect(khatmahDaysLeft(plan(), at(2026, 8, 16))).toBe(15);
  });

  it('the day due today has one day left, not none', () => {
    expect(daysToDeadline('2026-09-30', at(2026, 8, 30))).toBe(1);
  });

  it('and a date that has gone by has none', () => {
    expect(daysToDeadline('2026-09-30', at(2026, 9, 2))).toBe(0);
    expect(khatmahDaysLeft(plan(), at(2026, 9, 2))).toBe(0);
  });

  it('the day number is the calendar\'s, whatever has been read', () => {
    expect(deadlineTotalDays(at(2026, 8, 1), '2026-09-30')).toBe(30);
    expect(deadlineDayNumber(at(2026, 8, 1), '2026-09-30', at(2026, 8, 1))).toBe(1);
    expect(deadlineDayNumber(at(2026, 8, 1), '2026-09-30', at(2026, 8, 16))).toBe(16);
    // Read nothing for a fortnight and it is still the 16th.
    const idle = plan();
    expect(khatmahCurrentPortion(idle, at(2026, 8, 16)).day).toBe(16);
  });
});

describe('the pace re-spreads what is left', () => {
  it('a day missed makes tomorrow bigger, not a debt due today', () => {
    const fresh = plan();
    const dayOne = khatmahPerDayPages(fresh, at(2026, 8, 1));
    // 604 pages over 30 days.
    expect(dayOne).toBe(Math.ceil(604 / 30));
    // Nothing read for five days: 604 pages now over 25 days.
    const later = khatmahPerDayPages(fresh, at(2026, 8, 6));
    expect(later).toBe(Math.ceil(604 / 25));
    expect(later).toBeGreaterThan(dayOne);
    // …and it is a nudge, not a wall: four pages a day more, not five
    // days' reading at once.
    expect(later - dayOne).toBeLessThan(5);
  });

  it('reading ahead makes tomorrow smaller', () => {
    const ahead = plan({ done: [[1, 2000]], ayahsRead: 2000, pagesRead: 190 });
    expect(khatmahPerDayPages(ahead, at(2026, 8, 6))).toBeLessThan(
      khatmahPerDayPages(plan(), at(2026, 8, 6)),
    );
  });

  it('counts pages skipped BEHIND the reader, not just what is ahead', () => {
    // The backlog the issue asks to have rolled in: a hole is unread
    // reading, and the pace has to be the one that actually finishes.
    const holed = plan({ done: [[1, 100], [201, 2000]], ayahsRead: 100, pagesRead: 10 });
    const clean = plan({ done: [[1, 2000]], ayahsRead: 2000, pagesRead: 190 });
    expect(khatmahUnreadAyahs(holed)).toBeGreaterThan(khatmahUnreadAyahs(clean));
  });

  it('is never "behind" — the quota moved instead', () => {
    // Saying both would charge the reader for the same missed day twice.
    expect(khatmahBehindBy(plan(), at(2026, 8, 20), 'hafs')).toBe(0);
  });
});

describe("today's cut does not recede as it is read", () => {
  it('the day keeps the portion it opened with', () => {
    const now = at(2026, 8, 6);
    const start = plan();
    const pinned = khatmahPaceToday(start, now)!;
    // Read half of today's portion; the target must not move.
    const midway = {
      ...start,
      pace: pinned,
      done: [[1, Math.floor((pinned.from + pinned.to) / 2)] as [number, number]],
      ayahsRead: Math.floor((pinned.from + pinned.to) / 2),
    };
    expect(khatmahPaceToday(midway, now)).toEqual(pinned);
    expect(khatmahCurrentPortion(midway, now).to).toBe(pinned.to);
  });

  it('a new day cuts again, from where the reader now is', () => {
    const yesterday = at(2026, 8, 6);
    const today = at(2026, 8, 7);
    const start = plan();
    const pinned = khatmahPaceToday(start, yesterday)!;
    const read = {
      ...start,
      pace: pinned,
      done: [[1, pinned.to] as [number, number]],
      ayahsRead: pinned.to,
      pagesRead: 40,
    };
    const fresh = khatmahPaceToday(read, today)!;
    expect(fresh.day).toBe(ymd(today));
    expect(fresh.from).toBe(pinned.to + 1);
  });
});

describe('a date that has already passed', () => {
  const overdue = plan();
  const after = at(2026, 9, 3);

  it('asks for what is left, and does not count the days that went', () => {
    expect(khatmahDaysLeft(overdue, after)).toBe(0);
    const cut = khatmahPaceToday(overdue, after)!;
    // Everything still unread is today's — the truth, not a punishment.
    expect(cut.to).toBe(KHATMAH_TOTAL_AYAHS);
  });

  it('and the plan is still live — nothing abandons it', () => {
    expect(khatmahDeadline(overdue)).toBe('2026-09-30');
    expect(overdue.completedAt).toBeNull();
  });
});

describe('the writers', () => {
  beforeEach(() => __resetQuranStateForTests());

  it('starts a plan with a date and pins the first cut', () => {
    const by = ymd(Date.now() + 29 * DAY);
    startKhatmah(30, undefined, by);
    const made = activeKhatmah(getQuranState())!;
    expect(khatmahDeadline(made)).toBe(by);
    expect(made.deadlineAt).toBeGreaterThan(0);
    expect(made.pace?.day).toBe(ymd(Date.now()));
    expect(made.pace!.from).toBe(1);
  });

  it('gives a live duration plan a date — the re-pace, and the way back', () => {
    startKhatmah(30);
    expect(activeKhatmah(getQuranState())!.pace).toBeUndefined();
    const by = ymd(Date.now() + 9 * DAY);
    setKhatmahDeadline(by);
    const paced = activeKhatmah(getQuranState())!;
    expect(khatmahDeadline(paced)).toBe(by);
    expect(khatmahDaysLeft(paced)).toBe(10);
    // Ten days for the whole book is about sixty pages a day, and the
    // plan says so rather than keeping the twenty it was made with.
    expect(khatmahPerDayPages(paced)).toBeGreaterThan(50);

    setKhatmahDeadline(null);
    const back = activeKhatmah(getQuranState())!;
    expect(khatmahDeadline(back)).toBeNull();
    expect(back.pace).toBeUndefined();
    expect(back.deadlineAt).toBeGreaterThan(0); // the removal is dated
    expect(khatmahDaysLeft(back)).toBe(30);
  });

  it('page turns keep the day and the cut in step', () => {
    const by = ymd(Date.now() + 29 * DAY);
    startKhatmah(30, undefined, by);
    const cut = activeKhatmah(getQuranState())!.pace!;
    for (let p = 1; p < 5; p++) recordKhatmahPageTurn(p, p + 1);
    const after = activeKhatmah(getQuranState())!;
    expect(after.pace).toEqual(cut);
    const day = khatmahDay(after);
    expect(day.portion.from).toBe(cut.from);
    expect(day.portion.to).toBe(cut.to);
    expect(day.done).toBe(false);
    expect(khatmahPages(after, 'hafs').today).toBe(
      Math.ceil(604 / 30),
    );
  });
});

describe('a duration plan is not touched by any of this', () => {
  const duration: KhatmahPlan = {
    id: 'd1',
    startedAt: at(2026, 8, 1),
    targetDays: 30,
    pagesRead: 0,
    completedAt: null,
  };

  it('has no deadline, no pace, and counts portions as it always did', () => {
    expect(khatmahDeadline(duration)).toBeNull();
    expect(khatmahPaceToday(duration, at(2026, 8, 16))).toBeNull();
    expect(khatmahDaysLeft(duration, at(2026, 8, 16))).toBe(30);
    expect(khatmahPerDayPages(duration, at(2026, 8, 16))).toBe(0);
    expect(khatmahBehindBy(duration, at(2026, 8, 16), 'hafs')).toBeGreaterThan(0);
  });
});

/**
 * TWO DEVICES, ONE DAY, ONE QUOTA.
 *
 * The reason the cut is stored rather than derived from the per-device
 * day baseline: that baseline is a fact about one device's morning and
 * deliberately does not sync, so a phone opened at three in the afternoon
 * would cut the day against reading the Mac had already done and show a
 * different quota for the same day.
 */
describe('the day\'s cut travels', () => {
  const by = '2026-09-30';
  const base = plan({ deadline: by, deadlineAt: at(2026, 8, 1) });

  it('the first device to open the day is the one that cut it', () => {
    const morning = khatmahPaceToday(base, at(2026, 8, 6, 8))!;
    const mac = { ...base, pace: morning, done: [[1, morning.to] as [number, number]], ayahsRead: morning.to };
    // The phone opens in the afternoon, after that reading has synced.
    const phone = { ...base, done: mac.done, ayahsRead: mac.ayahsRead };
    const merged = mergeKhatmah([phone], [mac])[0];
    expect(merged.pace).toEqual(morning);
    expect(mergeKhatmah([mac], [phone])[0].pace).toEqual(morning);
  });

  it('and a device that cut it later in the day loses to the earlier cut', () => {
    const early = { ...base, pace: { day: '2026-09-06', from: 1, to: 200 } };
    const late = { ...base, pace: { day: '2026-09-06', from: 201, to: 400 } };
    expect(mergeKhatmah([early], [late])[0].pace!.from).toBe(1);
    expect(mergeKhatmah([late], [early])[0].pace!.from).toBe(1);
  });

  it('but tomorrow beats today', () => {
    const today = { ...base, pace: { day: '2026-09-06', from: 1, to: 200 } };
    const tomorrow = { ...base, pace: { day: '2026-09-07', from: 201, to: 400 } };
    expect(mergeKhatmah([today], [tomorrow])[0].pace!.day).toBe('2026-09-07');
    expect(mergeKhatmah([tomorrow], [today])[0].pace!.day).toBe('2026-09-07');
  });
});

describe('the deadline itself travels, and can be taken off', () => {
  const dated = plan({ deadline: '2026-09-30', deadlineAt: 5_000 });

  it('the newest word wins, both ways round', () => {
    const moved = plan({ deadline: '2026-10-15', deadlineAt: 9_000 });
    for (const merged of [
      mergeKhatmah([dated], [moved])[0],
      mergeKhatmah([moved], [dated])[0],
    ]) {
      expect(merged.deadline).toBe('2026-10-15');
      expect(merged.deadlineAt).toBe(9_000);
    }
  });

  it('taking it off is a dated fact too, so it does not come back', () => {
    const cleared = plan({ deadline: undefined, deadlineAt: 9_000 });
    for (const merged of [
      mergeKhatmah([dated], [cleared])[0],
      mergeKhatmah([cleared], [dated])[0],
    ]) {
      expect(merged.deadline).toBeUndefined();
      expect('pace' in merged).toBe(false);
    }
  });

  it('two duration plans gain no deadline-shaped keys', () => {
    const duration: KhatmahPlan = {
      id: 'd',
      startedAt: at(2026, 8, 1),
      targetDays: 30,
      pagesRead: 0,
      completedAt: null,
    };
    const merged = mergeKhatmah([duration], [duration])[0];
    expect(merged).toEqual(duration);
    expect('deadline' in merged).toBe(false);
    expect('deadlineAt' in merged).toBe(false);
    expect('pace' in merged).toBe(false);
  });

  it('merging a dated plan with itself returns it', () => {
    const live = plan({ pace: { day: '2026-09-06', from: 1, to: 200 } });
    expect(mergeKhatmah([live], [live])[0]).toEqual(live);
  });

  it('and a merge never shortens a deadline behind the reader\'s back', () => {
    // Same stamp, two dates: the later one wins, deterministically on
    // both devices. A merge that silently pulled the date forward would
    // be asking for reading nobody agreed to.
    const soon = plan({ deadline: '2026-09-20', deadlineAt: 7_000 });
    const later = plan({ deadline: '2026-10-20', deadlineAt: 7_000 });
    expect(mergeKhatmah([soon], [later])[0].deadline).toBe('2026-10-20');
    expect(mergeKhatmah([later], [soon])[0].deadline).toBe('2026-10-20');
  });
});
