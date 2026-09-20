/**
 * The device's UTC offset, with the sign people read it in.
 *
 * `Date.getTimezoneOffset` returns the minutes to ADD to local time to
 * reach UTC, so a country at GMT+1 answers -60. That inversion has cost
 * this codebase an afternoon before; it is negated once, here, and nowhere
 * else, and everything downstream can say "+60 is GMT+1" and mean it.
 *
 * A leaf on purpose: both the prayer cache (which records the offset its
 * rows were written under) and the shift watch (which compares) need this,
 * and neither should have to import the other to get it — see issue #56.
 */
export function deviceUtcOffsetMinutes(at: Date = new Date()): number {
  return -at.getTimezoneOffset();
}

/**
 * "GMT+1", "GMT", "GMT-5:30" — an offset as a person would name it.
 *
 * GMT rather than UTC because that is the word the countries themselves
 * use when they announce these changes, and the word the reader will have
 * seen in the news that morning: Morocco's own announcement was that it
 * was "restoring GMT".
 */
export function formatUtcOffset(minutes: number): string {
  if (minutes === 0) return 'GMT';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return rest === 0
    ? `GMT${sign}${hours}`
    : `GMT${sign}${hours}:${String(rest).padStart(2, '0')}`;
}
