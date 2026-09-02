/**
 * Which portion of a khatmah the reader is in.
 *
 * The rule under test is one sentence — the current portion is the one
 * holding the next unread ayah — and everything the feature promises has
 * to fall out of it without a second mechanism:
 *
 *   • finishing the day makes tomorrow's reading available immediately;
 *   • stopping partway into a later portion makes THAT one current;
 *   • finishing a portion read ahead makes the one after it current;
 *   • the day still reads as done afterwards, with the rest as extra.
 *
 * The failure this guards against is the reader opening the app and being
 * shown somewhere other than where they stopped, which is the one thing
 * this feature must never do.
 */
import {
  khatmahCurrentPortion,
  khatmahDay,
  khatmahMarkerAyah,
  khatmahPortion,
  khatmahPortionOf,
  type KhatmahPlan,
} from '../src/quran/quranState';
import { TOTAL_AYAHS, ayahAtIndex, ayahIndexOf } from '../src/quran/ayahIndex';
import { findPageForAyah } from '../src/quran/pages';

/** The Ḥafṣ page an ayah index falls on — the unit a plan is cut in. */
function hafsPageOf(index: number): number {
  const at = ayahAtIndex(index);
  return findPageForAyah(at.surah, at.ayah, 'hafs');
}

const DAY = 24 * 60 * 60 * 1000;

function plan(over: Partial<KhatmahPlan> = {}): KhatmahPlan {
  return {
    id: 'p',
    startedAt: Date.now(),
    targetDays: 30,
    pagesRead: 0,
    ayahsRead: 0,
    completedAt: null,
    ...over,
  };
}

describe('cutting the book into portions', () => {
  it('covers every ayah exactly once, with no gap and no overlap', () => {
    for (const targetDays of [1, 7, 30, 40, 60, 90, 365]) {
      const p = plan({ targetDays });
      let expected = 1;
      for (let d = 1; d <= targetDays; d++) {
        const portion = khatmahPortion(p, d);
        expect([targetDays, d, portion.from]).toEqual([targetDays, d, expected]);
        expect(portion.to).toBeGreaterThanOrEqual(portion.from);
        expected = portion.to + 1;
      }
      expect([targetDays, expected]).toEqual([targetDays, TOTAL_AYAHS + 1]);
    }
  });

  it('puts every ayah in the portion that contains it', () => {
    // Every boundary, and a couple either side of it — the rounding of the
    // boundaries is where an off-by-one would hide.
    const p = plan({ targetDays: 30 });
    for (let d = 1; d <= 30; d++) {
      const { from, to } = khatmahPortion(p, d);
      for (const at of [from, from + 1, to - 1, to]) {
        expect([d, at, khatmahPortionOf(p, at)]).toEqual([d, at, d]);
      }
    }
  });

  it('keeps the whole book in one portion when the plan is one day', () => {
    const p = plan({ targetDays: 1 });
    expect(khatmahPortion(p, 1)).toEqual({ day: 1, from: 1, to: TOTAL_AYAHS });
    expect(khatmahPortionOf(p, TOTAL_AYAHS)).toBe(1);
  });
});

describe('which portion the reader is in', () => {
  it('starts on the first', () => {
    expect(khatmahCurrentPortion(plan()).day).toBe(1);
  });

  it('stays on it while it is unfinished', () => {
    const p = plan();
    const first = khatmahPortion(p, 1);
    for (const read of [1, Math.floor(first.to / 2), first.to - 1]) {
      expect(khatmahCurrentPortion(plan({ ayahsRead: read })).day).toBe(1);
    }
  });

  it('moves to the next the moment the day is finished', () => {
    // Not at midnight: reading tomorrow's portion is available tonight.
    const p = plan();
    const done = khatmahPortion(p, 1).to;
    expect(khatmahCurrentPortion(plan({ ayahsRead: done })).day).toBe(2);
  });

  it('follows the reader into a portion far ahead of the calendar', () => {
    const p = plan();
    const ninth = khatmahPortion(p, 9);
    const halfway = Math.floor((ninth.from + ninth.to) / 2);
    expect(khatmahCurrentPortion(plan({ ayahsRead: halfway })).day).toBe(9);
  });

  it('moves past a portion the reader finished ahead of time', () => {
    const p = plan();
    expect(
      khatmahCurrentPortion(plan({ ayahsRead: khatmahPortion(p, 9).to })).day,
    ).toBe(10);
  });

  it('marks the ayah that closes the portion in hand', () => {
    const p = plan({ ayahsRead: 40 });
    const mark = khatmahMarkerAyah(p)!;
    expect(ayahIndexOf(mark.surah, mark.ayah)).toBe(
      khatmahCurrentPortion(p).to,
    );
  });

  it('has nothing left to mark once the book is read', () => {
    expect(khatmahMarkerAyah(plan({ ayahsRead: TOTAL_AYAHS }))).toBeNull();
  });
});

describe('the day, and what is read past it', () => {
  const today = '2026-09-01';
  const now = new Date(`${today}T12:00:00`).getTime();

  it('is the portion in hand when nothing has been read today', () => {
    const p = plan({ ayahsRead: 300, dayStartDate: '2026-08-30' });
    const day = khatmahDay(p, now);
    expect(day.portion.day).toBe(khatmahCurrentPortion(p).day);
    expect(day.done).toBe(false);
    expect(day.extra).toBe(0);
  });

  it('counts what has been read of it', () => {
    const p = plan();
    const first = khatmahPortion(p, 1);
    const state = khatmahDay(
      plan({
        ayahsRead: first.from + 9,
        dayStartDate: today,
        dayStartAyahsRead: 0,
      }),
      now,
    );
    expect(state.portion.day).toBe(1);
    expect(state.read).toBe(10);
    expect(state.length).toBe(first.to);
    expect(state.done).toBe(false);
  });

  it('stays done, and calls the rest extra, when the reader carries on', () => {
    // The whole point: finishing and reading on must not quietly turn into
    // a fresh unfinished day.
    const p = plan();
    const first = khatmahPortion(p, 1);
    const state = khatmahDay(
      plan({
        ayahsRead: first.to + 25,
        dayStartDate: today,
        dayStartAyahsRead: 0,
      }),
      now,
    );
    expect(state.portion.day).toBe(1);
    expect(state.done).toBe(true);
    expect(state.read).toBe(state.length);
    expect(state.extra).toBe(25);
  });

  it('rolls on to the portion the reader is in when the day turns', () => {
    // Same progress as above, but the snapshot belongs to a past day: the
    // extra read yesterday is simply where the reader now is.
    const p = plan();
    const first = khatmahPortion(p, 1);
    const state = khatmahDay(
      plan({
        ayahsRead: first.to + 25,
        dayStartDate: '2026-08-31',
        dayStartAyahsRead: 0,
      }),
      now,
    );
    expect(state.portion.day).toBe(2);
    expect(state.done).toBe(false);
    expect(state.read).toBe(25);
    expect(state.extra).toBe(0);
  });

  it('reads a plan written before any of this existed', () => {
    // No ayahsRead and no day snapshot — only the old Hafs page count.
    const state = khatmahDay(plan({ ayahsRead: undefined, pagesRead: 100 }), now);
    expect(state.portion.day).toBeGreaterThan(1);
    expect(state.extra).toBe(0);
    expect(Number.isFinite(state.read)).toBe(true);
  });

  it('survives a day snapshot ahead of the progress', () => {
    // A rewind can leave the two crossed; the day must not go negative.
    const state = khatmahDay(
      plan({ ayahsRead: 50, dayStartDate: today, dayStartAyahsRead: 900 }),
      now,
    );
    expect(state.read).toBeGreaterThanOrEqual(0);
    expect(state.extra).toBe(0);
    expect(state.portion.day).toBe(khatmahCurrentPortion(plan({ ayahsRead: 50 })).day);
  });

  it('does not care how long ago the plan started', () => {
    // Progress decides the portion, never the calendar — a reader who
    // opens the app after a month away is where they stopped.
    const stale = plan({
      startedAt: Date.now() - 60 * DAY,
      ayahsRead: khatmahPortion(plan(), 3).to,
    });
    expect(khatmahCurrentPortion(stale).day).toBe(4);
  });
});

/**
 * A khatmah that was already under way when the tracker heard about it
 * (issue #17).
 *
 * The reader gives two things — where they are, and how long the rest
 * should take — and both have to land. Seeding only the progress would
 * cut the portions for a book they are not starting: a thirty-day plan
 * begun at page 143 would spend its first five days on ground already
 * behind the reader and then ask for the last 461 pages in twenty-five.
 */
describe('a plan begun partway through the book', () => {
  it('still covers every ayah from the start onwards, once', () => {
    for (const fromPage of [1, 143, 300, 603]) {
      for (const targetDays of [1, 7, 30, 90]) {
        const p = plan({ targetDays, fromPage });
        const first = khatmahPortion(p, 1).from;
        let expected = first;
        for (let d = 1; d <= targetDays; d++) {
          const portion = khatmahPortion(p, d);
          expect([fromPage, targetDays, d, portion.from]).toEqual([
            fromPage,
            targetDays,
            d,
            expected,
          ]);
          expect(portion.to).toBeGreaterThanOrEqual(portion.from - 1);
          expected = portion.to + 1;
        }
        expect([fromPage, targetDays, expected]).toEqual([
          fromPage,
          targetDays,
          TOTAL_AYAHS + 1,
        ]);
      }
    }
  });

  it('opens on the reader, not on the first page of the book', () => {
    const p = plan({ targetDays: 30, fromPage: 143, ayahsRead: 0 });
    // Portion one begins on page 144 — the page after the one the reader
    // said they were on, which is the first they have not finished.
    expect(hafsPageOf(khatmahPortion(p, 1).from)).toBe(144);
  });

  it('spreads what is left, not the whole book', () => {
    // 604 pages over 30 days is 20 or 21 a day. 604 − 143 = 461 over the
    // same 30 is 15 or 16, and that is the whole point: the reader asked
    // for thirty days for the REST, not thirty days for a book they are
    // already a quarter of the way through.
    const days = (pl: KhatmahPlan) => {
      const out: number[] = [];
      for (let d = 1; d <= 30; d++) {
        const portion = khatmahPortion(pl, d);
        out.push(hafsPageOf(portion.to) - hafsPageOf(portion.from) + 1);
      }
      return out;
    };
    for (const n of days(plan({ targetDays: 30, fromPage: 143 }))) {
      expect(n).toBeGreaterThanOrEqual(15);
      expect(n).toBeLessThanOrEqual(16);
    }
    for (const n of days(plan({ targetDays: 30 }))) {
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(21);
    }
  });

  it('puts the reader on day one on the day they set it up', () => {
    // The whole complaint: seeded progress against a full-book cut showed
    // someone at page 143 as already five days in and nothing to read.
    const from = 143;
    const p = plan({ targetDays: 30, fromPage: from });
    const seeded = { ...p, ayahsRead: khatmahPortion(p, 1).from - 1 };
    expect(khatmahCurrentPortion(seeded).day).toBe(1);
    const day = khatmahDay(seeded, Date.now());
    expect(day.portion.day).toBe(1);
    expect(day.done).toBe(false);
    expect(day.read).toBe(0);
    expect(day.extra).toBe(0);
  });

  it('finishes on the last day, wherever it began', () => {
    const p = plan({ targetDays: 30, fromPage: 143 });
    expect(khatmahPortion(p, 30).to).toBe(TOTAL_AYAHS);
    expect(khatmahPortionOf(p, TOTAL_AYAHS)).toBe(30);
  });

  it('is the old plan exactly when it starts at the opening', () => {
    for (const targetDays of [7, 30, 90]) {
      for (let d = 1; d <= targetDays; d++) {
        expect(khatmahPortion(plan({ targetDays, fromPage: 0 }), d)).toEqual(
          khatmahPortion(plan({ targetDays }), d),
        );
      }
    }
  });

  it('gives the marker an ayah inside the plan, not behind it', () => {
    const p = plan({ targetDays: 30, fromPage: 143 });
    const seeded = { ...p, ayahsRead: khatmahPortion(p, 1).from - 1 };
    const marker = khatmahMarkerAyah(seeded);
    expect(marker).not.toBeNull();
    expect(ayahIndexOf(marker!.surah, marker!.ayah)).toBe(
      khatmahPortion(p, 1).to,
    );
  });
});
