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
import { TOTAL_AYAHS, ayahIndexOf } from '../src/quran/ayahIndex';

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
