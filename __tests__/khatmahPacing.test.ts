/**
 * CHANGING YOUR MIND ABOUT A KHATMAH THAT IS ALREADY UNDER WAY.
 *
 * There are two plans in this app — "in thirty days", which waits for the
 * reader, and "by the 30th", which re-cuts what is left every morning —
 * and until now the choice was made once, at the start, and could only be
 * unmade by deleting the khatmah and starting again. These are about the
 * switch: in both directions, at any point, with the reading kept.
 *
 * Three things have to hold for that to be safe, and they are the three
 * things tested here:
 *
 *   • the reading survives — progress, holes, and where the reader is
 *     standing are not the pacing's business;
 *   • the plan asks for what was actually agreed — a length is solved for
 *     from where the reader IS (`khatmahDurationForDaysLeft`), and the
 *     schedule a plan is judged against starts at the decision, not at
 *     the plan's birthday;
 *   • two devices cannot end up on half a decision each.
 */
import {
  __resetQuranStateForTests,
  activeKhatmah,
  getQuranState,
  khatmahBehindBy,
  khatmahDaysLeft,
  khatmahDeadline,
  khatmahDurationForDaysLeft,
  khatmahPaceOutgrown,
  khatmahPerDayPages,
  khatmahReachAyah,
  khatmahReachPage,
  khatmahUnreadPages,
  recordKhatmahProgress,
  setKhatmahDeadline,
  setKhatmahDuration,
  startKhatmah,
  type KhatmahPlan,
} from '../src/quran/quranState';
import {
  coerceQuranState,
  khatmahCurrentPortion,
  khatmahDay,
  khatmahDayAnchor,
  khatmahGap,
  khatmahIsComplete,
  khatmahPaceToday,
  khatmahPages,
  resetKhatmahAll,
  stepKhatmahBack,
  toggleKhatmahPageDone,
} from '../src/quran/quranState';
import { khatmahDayWhen } from '../src/quran/khatmahDayWhen';
import { mergeKhatmah } from '../src/sync/merge';
import { setTodaysMaghrib, _resetIslamicDay } from '../src/hijri/islamicDay';

const DAY = 24 * 60 * 60 * 1000;
const ymd = (at: number) => {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
};
const live = () => activeKhatmah(getQuranState())!;

/**
 * A plan of `days`, with the reader standing on Ḥafṣ page `page`.
 *
 * Read a sitting at a time, because that is the only way it can be: one
 * record claims at most the portion in hand (`khatmahCreditWindow`), so
 * asking for page 300 in one call credits the first portion and stops.
 * Which is the behaviour this wants anyway — a reader halfway through a
 * khatmah got there a day at a time.
 */
function reading(days: number, page: number): KhatmahPlan {
  __resetQuranStateForTests();
  startKhatmah(days);
  for (let i = 0; i < 700 && khatmahReachPage(live()) < page; i++) {
    const before = khatmahReachPage(live());
    recordKhatmahProgress(page, 'hafs');
    if (khatmahReachPage(live()) === before) break;
  }
  return live();
}

describe('the switch, in both directions, mid-khatmah', () => {
  it('gives a duration plan a date without moving the reader', () => {
    const before = reading(30, 120);
    const reach = khatmahReachAyah(before);
    const by = ymd(Date.now() + 9 * DAY);

    setKhatmahDeadline(by);
    const after = live();
    expect(khatmahDeadline(after)).toBe(by);
    // The reading is not the pacing's business.
    expect(khatmahReachAyah(after)).toBe(reach);
    expect(after.done).toEqual(before.done);
    // Ten days, and the quota is what the REST of the book over ten days
    // costs — not the twenty-a-day the plan was made with.
    expect(khatmahDaysLeft(after)).toBe(10);
    expect(khatmahPerDayPages(after)).toBeGreaterThan(40);
    // Today's cut starts where the reader is, not at page one.
    expect(after.pace!.from).toBe(reach + 1);
  });

  it('and takes it off again for the reading that is left, not the plan it was', () => {
    reading(80, 300);
    setKhatmahDeadline(ymd(Date.now() + 6 * DAY));
    const reach = khatmahReachAyah(live());

    setKhatmahDuration(14);
    const back = live();
    expect(khatmahDeadline(back)).toBeNull();
    expect(back.pace).toBeUndefined();
    expect(khatmahReachAyah(back)).toBe(reach);
    // Fourteen days of READING left — which is not fourteen `targetDays`,
    // because half the book is already behind this reader.
    expect(khatmahDaysLeft(back)).toBe(14);
    expect(back.targetDays).toBeGreaterThan(14);
  });

  it('changes the length of a duration plan, which nothing could do before', () => {
    reading(30, 200);
    setKhatmahDuration(7);
    expect(khatmahDeadline(live())).toBeNull();
    expect(khatmahDaysLeft(live())).toBe(7);
  });

  it('dates every decision, so an absence can never undo one', () => {
    reading(30, 50);
    const first = live().pacedAt!;
    expect(first).toBeGreaterThan(0);
    setKhatmahDeadline(ymd(Date.now() + 20 * DAY));
    const second = live().pacedAt!;
    expect(second).toBeGreaterThanOrEqual(first);
    setKhatmahDuration(12);
    expect(live().pacedAt!).toBeGreaterThanOrEqual(second);
    // And it remembers where the reader stood when it was taken.
    expect(live().pacedFrom).toBe(khatmahReachPage(live()));
  });

  it('leaves a plan alone when there is none to re-pace', () => {
    __resetQuranStateForTests();
    setKhatmahDuration(10);
    setKhatmahDeadline(ymd(Date.now() + DAY));
    expect(getQuranState().khatmah).toEqual([]);
  });
});

describe('the length that answers "I want this to take N days"', () => {
  it.each([0, 100, 300, 500, 590])('from page %i, for any N', page => {
    const plan = reading(30, page);
    // The gentlest plan the model has: a page a day, every day.
    const slowest = khatmahDaysLeft({ ...plan, targetDays: 604 });
    for (const want of [1, 2, 3, 7, 14, 30, 60, 120]) {
      const targetDays = khatmahDurationForDaysLeft(plan, want);
      const paced: KhatmahPlan = { ...plan, targetDays };
      // Exactly the days asked for — the estimate is the arithmetic, and
      // the walk around it is there because the portions fall on page
      // boundaries and rounding can land a day either side — unless the
      // reader has fewer pages left than days asked for, where a page a
      // day is as slow as a khatmah goes.
      expect(khatmahDaysLeft(paced)).toBe(Math.min(want, slowest));
    }
  });

  it('gives back the plan in hand when it already answers', () => {
    // Asking for the days a plan already has left must not move its
    // portion boundaries: the same days left can be had from a
    // neighbouring length, and the reader would watch "day 10 of 30"
    // become "day 9 of 29" for having changed nothing.
    const plan = reading(30, 200);
    const left = khatmahDaysLeft(plan);
    expect(khatmahDurationForDaysLeft(plan, left)).toBe(30);
    setKhatmahDuration(left);
    expect(live().targetDays).toBe(30);
    expect(khatmahCurrentPortion(live()).day).toBe(khatmahCurrentPortion(plan).day);
  });

  it('is at least a day, however the question is put', () => {
    const plan = reading(30, 300);
    for (const want of [0, -5, Number.NaN]) {
      expect(khatmahDurationForDaysLeft(plan, want)).toBeGreaterThanOrEqual(1);
    }
  });

  it('answers for a reader with all but the last pages behind them', () => {
    // Four pages left and a fortnight asked for: there is no such plan,
    // and the answer is the gentlest one there is rather than an error.
    const plan = reading(30, 600);
    const targetDays = khatmahDurationForDaysLeft(plan, 14);
    expect(targetDays).toBeGreaterThanOrEqual(1);
    expect(khatmahDaysLeft({ ...plan, targetDays })).toBeGreaterThanOrEqual(1);
  });
});

describe('a re-paced plan is judged by the promise it has just made', () => {
  /** Nineteen days in, a third of the way through a thirty-day plan. */
  const stale = (over: Partial<KhatmahPlan> = {}): KhatmahPlan => ({
    id: 'k',
    startedAt: Date.now() - 19 * DAY,
    targetDays: 30,
    pagesRead: 200,
    ayahsRead: 0,
    completedAt: null,
    done: [[1, 2000]],
    ...over,
  });

  it('is not behind the schedule it replaced', () => {
    const drifting = stale();
    // The old plan, honestly reported: a reader who should be two thirds
    // through and is one third through IS behind it.
    expect(khatmahBehindBy(drifting)).toBeGreaterThan(50);

    const repaced = stale({
      targetDays: khatmahDurationForDaysLeft(stale(), 14),
      pacedAt: Date.now(),
      pacedFrom: khatmahReachPage(stale()),
    });
    // ...and the moment they agree to finish the rest in a fortnight,
    // they are behind nothing. The schedule starts today, from here.
    expect(khatmahBehindBy(repaced)).toBe(0);
  });

  it('still measures an old plan from the day it began', () => {
    // No stamp means a plan made before any of this existed; those are
    // measured exactly as they always were.
    const legacy = stale();
    expect(legacy.pacedAt).toBeUndefined();
    expect(khatmahBehindBy(legacy)).toBeGreaterThan(0);
  });

  it('does not offer a way out of a date chosen one second ago', () => {
    // `khatmahPaceOutgrown` asks whether the pace has run away from the
    // reader. Measured against the plan's whole span, a date set late in
    // a long khatmah looks outgrown the instant it is set — the card
    // would open by offering to move a date the reader had just picked.
    const by = ymd(Date.now() + 13 * DAY);
    const justSet = stale({
      deadline: by,
      pacedAt: Date.now(),
      pacedFrom: khatmahReachPage(stale()),
    });
    expect(khatmahPaceOutgrown(justSet)).toBe(false);

    // A week later, having read nothing, it is a different question.
    const ignored = stale({
      deadline: by,
      pacedAt: Date.now() - 7 * DAY,
      pacedFrom: khatmahReachPage(stale()),
    });
    expect(khatmahPaceOutgrown(ignored)).toBe(true);
  });
});

describe('and its days still land on the right days of the week', () => {
  it('counts a re-paced plan from the day it was re-paced', () => {
    // The portions were recut, so the reader's day number moved with
    // them. Counted from the plan's birthday, today's portion and
    // tomorrow's would both come out as "today" — or, on a plan made
    // this morning, as dates next week.
    reading(30, 200);
    setKhatmahDuration(7);
    const plan = live();
    const today = khatmahCurrentPortion(plan).day;

    expect(khatmahDayWhen(khatmahDayAnchor(plan), today)).toEqual({
      kind: 'today',
    });
    expect(khatmahDayWhen(khatmahDayAnchor(plan), today + 1)).toEqual({
      kind: 'tomorrow',
    });
    // The anchor is doing the work: the plan's own `startedAt` puts the
    // same portion days away.
    expect(khatmahDayWhen(plan.startedAt, today)).not.toEqual({
      kind: 'today',
    });
  });

  it('leaves a plan that has never been re-paced exactly where it was', () => {
    const plan = reading(30, 60);
    for (let day = 1; day <= 8; day++) {
      expect(khatmahDayWhen(khatmahDayAnchor(plan), day)).toEqual(
        khatmahDayWhen(plan.startedAt, day),
      );
    }
  });

  it('and a dated plan, whose days are the calendar\'s already', () => {
    reading(30, 60);
    setKhatmahDeadline(ymd(Date.now() + 9 * DAY));
    expect(khatmahDayAnchor(live())).toBe(live().startedAt);
  });
});

describe('the unlikely shapes a khatmah can be in when it is switched', () => {
  it('with holes behind the reader: the holes stay owed, in both modes', () => {
    reading(30, 200);
    for (let page = 50; page <= 60; page++) toggleKhatmahPageDone(page, 'hafs');
    const holed = live();
    const gap = khatmahGap(holed)?.pages ?? 0;
    expect(gap).toBeGreaterThan(0);

    setKhatmahDeadline(ymd(Date.now() + 9 * DAY));
    // The quota is what is left INCLUDING the holes; today's cut still
    // starts in front of the reader, where they are.
    expect(khatmahUnreadPages(live())).toBe(604 - khatmahReachPage(live()) + gap);
    expect(live().pace!.from).toBe(khatmahReachAyah(live()) + 1);
    expect(khatmahGap(live())?.pages).toBe(gap);

    setKhatmahDuration(10);
    expect(khatmahDaysLeft(live())).toBe(10);
    expect(khatmahGap(live())?.pages).toBe(gap);
    expect(khatmahIsComplete(live())).toBe(false);
  });

  it('having read past today\'s cut on a dated plan, then asking for a length', () => {
    reading(30, 0);
    setKhatmahDeadline(ymd(Date.now() + 29 * DAY));
    // Well past the day's quota.
    for (let i = 0; i < 8; i++) recordKhatmahProgress(120, 'hafs');
    const ahead = live();
    expect(khatmahDay(ahead).extra).toBeGreaterThan(0);

    setKhatmahDuration(20);
    // The reader's own day follows their reading: the extra is not lost
    // and not counted twice, and the twenty days start from here.
    expect(khatmahDaysLeft(live())).toBe(20);
    expect(khatmahReachAyah(live())).toBe(khatmahReachAyah(ahead));
    expect(khatmahBehindBy(live())).toBe(0);
  });

  it('then stepping back a day: the day rewinds, the plan does not fall over', () => {
    reading(30, 200);
    setKhatmahDuration(10);
    const before = live();
    stepKhatmahBack();
    const after = live();
    expect(khatmahDaysLeft(after)).toBeGreaterThanOrEqual(khatmahDaysLeft(before));
    // The reading undone was reading the new schedule counted on, so the
    // reader is behind it by exactly that much — and by nothing more.
    expect(khatmahBehindBy(after)).toBe(
      khatmahReachPage(before) - khatmahReachPage(after),
    );
    expect(khatmahBehindBy(after)).toBeGreaterThan(0);
    expect(khatmahPages(after, 'hafs').leftToday).toBeGreaterThan(0);
  });

  it('switching many times in one sitting settles on the last word', () => {
    reading(30, 150);
    const reach = khatmahReachAyah(live());
    const sequence: Array<number | string> = [
      7, ymd(Date.now() + 3 * DAY), 3, 400, ymd(Date.now() + DAY), 1, 45,
    ];
    let lastStamp = 0;
    for (const step of sequence) {
      if (typeof step === 'number') setKhatmahDuration(step);
      else setKhatmahDeadline(step);
      const plan = live();
      expect(plan.pacedAt!).toBeGreaterThan(lastStamp);
      lastStamp = plan.pacedAt!;
      expect(khatmahReachAyah(plan)).toBe(reach);
      expect(khatmahBehindBy(plan)).toBe(0);
      if (typeof step === 'number') {
        expect(plan.deadline).toBeUndefined();
        expect(plan.pace).toBeUndefined();
      } else {
        expect(plan.deadline).toBe(step);
        expect(plan.pace!.from).toBe(reach + 1);
      }
    }
    expect(khatmahDaysLeft(live())).toBe(45);
  });
});

describe('a dated plan with a page skipped behind the reader', () => {
  // Naming the day a hole is in asked the plan for its portion, which on
  // a dated plan asked for today's cut, which asked for the unread pages,
  // which walked the holes to name their day. The stack ran out on the
  // first morning such a plan was opened. Every path here used to loop.
  it('cuts the morning without falling into itself', () => {
    reading(30, 120);
    toggleKhatmahPageDone(40, 'hafs');
    setKhatmahDeadline(ymd(Date.now() + 9 * DAY));
    const plan = live();
    expect(plan.pace).toBeDefined();
    const fresh = { ...plan };
    delete fresh.pace;
    // No pinned cut: the morning's own arithmetic, from scratch.
    expect(() => khatmahPaceToday(fresh)).not.toThrow();
    expect(() => khatmahGap(fresh)).not.toThrow();
    expect(() => khatmahUnreadPages(fresh)).not.toThrow();
    expect(() => khatmahPerDayPages(fresh)).not.toThrow();
    expect(() => khatmahCurrentPortion(fresh)).not.toThrow();
    expect(khatmahGap(fresh)!.pages).toBe(1);
    expect(khatmahUnreadPages(fresh)).toBe(604 - khatmahReachPage(fresh) + 1);
  });
});

describe('a plan begun partway through the book', () => {
  it('solves for the pages in front of the reader, not the whole muṣḥaf', () => {
    // Standing on page 143 with nothing read yet: the pages before it
    // count as read (`fromPage`), the rest is ahead, and the reach is
    // still zero. The estimate has to divide the right thing, or a long
    // request lands outside the walk that corrects the rounding.
    __resetQuranStateForTests();
    startKhatmah(30, { page: 143 });
    const fresh = live();
    const ahead = 604 - fresh.fromPage!;
    const slowest = khatmahDaysLeft({ ...fresh, targetDays: ahead });
    for (const want of [1, 7, 30, 120, 300, ahead, 700]) {
      const targetDays = khatmahDurationForDaysLeft(fresh, want);
      expect(khatmahDaysLeft({ ...fresh, targetDays })).toBe(Math.min(want, slowest));
    }
  });

  it('and measures a re-pace from the plan\'s own start, never from page one', () => {
    __resetQuranStateForTests();
    startKhatmah(30, { page: 143 });
    setKhatmahDuration(20);
    expect(live().pacedFrom).toBe(live().fromPage);
    expect(live().pacedFrom).toBeGreaterThan(100);
    expect(khatmahBehindBy(live())).toBe(0);
  });
});

describe('restarting the khatmah is a fresh schedule', () => {
  it('measures from page one again, not from where the old one was re-paced', () => {
    reading(30, 300);
    setKhatmahDuration(7);
    resetKhatmahAll();
    const again = live();
    expect(again.pacedFrom).toBe(0);
    expect(khatmahBehindBy(again)).toBe(0);
    expect(again.pace).toBeUndefined();
    // The length it had is the plan; the reading is what restarted.
    expect(khatmahDaysLeft(again)).toBe(again.targetDays);
  });
});

/**
 * RE-PACED AFTER MAGHRIB — which is when people read.
 *
 * The store's day rolled at sunset, so at ten in the evening it is already
 * tomorrow as far as the khatmah is concerned; the civil date of the
 * instant still says today. A schedule counted from the instant is a day
 * behind by the next morning without a day having passed, and tomorrow's
 * portion reads "today". `pacedDay` is the store's own day, written at
 * the moment only the store knows it.
 */
describe('a decision taken between maghrib and midnight', () => {
  const evening = new Date(2026, 8, 18, 22).getTime();
  const nextMorning = new Date(2026, 8, 19, 10).getTime();
  const dayAfter = new Date(2026, 8, 20, 10).getTime();

  beforeEach(() => {
    jest.useFakeTimers({ now: evening });
    setTodaysMaghrib(new Date(2026, 8, 18, 19));
  });
  afterEach(() => {
    setTodaysMaghrib(null);
    _resetIslamicDay();
    jest.useRealTimers();
  });

  it('counts from the day the store was on, which is tomorrow\'s date', () => {
    reading(30, 100);
    setKhatmahDuration(10);
    const plan = live();
    expect(plan.pacedDay).toBe('2026-09-19');
    const today = khatmahCurrentPortion(plan).day;

    // Tonight: behind nothing, today is today, tomorrow is tomorrow.
    expect(khatmahBehindBy(plan, evening)).toBe(0);
    expect(khatmahDayWhen(khatmahDayAnchor(plan), today, evening).kind).toBe('today');
    expect(khatmahDayWhen(khatmahDayAnchor(plan), today + 1, evening).kind).toBe('tomorrow');

    // The next morning, with last night's maghrib forgotten: still the
    // same Islamic day, so still behind nothing and still today.
    setTodaysMaghrib(null);
    expect(khatmahBehindBy(plan, nextMorning)).toBe(0);
    expect(khatmahDayWhen(khatmahDayAnchor(plan), today, nextMorning).kind).toBe('today');
    expect(khatmahDayWhen(khatmahDayAnchor(plan), today + 1, nextMorning).kind).toBe('tomorrow');

    // A day later a day has passed, and it says so.
    expect(khatmahBehindBy(plan, dayAfter)).toBeGreaterThan(0);
  });

  it('which the instant alone would have got wrong', () => {
    reading(30, 100);
    setKhatmahDuration(10);
    const fromInstant = { ...live() };
    delete fromInstant.pacedDay;
    setTodaysMaghrib(null);
    // Counted from the civil date of 22:00 on the 18th, the plan is a
    // day behind on the morning of the 19th — the day it was made.
    expect(khatmahBehindBy(fromInstant, nextMorning)).toBeGreaterThan(0);
  });
});

describe('what survives the trip through storage', () => {
  const stored = (plan: Record<string, unknown>) =>
    coerceQuranState({ khatmah: [plan] }).khatmah[0];
  const base = {
    id: 'k',
    startedAt: 1_000,
    targetDays: 30,
    pagesRead: 0,
    completedAt: null,
  };

  it('keeps the day and the page beside a real stamp', () => {
    const plan = stored({ ...base, pacedAt: 5_000, pacedDay: '2026-09-19', pacedFrom: 210 });
    expect(plan.pacedAt).toBe(5_000);
    expect(plan.pacedDay).toBe('2026-09-19');
    expect(plan.pacedFrom).toBe(210);
  });

  it('drops a stamp that is not an instant, and everything that rode on it', () => {
    for (const pacedAt of [0, -1, Number.NaN, 'yesterday']) {
      const plan = stored({ ...base, pacedAt, pacedDay: '2026-09-19', pacedFrom: 210 });
      expect(plan.pacedAt).toBeUndefined();
      expect(plan.pacedDay).toBeUndefined();
      expect(plan.pacedFrom).toBeUndefined();
    }
  });

  it('drops a day that is not a day, and a page that is not a page', () => {
    const plan = stored({ ...base, pacedAt: 5_000, pacedDay: 'Friday', pacedFrom: 900 });
    expect(plan.pacedAt).toBe(5_000);
    expect(plan.pacedDay).toBeUndefined();
    expect(plan.pacedFrom).toBeUndefined();
  });

  it('still reads the name the stamp had in the first builds', () => {
    expect(stored({ ...base, deadlineAt: 4_000, deadline: '2026-12-01' }).pacedAt).toBe(4_000);
  });
});

describe('two devices, one plan, and two answers to the same question', () => {
  const base: KhatmahPlan = {
    id: 'k',
    startedAt: 1_000,
    targetDays: 30,
    pagesRead: 0,
    completedAt: null,
  };
  const pacing = (p: KhatmahPlan) => [p.targetDays, p.deadline ?? null, p.pacedFrom ?? null];

  const phone: KhatmahPlan = {
    ...base,
    targetDays: 44,
    pacedAt: 3_000,
    pacedFrom: 210,
  };
  const mac: KhatmahPlan = {
    ...base,
    targetDays: 30,
    deadline: '2026-12-01',
    pacedAt: 2_000,
    pacedFrom: 190,
  };

  it('takes the newest word, whole', () => {
    const [merged] = mergeKhatmah([mac], [phone]);
    expect(pacing(merged)).toEqual(pacing(phone));
    expect(merged.deadline).toBeUndefined();
    // And the cut that belonged to the date goes with it.
    expect(merged.pace).toBeUndefined();
  });

  it('the same way round either way, and the same merged with itself', () => {
    const one = mergeKhatmah([mac], [phone])[0];
    const other = mergeKhatmah([phone], [mac])[0];
    expect(pacing(other)).toEqual(pacing(one));
    expect(mergeKhatmah([one], [one])[0]).toEqual(one);
  });

  it('never half of each — the pair is one decision', () => {
    // The failure this rules out: "in 44 days" from the phone and "by 1
    // December" from the Mac merging into a plan that is neither, which
    // is what settling the two fields separately would do.
    for (const pair of [
      [mac, phone],
      [phone, mac],
      [mac, { ...phone, pacedAt: 2_000 }],
      [{ ...mac, pacedAt: 9_000 }, phone],
    ] as Array<[KhatmahPlan, KhatmahPlan]>) {
      const merged = mergeKhatmah([pair[0]], [pair[1]])[0];
      expect([pacing(pair[0]), pacing(pair[1])]).toContainEqual(pacing(merged));
    }
  });

  it('lets a duration win a tie, because an absence could never claim one', () => {
    const tiedDate = { ...mac, pacedAt: 5_000 };
    const tiedDays = { ...phone, pacedAt: 5_000 };
    for (const [a, b] of [
      [tiedDate, tiedDays],
      [tiedDays, tiedDate],
    ]) {
      const merged = mergeKhatmah([a], [b])[0];
      expect(merged.deadline).toBeUndefined();
      expect(merged.targetDays).toBe(44);
    }
  });

  it('keeps the old rule for two plans that predate the stamp', () => {
    // Undated, "no date" cannot be told from "a date nobody set", so
    // dropping one would throw away a date an un-updated device cannot
    // re-send. Length is the max it always was.
    const old = { ...base, targetDays: 30 };
    const dated = { ...base, targetDays: 60, deadline: '2026-12-01' };
    const merged = mergeKhatmah([old], [dated])[0];
    expect(merged.targetDays).toBe(60);
    expect(merged.deadline).toBe('2026-12-01');
    expect(merged.pacedAt).toBeUndefined();
  });

  it('and a dated claim beats an un-updated device that cannot make one', () => {
    const merged = mergeKhatmah([{ ...base, targetDays: 90 }], [phone])[0];
    expect(pacing(merged)).toEqual(pacing(phone));
  });

  it('sends today\'s cut with the date it was cut for', () => {
    // Both devices cut the same day. The Mac cut it for 1 December (20
    // pages); the phone then moved the date to 3 October and re-cut the
    // same day (60 pages). The earlier, shorter cut must not win the day
    // back — the date it was made for is gone.
    const macCut = { ...mac, pace: { day: '2026-09-20', from: 1000, to: 1400 } };
    const phoneMoved = {
      ...phone,
      deadline: '2026-10-03',
      pace: { day: '2026-09-20', from: 1000, to: 2200 },
    };
    for (const [a, b] of [
      [macCut, phoneMoved],
      [phoneMoved, macCut],
    ]) {
      const merged = mergeKhatmah([a], [b])[0];
      expect(merged.deadline).toBe('2026-10-03');
      expect(merged.pace).toEqual(phoneMoved.pace);
    }
    // Same date on both sides: the earliest cut still wins the day, as
    // it always did.
    const sameDate = { ...macCut, deadline: '2026-10-03', pacedAt: phoneMoved.pacedAt };
    expect(mergeKhatmah([sameDate], [phoneMoved])[0].pace).toEqual(macCut.pace);
  });

  it('does not hand the winner the loser\'s page', () => {
    const noPage = { ...phone, pacedFrom: undefined };
    const merged = mergeKhatmah([mac], [noPage])[0];
    expect(merged.pacedFrom).toBeUndefined();
    expect('pacedFrom' in merged).toBe(false);
  });
});
