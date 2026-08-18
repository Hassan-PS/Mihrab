/**
 * The two streaks in the Log caption, and the one rule they share.
 *
 * Both answer "how many days in a row", and they sit two words apart on the
 * same line, so the thing that matters most is that they agree about what
 * today is. They did not: the sunnah streak skipped an unfinished today and
 * the prayer streak counted from it, so a user with a month of perfect days
 * read "0-day streak · 30-day sunnah" every morning until Isha went in.
 *
 * Reported from real use: "yesterday is logged as all on time yet today has
 * no streak."
 *
 * Where they still differ is deliberate and tested below: a fard prayer can
 * be marked missed, which spoils today for good, and a sunnah cannot.
 */
import {
  computeCurrentStreak,
  computeLongestStreak,
} from '../src/journal/journal';
import type { JournalEntry, JournalStatus } from '../src/journal/journal';
import {
  computeSunnahStreak,
  setSunnah,
  type SunnahDay,
  type SunnahLog,
} from '../src/journal/sunnah';

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

function day(date: string, status: JournalStatus = 'on-time'): JournalEntry[] {
  return PRAYERS.map(prayer => ({
    date,
    prayer,
    status,
    loggedAt: '',
  }));
}

/** A run of perfect days ending the day before `days[0]`. */
function perfectRun(dates: string[]): JournalEntry[] {
  return dates.flatMap(d => day(d));
}

const full: SunnahDay = {
  fajr: 1,
  dhuhr: 2,
  maghrib: 1,
  isha: 2,
  witr: true,
  qiyam: 0,
};

const MORNING = new Date(2026, 7, 18, 7, 0); // Tue 18 Aug 2026, 07:00
const RUN = ['2026-08-15', '2026-08-16', '2026-08-17'];

describe('the prayer streak and an unfinished today', () => {
  it('survives a morning on which nothing has been logged yet', () => {
    // THE REPORTED BUG. Three perfect days behind, today untouched.
    expect(computeCurrentStreak(perfectRun(RUN), MORNING)).toBe(3);
  });

  it('survives a today that is partly logged and going well', () => {
    const entries = [
      ...perfectRun(RUN),
      { date: '2026-08-18', prayer: 'Fajr' as const, status: 'on-time' as const, loggedAt: '' },
    ];
    expect(computeCurrentStreak(entries, MORNING)).toBe(3);
  });

  it('counts today once it is complete, rather than double-counting it', () => {
    const entries = [...perfectRun(RUN), ...day('2026-08-18')];
    expect(computeCurrentStreak(entries, MORNING)).toBe(4);
  });

  it('agrees with the sunnah streak beside it on the same morning', () => {
    let log: SunnahLog = {};
    for (const d of RUN) log = setSunnah(log, d, full);
    expect(computeCurrentStreak(perfectRun(RUN), MORNING)).toBe(
      computeSunnahStreak(log, MORNING),
    );
  });
});

describe('a today that can no longer be perfect', () => {
  for (const status of ['late', 'missed', 'qadha'] as const) {
    it(`breaks now, not at midnight, once a prayer is marked ${status}`, () => {
      // Deliberately different from the sunnah streak: this is a fact about
      // today that no later prayer can take back, so carrying yesterday's
      // number for another twelve hours would be flattery.
      const entries = [
        ...perfectRun(RUN),
        { date: '2026-08-18', prayer: 'Fajr' as const, status, loggedAt: '' },
      ];
      expect(computeCurrentStreak(entries, MORNING)).toBe(0);
    });
  }

  it('still breaks when the rest of today went perfectly', () => {
    const entries = [
      ...perfectRun(RUN),
      ...PRAYERS.slice(0, 4).map(prayer => ({
        date: '2026-08-18',
        prayer,
        status: 'on-time' as const,
        loggedAt: '',
      })),
      { date: '2026-08-18', prayer: 'Isha' as const, status: 'missed' as const, loggedAt: '' },
    ];
    expect(computeCurrentStreak(entries, MORNING)).toBe(0);
  });
});

describe('what breaks a run in the past', () => {
  it('is a day with no entries at all', () => {
    const entries = perfectRun(['2026-08-14', '2026-08-16', '2026-08-17']);
    expect(computeCurrentStreak(entries, MORNING)).toBe(2);
  });

  it('is a day that is short of the five', () => {
    const entries = [
      ...perfectRun(['2026-08-16', '2026-08-17']),
      ...PRAYERS.slice(0, 4).map(prayer => ({
        date: '2026-08-15',
        prayer,
        status: 'on-time' as const,
        loggedAt: '',
      })),
    ];
    expect(computeCurrentStreak(entries, MORNING)).toBe(2);
  });

  it('is one late prayer in an otherwise perfect day', () => {
    const entries = [
      ...perfectRun(['2026-08-16', '2026-08-17']),
      ...day('2026-08-15').map((e, i) =>
        i === 2 ? { ...e, status: 'late' as const } : e,
      ),
    ];
    expect(computeCurrentStreak(entries, MORNING)).toBe(2);
  });

  it('is nothing at all when the journal is empty', () => {
    expect(computeCurrentStreak([], MORNING)).toBe(0);
  });
});

describe('both streaks across a DST boundary', () => {
  // Europe puts the clock back at 03:00 on 25 Oct 2026. A cursor left on the
  // wall-clock time of `now` rather than anchored at noon can land on an
  // hour that repeats or does not exist, and count a day twice or skip one.
  const DATES = ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'];

  for (const hour of [0, 2, 3, 12, 23]) {
    it(`counts four days from ${String(hour).padStart(2, '0')}:30 on the 27th`, () => {
      const now = new Date(2026, 9, 27, hour, 30);
      expect(computeCurrentStreak(perfectRun(DATES), now)).toBe(4);
      let log: SunnahLog = {};
      for (const d of DATES) log = setSunnah(log, d, full);
      expect(computeSunnahStreak(log, now)).toBe(4);
    });
  }
});

describe('the streak is bounded', () => {
  it('stops at a year and a day rather than walking a corrupt clock', () => {
    const dates: string[] = [];
    const cursor = new Date(2026, 7, 18, 12, 0);
    for (let i = 0; i < 500; i++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() - 1);
    }
    const streak = computeCurrentStreak(perfectRun(dates), MORNING);
    expect(streak).toBeLessThanOrEqual(366);
    expect(streak).toBeGreaterThan(360);
  });
});

/** `n` consecutive dates ending at `end` (inclusive), oldest first. */
function run(end: string, n: number): string[] {
  const d = new Date(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
    12,
  );
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    out.unshift(`${y}-${m}-${dd}`);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

describe('the longest streak', () => {
  it('is nothing on an empty journal', () => {
    expect(computeLongestStreak([])).toBe(0);
  });

  it('is nothing when no day was ever complete', () => {
    const entries = PRAYERS.slice(0, 4).map(prayer => ({
      date: '2026-08-17',
      prayer,
      status: 'on-time' as const,
      loggedAt: '',
    }));
    expect(computeLongestStreak(entries)).toBe(0);
  });

  it('is one for a single perfect day', () => {
    expect(computeLongestStreak(day('2026-08-17'))).toBe(1);
  });

  it('measures an unbroken run', () => {
    expect(computeLongestStreak(perfectRun(run('2026-08-17', 9)))).toBe(9);
  });

  it('takes the best of several runs, not the latest or the first', () => {
    const entries = [
      ...perfectRun(run('2026-03-10', 3)),
      ...perfectRun(run('2026-05-20', 11)),
      ...perfectRun(run('2026-08-17', 4)),
    ];
    expect(computeLongestStreak(entries)).toBe(11);
  });

  it('is broken by one late prayer in the middle of a run', () => {
    const dates = run('2026-08-17', 9);
    const entries = [
      ...perfectRun(dates.filter(d => d !== dates[4])),
      ...day(dates[4], 'late'),
    ];
    // Four days each side of the spoiled one.
    expect(computeLongestStreak(entries)).toBe(4);
  });

  it('is broken by a missing day, not just a spoiled one', () => {
    const dates = run('2026-08-17', 9);
    const entries = perfectRun(dates.filter(d => d !== dates[6]));
    expect(computeLongestStreak(entries)).toBe(6);
  });

  it('counts across a month and a year boundary', () => {
    // 28 Dec 2025 to 4 Jan 2026 — eight days over both.
    expect(computeLongestStreak(perfectRun(run('2026-01-04', 8)))).toBe(8);
  });

  it('counts across a leap day', () => {
    expect(computeLongestStreak(perfectRun(run('2028-03-02', 6)))).toBe(6);
  });

  it('counts across the DST boundary in both directions', () => {
    // Europe springs forward 29 Mar 2026 and falls back 25 Oct 2026.
    expect(computeLongestStreak(perfectRun(run('2026-04-01', 10)))).toBe(10);
    expect(computeLongestStreak(perfectRun(run('2026-10-28', 10)))).toBe(10);
  });

  it('does not care what order the entries arrive in', () => {
    const forwards = perfectRun(run('2026-08-17', 7));
    const shuffled = [...forwards].reverse();
    expect(computeLongestStreak(shuffled)).toBe(
      computeLongestStreak(forwards),
    );
  });

  it('is not inflated by a day logged twice', () => {
    const entries = [...perfectRun(run('2026-08-17', 3)), ...day('2026-08-16')];
    expect(computeLongestStreak(entries)).toBe(3);
  });

  it('includes today when today is already perfect', () => {
    const entries = perfectRun(run('2026-08-18', 5));
    expect(computeLongestStreak(entries)).toBe(5);
    expect(computeCurrentStreak(entries, MORNING)).toBe(5);
  });
});

describe('the best is never smaller than the streak standing in it', () => {
  // The one invariant a user would actually notice being wrong: a caption
  // reading "12-day streak (best 9)" is nonsense. Both must measure a day
  // with the same ruler, which is why `isPerfect` is shared rather than
  // written twice.
  const cases: Array<[string, JournalEntry[]]> = [
    ['empty', []],
    ['one perfect day today', day('2026-08-18')],
    ['a run ending yesterday', perfectRun(run('2026-08-17', 6))],
    ['a run ending today', perfectRun(run('2026-08-18', 6))],
    [
      'a long past run and a short current one',
      [...perfectRun(run('2026-05-01', 20)), ...perfectRun(run('2026-08-17', 2))],
    ],
    [
      'a short past run and a long current one',
      [...perfectRun(run('2026-05-01', 2)), ...perfectRun(run('2026-08-17', 20))],
    ],
    [
      'today spoiled after a long run',
      [
        ...perfectRun(run('2026-08-17', 30)),
        { date: '2026-08-18', prayer: 'Fajr' as const, status: 'missed' as const, loggedAt: '' },
      ],
    ],
  ];

  for (const [name, entries] of cases) {
    it(`holds for ${name}`, () => {
      const current = computeCurrentStreak(entries, MORNING);
      const longest = computeLongestStreak(entries);
      expect(longest).toBeGreaterThanOrEqual(current);
    });
  }
});
