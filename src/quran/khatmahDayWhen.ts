/**
 * When a khatmah day's reading is due, said the way a person would.
 *
 * "Finish day 5" is a number out of a plan, and a plan's day numbers are
 * only meaningful next to a calendar. The button asks you to finish a
 * day's reading without ever saying which day that is, so a reader who
 * has lost count of where they are cannot tell from it whether they are
 * on schedule, a day ahead, or a week behind.
 *
 * A plan's day N is due N-1 days after it began. That is the whole
 * arithmetic; the rest is deciding what to call the answer.
 *
 * Anything already due — today or earlier — is "today", because that is
 * what it means for the reader: it is the reading in front of them now.
 * Naming the Monday of a week they have fallen behind would be accurate
 * and useless. Tomorrow gets its own word; the next few days get their
 * weekday, which is how people talk about the week ahead; and beyond
 * that a date, because "Thursday" three weeks out is not a date anyone
 * can place.
 */
export type DayWhen =
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'weekday'; at: Date }
  | { kind: 'date'; at: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days from today to the day `at` falls on. Negative is the past. */
export function daysAway(at: number, now: number): number {
  return Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
}

/** When day `day` of a plan begun at `startedAt` is due. */
export function khatmahDayWhen(
  startedAt: number,
  day: number,
  now: number = Date.now(),
): DayWhen {
  const at = new Date(startOfDay(startedAt) + (Math.max(1, day) - 1) * DAY_MS);
  const away = daysAway(at.getTime(), now);
  if (away <= 0) return { kind: 'today' };
  if (away === 1) return { kind: 'tomorrow' };
  if (away <= 6) return { kind: 'weekday', at };
  return { kind: 'date', at };
}

/**
 * The parenthesised half of "Finish day 5 (today)".
 *
 * `t` is passed rather than imported so that the caller's language wins —
 * the shared month sheet renders in a language of its own.
 */
export function formatDayWhen(
  when: DayWhen,
  t: (key: string, opts: { defaultValue: string }) => string,
  locale: string,
): string {
  if (when.kind === 'today') return t('quran.dueToday', { defaultValue: 'today' });
  if (when.kind === 'tomorrow') {
    return t('quran.dueTomorrow', { defaultValue: 'tomorrow' });
  }
  try {
    return when.kind === 'weekday'
      ? new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(when.at)
      : new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
        }).format(when.at);
  } catch {
    return when.at.toDateString();
  }
}
