/**
 * Sunnah prayers — the voluntary prayers attached to each fard prayer.
 *
 * WHY THIS IS NOT IN `journal.ts`. The journal is a flat array of entries
 * keyed by `(date, prayer)`, and `coerceJournalEntries` whitelists exactly the
 * five fard prayer names and four statuses — anything else it finds is
 * SILENTLY DROPPED on the next read. Three separate places write that array
 * (the Log screen, the notification action, the end-of-day reminder), and its
 * `kept` score is consumed as `kept / 5` by the graph. A sunnah entry living
 * in there would have to widen the validator in a build that ships before any
 * build that writes one, thread a new field through all three writers, and be
 * kept out of `kept` by hand. Its own store costs none of that and cannot
 * corrupt a log of obligatory prayers, which is the data users care about most.
 *
 * The shape is a map of day → counts, like `DhikrLog`, rather than a list of
 * events. A day is a small fixed set of yes/no-ish facts, and asking "what did
 * this day hold" is the only question anything asks.
 *
 * A day that was never touched is simply absent, and absent reads as all
 * zeros — so there is no migration, and an install that predates this feature
 * starts empty rather than wrong.
 */
import type { JournalPrayer } from './journal';

/**
 * How many sunnah prayers each fard prayer carries.
 *
 * These are the sunnah mu'akkadah as this app counts them. They differ by
 * school — Hanafis commonly count four before Dhuhr and four before Asr — and
 * this table is deliberately fixed rather than derived from the school
 * setting: the totals are the denominator of both the day's ring and the
 * streak, so a per-user denominator would have to be stored per day to keep
 * old days meaning what they meant when they were logged. If that becomes
 * wanted, the migration is to stamp each stored day with the total it was
 * judged against, and this table becomes the default rather than the rule.
 *
 * Asr is zero, and it is drawn rather than hidden — see the Log screen.
 */
export const SUNNAH_UNITS: Record<JournalPrayer, number> = {
  Fajr: 1,
  Dhuhr: 2,
  Asr: 0,
  Maghrib: 1,
  Isha: 2,
};

/** Witr is one unit, and it counts toward the day like any other. */
export const WITR_UNITS = 1;

/**
 * Everything a complete day holds: the five prayers' sunnah plus Witr.
 *
 * Qiyam al-Layl is NOT in here. It has no fixed number to be complete
 * against, so including it would make a full day unreachable and the streak
 * meaningless. It is recorded and celebrated, just not scored.
 */
export const SUNNAH_TOTAL =
  Object.values(SUNNAH_UNITS).reduce((a, b) => a + b, 0) + WITR_UNITS;

export type SunnahDay = {
  fajr: number;
  dhuhr: number;
  maghrib: number;
  isha: number;
  witr: boolean;
  /** Voluntary night prayer. Unbounded, uncounted, reset by its own button. */
  qiyam: number;
};

/** `YYYY-MM-DD` (local) → that day's counts. Absent day = `EMPTY_DAY`. */
export type SunnahLog = Record<string, SunnahDay>;

export const EMPTY_DAY: SunnahDay = {
  fajr: 0,
  dhuhr: 0,
  maghrib: 0,
  isha: 0,
  witr: false,
  qiyam: 0,
};

/** The countable prayers, in the order they are prayed. */
const COUNTED: Array<{ field: keyof SunnahDay; prayer: JournalPrayer }> = [
  { field: 'fajr', prayer: 'Fajr' },
  { field: 'dhuhr', prayer: 'Dhuhr' },
  { field: 'maghrib', prayer: 'Maghrib' },
  { field: 'isha', prayer: 'Isha' },
];

function clampCount(value: unknown, max: number): number {
  const n =
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  if (n <= 0) return 0;
  return n > max ? max : n;
}

export function isEmptyDay(day: SunnahDay): boolean {
  return (
    day.fajr === 0 &&
    day.dhuhr === 0 &&
    day.maghrib === 0 &&
    day.isha === 0 &&
    !day.witr &&
    day.qiyam === 0
  );
}

/**
 * Read a stored blob back into a log, keeping only what makes sense.
 *
 * Tolerant in the same way `coerceDhikr` is: a value that is impossible for
 * its field is clamped rather than thrown away, because the alternative is
 * losing a day of someone's record over one bad number. A day whose key is
 * not a date, or which holds nothing at all, is dropped — an empty day and an
 * absent day are the same day, and storing both would grow the blob forever.
 */
export function coerceSunnahLog(input: unknown): SunnahLog {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: SunnahLog = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const day: SunnahDay = {
      fajr: clampCount(r.fajr, SUNNAH_UNITS.Fajr),
      dhuhr: clampCount(r.dhuhr, SUNNAH_UNITS.Dhuhr),
      maghrib: clampCount(r.maghrib, SUNNAH_UNITS.Maghrib),
      isha: clampCount(r.isha, SUNNAH_UNITS.Isha),
      witr: r.witr === true,
      // No ceiling: someone praying twenty rak'ah of qiyam is not an error.
      qiyam: clampCount(r.qiyam, Number.MAX_SAFE_INTEGER),
    };
    if (!isEmptyDay(day)) out[key] = day;
  }
  return out;
}

/** The day at `date`, or an all-zero day. Never returns undefined. */
export function dayAt(log: SunnahLog, date: string): SunnahDay {
  return log[date] ?? EMPTY_DAY;
}

/**
 * What the next tap on a prayer's sunnah tile should record.
 *
 * One tile, cycling: for a one-unit prayer a tap logs it and the next clears
 * it; for a two-unit prayer the taps read one, two, then cleared. Wrapping
 * past the maximum is what makes the control undoable without a second
 * button, which matters because this sits in a row that already has four.
 *
 * `max === 0` (Asr) can never leave zero — the tile is not pressable, and
 * this is the second line of defence.
 */
export function cycleSunnah(current: number, max: number): number {
  if (max <= 0) return 0;
  const at = current < 0 ? 0 : Math.floor(current);
  return at >= max ? 0 : at + 1;
}

/** How many of the day's countable sunnah prayers are logged (0…SUNNAH_TOTAL). */
export function sunnahCount(day: SunnahDay): number {
  let n = 0;
  for (const { field, prayer } of COUNTED) {
    n += Math.min(day[field] as number, SUNNAH_UNITS[prayer]);
  }
  return n + (day.witr ? WITR_UNITS : 0);
}

/** 0…1, for the ring. Qiyam is excluded, so a full ring is reachable. */
export function sunnahFraction(day: SunnahDay): number {
  if (SUNNAH_TOTAL <= 0) return 0;
  return sunnahCount(day) / SUNNAH_TOTAL;
}

export function isSunnahComplete(day: SunnahDay): boolean {
  return sunnahCount(day) >= SUNNAH_TOTAL;
}

/**
 * How much of each side of the square the gold line covers, as fractions of
 * that side's length: `[top, right, bottom, left]`.
 *
 * The line is DRAWN ROUND THE SQUARE rather than faded in place. Opacity says
 * "some sunnah"; a line that has travelled two sides of four says "about
 * half", and can be read against its neighbours without a legend. It also
 * matches the fasting ring it sits inside, so the two read as the same kind
 * of mark rather than two unrelated ideas.
 *
 * Clockwise from the top-left corner, because that is where a reader's eye
 * starts and the direction a clock hand travels — the one convention for
 * "progress round a shape" that needs no explaining.
 *
 * A real arc would need `react-native-svg` on every square of every week
 * across years of history, on a scroll surface that already cost a release to
 * make smooth. Four straight segments are four plain Views, and a complete
 * day collapses to a single bordered one.
 */
export function ringSegments(
  fraction: number,
): [number, number, number, number] {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const travelled = f * 4;
  return [0, 1, 2, 3].map(side =>
    Math.min(1, Math.max(0, travelled - side)),
  ) as [number, number, number, number];
}

/**
 * Merge a change into a day, dropping the day again if it empties out.
 *
 * Patch-style on purpose. `upsertEntry` in the journal rebuilds its object
 * from scratch and loses the note that was on it; that bug is not worth
 * repeating in a second store.
 */
export function setSunnah(
  log: SunnahLog,
  date: string,
  patch: Partial<SunnahDay>,
): SunnahLog {
  const next: SunnahDay = { ...dayAt(log, date), ...patch };
  const out = { ...log };
  if (isEmptyDay(next)) delete out[date];
  else out[date] = next;
  return out;
}

/** Field name for a prayer, or null for one that carries no sunnah. */
export function fieldFor(prayer: JournalPrayer): keyof SunnahDay | null {
  const hit = COUNTED.find(c => c.prayer === prayer);
  return hit ? hit.field : null;
}

function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Consecutive days, ending today or yesterday, on which every sunnah prayer
 * and Witr were logged.
 *
 * ENDING TODAY *OR* YESTERDAY, deliberately. The prayer streak next door
 * counts back from today and breaks the moment today is incomplete, so it
 * reads "0 days" every morning until the fifth prayer goes in — it tells a
 * user who has prayed for three months that they have a streak of nothing,
 * over breakfast. A streak is a claim about the past. Today is not over, so
 * an unfinished today neither extends it nor ends it; a finished today does
 * extend it.
 *
 * Qiyam is not consulted: it has no complete, so it cannot break a chain.
 */
export function computeSunnahStreak(
  log: SunnahLog,
  now: Date = new Date(),
): number {
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);

  let streak = 0;
  // Today only counts while it is complete; an unfinished today is simply not
  // yet part of the record, so start from yesterday instead of breaking.
  if (!isSunnahComplete(dayAt(log, dayKeyOf(cursor)))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  // A year and a day of history is more than any streak needs, and bounds the
  // loop against a corrupt clock.
  for (let i = 0; i < 366; i++) {
    if (!isSunnahComplete(dayAt(log, dayKeyOf(cursor)))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Days holding any Qiyam al-Layl — the heart on the graph. */
export function qiyamDays(log: SunnahLog): Set<string> {
  const out = new Set<string>();
  for (const [date, day] of Object.entries(log)) {
    if (day.qiyam > 0) out.add(date);
  }
  return out;
}
