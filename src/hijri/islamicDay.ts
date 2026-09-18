/**
 * WHEN A DAY BEGINS — one answer, for an app that had five.
 *
 * The Islamic day begins at maghrib. Everything in this app that asked
 * "what happened today?" answered with the Gregorian local date instead,
 * and it answered it in five separate copies of the same function —
 * `localYmd` in the Qur'an store, `dayKey` in the practice store and
 * again in the journal's backfill, `dayKeyOf` in the sunnah log,
 * `formatLocalDate` on the fasting screen. Changing the boundary meant
 * changing it in five places and hoping, which is the real reason it had
 * never been changed.
 *
 * It matters most where the reading is: a khatmah read in Ramadan is
 * counted in Islamic days, and tarawih at 21:00 belongs to the day that
 * has just begun, not the one that is ending. It also fixes a smaller
 * thing that has nothing to do with the calendar — a sitting that runs
 * from 21:00 to 01:00 used to be split down the middle, the card
 * reporting the day done at 23:59 and a fresh empty portion at 00:01
 * while the reader had not moved.
 *
 * ── WHICH CIVIL DATE IS THE KEY ───────────────────────────────────────
 *
 * The one whose DAYLIGHT belongs to that Islamic day. After maghrib on
 * the 18th we are in the Islamic day whose daytime is the 19th, so the
 * key is the 19th: tonight's tarawih and tomorrow morning's fajr land
 * together, which is the whole point of having the boundary.
 *
 * Before maghrib — including the small hours, which are the back half of
 * an Islamic day that began last night — the key is today's own date. So
 * the shift is one bit: has maghrib passed yet today.
 *
 * ── AND WHEN MAGHRIB IS NOT KNOWN ─────────────────────────────────────
 *
 * Null, and the answer is the civil date, which is exactly what every
 * caller did before this file existed. Prayer times are cached, located
 * and occasionally absent; a day boundary that could not be computed
 * without them would make the khatmah's day depend on a network call.
 * Unknown means unchanged, never a guess.
 */

/** `YYYY-MM-DD` in local time — the shape every stored day key already has. */
export function civilDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * The civil date whose daylight belongs to the Islamic day holding `at`.
 *
 * `maghrib` is maghrib ON `at`'s own civil date. A maghrib belonging to
 * another date cannot answer this question, so it is ignored rather than
 * applied to the wrong day.
 */
export function islamicCivilDateAt(at: Date, maghrib: Date | null): Date {
  if (!maghrib || civilDayKey(maghrib) !== civilDayKey(at)) return new Date(at);
  if (at.getTime() < maghrib.getTime()) return new Date(at);
  const next = new Date(at);
  next.setDate(next.getDate() + 1);
  return next;
}

/** The same answer as a stored key. */
export function islamicDayKeyAt(at: Date, maghrib: Date | null): string {
  return civilDayKey(islamicCivilDateAt(at, maghrib));
}

/**
 * TODAY'S MAGHRIB, PUBLISHED ONCE AND READ FROM ANYWHERE.
 *
 * The screens that need the boundary are not the ones that load prayer
 * times. The Qur'an tab has no location and no timings and must not grow
 * either just to know what day it is, and reading the cache is a 170 KB
 * parse — not something to do on every render of a card.
 *
 * So whoever already holds today's timings publishes the one instant, and
 * everything else reads it synchronously. It is deliberately a single
 * value and not a schedule: the only question anyone asks of it is "has
 * maghrib passed", and a value for the wrong day answers it by declining
 * (`islamicCivilDateAt`) rather than by being subtly wrong.
 */
let published: Date | null = null;
let version = 0;
let wake: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** One day, in milliseconds — the longest wake worth scheduling. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ── WAKING AT THE BOUNDARY, WHICH NOTHING ELSE DID ────────────────────
 *
 * The stored maghrib does not change when maghrib arrives; `now` walks
 * past it. So every screen already on the glass kept the old day until
 * something unrelated re-rendered it — and for a reader sitting in the
 * mushaf as maghrib comes in on a Ramadan evening, that is precisely the
 * moment the day was supposed to turn. Publishing a maghrib that is
 * still ahead therefore schedules one wake for the instant it passes.
 *
 * One timer, replaced on every publish and dropped once it has fired.
 * The boundary is a single instant, so there is nothing to keep ticking
 * for; and a wake missed while the app was in the background costs
 * nothing, because coming back to the foreground republishes.
 */
function scheduleWake(): void {
  if (wake !== null) {
    clearTimeout(wake);
    wake = null;
  }
  if (published === null) return;
  const delay = published.getTime() - Date.now();
  // Already past: the key has moved and this publish carried the news.
  // Absurdly far ahead: a clock not worth trusting, and a delay over the
  // 32-bit limit makes setTimeout fire at once, which would be worse.
  if (delay <= 0 || delay > DAY_MS) return;
  wake = setTimeout(() => {
    wake = null;
    bump();
  }, delay);
}

/** The day may have changed: count it, and tell whoever is listening. */
function bump(): void {
  version += 1;
  for (const l of [...listeners]) l();
}

export function setTodaysMaghrib(at: Date | null): void {
  // An unusable date is no date. `NaN === NaN` is false, so an Invalid
  // Date would also fail the equality check below and wake every listener
  // on each publish — and it would be stored as a boundary that can never
  // match a day, which is the right answer arrived at the wrong way.
  if (at !== null && Number.isNaN(at.getTime())) at = null;
  const same =
    (published === null && at === null) ||
    (published !== null && at !== null && published.getTime() === at.getTime());
  if (same) return;
  published = at ? new Date(at) : null;
  scheduleWake();
  bump();
}

/**
 * A number that changes whenever the day might have — on a new maghrib,
 * and when one passes. Screens subscribe and read it so the boundary
 * reaches the glass; everything else keeps calling `islamicDayKey`.
 */
export function islamicDayVersion(): number {
  return version;
}

export function subscribeIslamicDay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What has been published, or null. */
export function todaysMaghrib(): Date | null {
  return published;
}

/** The Islamic day key for an instant, against what has been published. */
export function islamicDayKey(at: Date = new Date()): string {
  return islamicDayKeyAt(at, published);
}

/** The civil date to convert for a Hijri label meant as "now". */
export function islamicCivilDate(at: Date = new Date()): Date {
  return islamicCivilDateAt(at, published);
}

/** For tests. */
export function _resetIslamicDay(): void {
  if (wake !== null) {
    clearTimeout(wake);
    wake = null;
  }
  published = null;
  version = 0;
  listeners.clear();
}
