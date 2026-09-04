/**
 * The Mālikī second times — issue #19.
 *
 * ── WHAT THIS IS ──────────────────────────────────────────────────────
 *
 * In the Mālikī reckoning each of the five prayers has two windows. The
 * first, *ikhtiyārī*, is the one it should be prayed in. The second,
 * *ḍarūrī*, is still valid but is entered without excuse only at a cost:
 * *"Each one has two times. So, pray it in the first one."*
 * (*Al-Murshid al-Muʿīn*, Ibn ʿĀshir; rendered in *The Guiding Helper*,
 * Abu Qanit al-Sharif al-Hasani, Song 11 lines 388–401 and footnotes
 * 645–665, cited in issue #19.)
 *
 * So what a person actually wants to know is ONE instant per prayer:
 * when the preferred window closes. That is what this module produces.
 * Each window's END is a time the card already shows — Fajr's second
 * time ends at Sunrise, Ẓuhr's and ʿAṣr's at Maghrib, Maghrib's and
 * Ishāʾ's at the next Fajr — so there is nothing to compute there.
 *
 * ── TWO OF THE FIVE ARE ROWS THE CARD ALREADY HAS ─────────────────────
 *
 * The book defines two boundaries as other prayers' beginnings. "The
 * first time of Ẓuhr lasts ... up until the beginning of ʿAṣr's first
 * time" (fn. 656); "Maghrib's first time lasts until the beginning of
 * ʿIshāʾ's first time" (fn. 659), which is where the red twilight goes
 * (fn. 652, 660). The card already carries an ʿAṣr and an Ishāʾ from
 * the user's own chosen authority. Recomputing those two from angles
 * here would put a second ʿAṣr and a second Ishāʾ on the card, a minute
 * or five from the first, and the disagreement would read as a bug
 * rather than as two ways of naming the same instant. So they are the
 * rows. The one exception is Ẓuhr on a Ḥanafī ʿAṣr — see below.
 *
 * ── WHY IT IS COMPUTED HERE AND NOT FETCHED ───────────────────────────
 *
 * No provider publishes these. Not AlAdhan, not PrayTimes.dev, not the
 * Habous table the issue is written from. They are derived from solar
 * geometry at the user's own coordinates, which is the one thing the app
 * can always do for itself, and they are shown beside whichever source
 * supplied the day.
 *
 * ── TWO OF THE FIVE ARE GEOMETRY; TWO ARE A MODEL OF A COLOUR ─────────
 *
 * `confidence` carries that difference, and callers are expected to draw
 * it. Ẓuhr's boundary is the ʿAṣr row, Maghrib's is the Ishāʾ row,
 * Ishāʾ's is a third of the night — all three are exact, on the card's
 * own terms. Fajr's *isfār* ("the stars are no longer seen") and ʿAṣr's
 * *iṣfirār* ("the sun has a deep yellow view") are judgements the eye
 * makes, and an angle is a model of them, close but never exact. A
 * reader deserves to know which of the two they are looking at rather
 * than seeing all five printed in the same confident type.
 *
 * Where a modelled angle has a stated range, the app takes the end that
 * closes the preferred window EARLIER — see `ISFAR_ALTITUDE_DEGREES`.
 * These are the ends of the windows a person should be praying in, and
 * the ordinary precaution for an end is to be early.
 *
 * ── THE SHADOW IS ALWAYS 1:1 ──────────────────────────────────────────
 *
 * Ẓuhr's first time ends where ʿAṣr's begins, at shadow = height + the
 * noon shadow. That is the Mālikī (and Shāfiʿī) ʿAṣr. When the app's
 * asr setting is 1:1 the ʿAṣr row IS that instant and is reused as is.
 * On Ḥanafī ʿAṣr (2:1) the row is half an hour too late to be a Mālikī
 * boundary, so this module computes the 1:1 shadow itself instead — and
 * the card then carries a Ẓuhr boundary well before its own ʿAṣr, which
 * the setting screen warns about in red where the toggle is.
 *
 * ── REFRACTION ────────────────────────────────────────────────────────
 *
 * Sunrise and sunset here are adhan.js's, taken at −0.833° — the standard
 * allowance for atmospheric refraction plus the sun's own radius, so the
 * moment the disc's upper limb touches the horizon rather than the moment
 * its centre crosses a geometric line. That is what "the appearance of
 * the top of the sun" (fn. 661) asks for, and it is what every published
 * table means by the word.
 *
 * The twilight angles are geometric, which is the convention everywhere:
 * −6° for *isfār* is a position of the sun's centre, not a refracted
 * altitude, and the constants in every madhhab's tables are quoted on
 * that basis. Only *iṣfirār* at +5° sits low enough for refraction to be worth a
 * number — about 9 arcminutes there, which is under a minute of clock
 * time at mid-latitudes and more at high ones. That is well inside the
 * uncertainty of "the sun has a deep yellow view" in the first place,
 * which is why that boundary is `modelled` rather than `computed` and why
 * the row says approx. Correcting it would make the arithmetic tidier
 * without making the answer truer.
 *
 * ── AND SOMETIMES THERE IS NO ANSWER ──────────────────────────────────
 *
 * At 33°N every one of these instants happens every day. Further north
 * they do not, and there are three separate ways for that to be true.
 *
 * The angle is never reached. The angle IS reached but the event that
 * would CLOSE the window is not — the case inside
 * `solarDaruriBoundaries`, which is where it is explained, because it is
 * the one that looks like a working answer. And the angle is reached,
 * the window closes, but the boundary lands OUTSIDE the window the
 * card's own rows describe — the case inside `daruriTimesForDay`, and
 * the one that bit: at high latitude Fajr comes from a night-fraction
 * rule or a fixed table rather than from an angle, and Stockholm's
 * dataset gives 02:11 on midsummer's day while *isfār* at −6° is 01:59.
 * "Fajr's first time until 01:59" under a Fajr of 02:11 is a boundary
 * on the wrong side of the prayer it bounds, which is worse than none.
 *
 * All three come out the same way: the key is absent and callers show
 * nothing. A Mālikī in Malmö is better served by a blank he can ask his
 * imam about than by a number the sky does not support.
 */
import { clockNightTimes } from '../utils/nightTimes';
import {
  addDays,
  combineLocalDateAndTime,
  startOfLocalDay,
} from '../utils/prayerTimes';
import type { TimingsMap } from '../types/prayer';

/**
 * adhan.js does not re-export `SolarTime` from its entry point, so this
 * is a deep import into the package it already ships. It is here, in one
 * place, on purpose: the same engine that computes the app's offline
 * times computes these boundaries, so the two can never drift apart on
 * geometry, and a version bump has exactly one file to fix.
 */
const SolarTimeModule = require('adhan/lib/cjs/SolarTime');

/**
 * What `SolarTime` actually reads off its second argument.
 *
 * A plain object rather than adhan's own `Coordinates`, and deliberately:
 * the class from the package's ESM entry does not survive being handed to
 * the CJS `SolarTime` — every result comes back NaN — and two build
 * outputs of one library disagreeing about a class is not a thing to
 * debug at every call site. Two numbers are two numbers.
 */
type Observer = { latitude: number; longitude: number };

type SolarTimeLike = {
  /** Decimal UTC hours of local solar transit. */
  transit: number;
  sunrise: number;
  sunset: number;
  /** Decimal UTC hours at a solar altitude, or NaN if never reached. */
  hourAngle(angle: number, afterTransit: boolean): number;
  /** Decimal UTC hours when the shadow reaches `n` × height + noon shadow. */
  afternoon(shadowLength: number): number;
};

const SolarTime: (new (date: Date, observer: Observer) => SolarTimeLike) | null =
  typeof (SolarTimeModule?.default ?? SolarTimeModule) === 'function'
    ? (SolarTimeModule.default ?? SolarTimeModule)
    : null;

/**
 * Did the deep import come back as something we can construct?
 *
 * A missing path would fail at bundle time and CI would catch it. The
 * case worth guarding is quieter: adhan.js reorganising so the path still
 * resolves but the export is no longer the class — then every `new
 * SolarTime(...)` throws, or worse returns an object whose fields are all
 * NaN, and the feature stops working with nothing in the log to say why.
 * `daruriImportOk()` is what the test asserts, so a version bump that
 * breaks the shape fails the suite instead of the app.
 */
export function daruriImportOk(): boolean {
  return SolarTime !== null;
}

/**
 * *Isfār* — "the stars are no longer seen because of the approach of
 * daylight" (fn. 655). Issue #19 gives a range, −6° to −4°, and this
 * takes the EARLY end.
 *
 * The first cut took the late end, on the reasoning that leaving the
 * preferred window longer was the error that cost nothing. That had the
 * risk backwards, and review caught it. Morning twilight brightens from
 * −18° toward sunrise, so −4° is LATER on the clock than −6°. Put the
 * boundary late and the app tells someone at −5° that they are still in
 * the preferred window when they may already be in the ḍarūrī one —
 * which is the window a person enters without excuse only at a cost.
 * Put it early and the app closes the window before it had to; they
 * hurry, and nothing is incurred.
 *
 * So the precaution runs the other way from where I first put it, and it
 * is the ordinary one for time boundaries: begin late, end early. The
 * end of an ikhtiyārī window is an end.
 */
export const ISFAR_ALTITUDE_DEGREES = -6;

/**
 * *Iṣfirār* — the sun "has a deep yellow view and is about to turn
 * orange" (fn. 657). +5° above the horizon, as issue #19 gives it.
 *
 * The same precaution as *isfār* would argue for a slightly HIGHER angle
 * here, since the sun descends toward sunset and a higher one is
 * earlier. It is not applied, because the source gives one number rather
 * than a range: shifting it would be inventing a boundary rather than
 * choosing conservatively within a stated one. If a corroborating source
 * ever gives a range, the early end of it belongs here for the reason
 * above.
 */
export const ISFIRAR_ALTITUDE_DEGREES = 5;

/** The Mālikī / Shāfiʿī shadow, used here regardless of the asr setting. */
export const MALIKI_SHADOW_LENGTH = 1;

/**
 * How much the app is claiming.
 *
 * `computed` — a solar position or a division of the night. Exact to the
 * limits of the ephemeris.
 * `modelled` — an angle standing in for something the eye judges. Close,
 * and never exact anywhere.
 */
export type DaruriConfidence = 'computed' | 'modelled';

export const DARURI_KEYS = [
  'FajrDaruri',
  'DhuhrDaruri',
  'AsrDaruri',
  'MaghribDaruri',
  'IshaDaruri',
] as const;

export type DaruriKey = (typeof DARURI_KEYS)[number];

/** Which prayer each boundary belongs to. */
export const DARURI_OF: Record<DaruriKey, string> = {
  FajrDaruri: 'Fajr',
  DhuhrDaruri: 'Dhuhr',
  AsrDaruri: 'Asr',
  MaghribDaruri: 'Maghrib',
  IshaDaruri: 'Isha',
};

export const DARURI_CONFIDENCE: Record<DaruriKey, DaruriConfidence> = {
  // "The stars have gone" — an angle standing in for an appearance.
  FajrDaruri: 'modelled',
  // The ʿAṣr row (or, on Ḥanafī ʿAṣr, the 1:1 shadow). Exact.
  DhuhrDaruri: 'computed',
  // "The sun has yellowed" — the other appearance.
  AsrDaruri: 'modelled',
  // The Ishāʾ row. Exact, on the card's own terms.
  MaghribDaruri: 'computed',
  // A third of the way from sunset to dawn. Arithmetic on two times the
  // card already carries.
  IshaDaruri: 'computed',
};

/** Clock times, one per boundary; a key is absent when the sky has no answer. */
export type DaruriTimes = Partial<Record<DaruriKey, string>>;

/** `Date.UTC` from adhan's decimal-hours convention — see `TimeComponents`. */
function utcDateFromHours(
  year: number,
  month: number,
  day: number,
  hours: number,
): Date | null {
  if (!Number.isFinite(hours)) return null;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor((hours - (h + m / 60)) * 3600);
  const at = new Date(Date.UTC(year, month, day, h, m, s));
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Local `HH:mm`, rounded to the nearest minute.
 *
 * Rounded rather than truncated because that is what adhan does for every
 * other time in the app (`Rounding.nearest`), and a boundary that read a
 * minute earlier than the ʿAṣr on the row above it would look like a bug.
 */
function localClock(at: Date | null): string | undefined {
  if (!at) return undefined;
  const rounded = new Date(Math.round(at.getTime() / 60000) * 60000);
  const h = String(rounded.getHours()).padStart(2, '0');
  const m = String(rounded.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * The solar boundaries for one local calendar day at one place: the
 * three that are positions of the sun. *Isfār*, the 1:1 shadow, and
 * *iṣfirār*.
 *
 * Maghrib's and Ishāʾ's are not here. One is the Ishāʾ row and the
 * other is a third of the way from this day's Maghrib to the NEXT day's
 * Fajr — facts about rows of the card rather than about the sun's
 * position today. `daruriTimesForDay` supplies both, and decides
 * whether Ẓuhr's comes from here or from the ʿAṣr row.
 */
export function solarDaruriBoundaries(
  date: Date,
  latitude: number,
  longitude: number,
): DaruriTimes {
  // No engine, no boundaries — the same answer this module gives for
  // every other question it cannot honestly answer. The card simply
  // shows the prayer times it always did.
  if (!SolarTime) return {};
  const solar = new SolarTime(date, { latitude, longitude });
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  const at = (hours: number) => localClock(utcDateFromHours(y, mo, d, hours));

  // ── A WINDOW NEEDS BOTH ENDS ────────────────────────────────────────
  //
  // Every one of these boundaries OPENS a window that some other event
  // CLOSES: Fajr's ḍarūrī runs to sunrise, Ẓuhr's and ʿAṣr's to sunset.
  // An angle can be reached on a day when the closing event never
  // happens, and then the boundary is a number with nothing on the other
  // side of it.
  //
  // Tromsø at midsummer is the case that makes it concrete. The sun does
  // not set, but it still descends through +5°, so `hourAngle` answers
  // 21:00 — and the app would have printed "ʿAṣr's first time until
  // 21:00" for a window ending at a sunset that never comes. The 1:1
  // shadow is reached there too, and would have closed Ẓuhr the same way.
  // In the polar night the mirror happens: no sunrise, but *isfār*
  // still resolves.
  //
  // So a day without a sunrise has no Fajr boundary and a day without a
  // sunset has no afternoon one, whatever the angles say.
  // This is the fallback for the polar regions, and it is deliberately
  // the same answer as everywhere else the sky runs out: nothing.
  const risesToday = Number.isFinite(solar.sunrise);
  const setsToday = Number.isFinite(solar.sunset);

  const out: DaruriTimes = {};
  // Before transit: the morning twilight brightening toward sunrise —
  // which has to be a sunrise there is.
  const isfar = risesToday
    ? at(solar.hourAngle(ISFAR_ALTITUDE_DEGREES, false))
    : undefined;
  if (isfar) out.FajrDaruri = isfar;
  // After transit: the shadow reaching height + noon shadow. Closes at
  // sunset, like ʿAṣr's below.
  const asr = setsToday ? at(solar.afternoon(MALIKI_SHADOW_LENGTH)) : undefined;
  if (asr) out.DhuhrDaruri = asr;
  // After transit: the sun still up, five degrees above the horizon.
  const isfirar = setsToday
    ? at(solar.hourAngle(ISFIRAR_ALTITUDE_DEGREES, true))
    : undefined;
  if (isfirar) out.AsrDaruri = isfirar;
  return out;
}

/**
 * Minutes since local midnight, or null for anything that is not a
 * clock. Provider rows have been through `validateTimings`, but the
 * boundaries are built from them and a provider that slipped once
 * should cost one boundary, not the card.
 */
function minutesOf(clock: string | undefined): number | null {
  if (!clock) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Is `boundary` strictly inside (`from`, `to`)?
 *
 * Measured from `from` and wrapping at midnight, so a night window that
 * runs from 21:10 to 05:31 contains 23:05 and 00:23 alike. Strict at
 * both ends on purpose: a boundary that coincides with the prayer it is
 * supposed to come after says the preferred window has zero length,
 * which is not a thing the card should claim.
 */
function inside(
  boundary: string | undefined,
  from: string | undefined,
  to: string | undefined,
): boolean {
  const b = minutesOf(boundary);
  const f = minutesOf(from);
  const t = minutesOf(to);
  if (b === null || f === null || t === null) return false;
  const span = (t - f + 1440) % 1440;
  const at = (b - f + 1440) % 1440;
  return at > 0 && at < span;
}

/**
 * Every Mālikī second-time boundary for one day of a card.
 *
 * `asrShadow` is the app's own ʿAṣr setting — 1 for the Mālikī/Shāfiʿī
 * shadow, 2 for Ḥanafī. At 1 the ʿAṣr row is Ẓuhr's boundary and is
 * reused as is; at 2 the row is the wrong madhhab's ʿAṣr and the 1:1
 * shadow is computed instead.
 *
 * `tomorrowFajr` is the dawn that closes tonight. On the last day of a
 * window there is none, and today's own Fajr stands in — the same
 * sub-minute proxy `injectNightTimes` makes for the `Firstthird` row it
 * shares an instant with. See the note at the evening boundaries below.
 *
 * ── EVERY BOUNDARY IS CHECKED AGAINST THE CARD'S OWN ROWS ─────────────
 *
 * A boundary is only shown if it lies strictly inside the window the
 * card's rows describe for it: after the prayer it belongs to, before
 * the event that closes the second time. The solar gate in
 * `solarDaruriBoundaries` cannot do this on its own, because the rows do
 * not always come from angles: at high latitude a provider's Fajr is a
 * night-fraction rule or a printed table, and Stockholm's own dataset
 * puts midsummer Fajr at 02:11 while *isfār* at −6° is 01:59. A card
 * saying "Fajr's first time until 01:59" under a Fajr of 02:11 is a
 * boundary on the wrong side of the prayer it bounds — the one thing
 * the test file calls worse than no boundary at all. The same check
 * also drops a boundary that is hours off because the device's time
 * zone is not the location's (a manual location on another continent),
 * where a number would be wrong rather than merely blank.
 *
 * ── ISHĀʾ IS NOT GATED ON THE SUN, AND THAT IS NOT CONVENIENCE ────────
 *
 * The solar boundaries are positions of the sun, and under the midnight
 * sun there is no answer to make. Ishāʾ's is a different KIND of thing:
 * the fiqh defines it as a FRACTION OF THE NIGHT — "one third of the
 * way between sunset and dawn" (fn. 660) — and a fraction is well
 * defined for any interval its two ends are given for. Whatever rule a
 * provider used to produce a Maghrib and a Fajr where the sun does not
 * set, a third of the way between them is a real division of the night
 * that user has been handed. Gating it on sunrise would not be stricter;
 * it would withhold the one boundary of the five that still means
 * something at that latitude. It IS gated on the rows, like the rest:
 * an offline Malmö midsummer where Ishāʾ itself is pushed to 01:10 by a
 * high-latitude rule puts the first third at 23:00, two hours before
 * Ishāʾ begins, and that one is dropped.
 *
 * The same instant as the `Firstthird` row, which has shipped on exactly
 * this basis since issue #14. See `injectDaruriTimes` for why that row
 * stays rather than being replaced by this one.
 */
export function daruriTimesForDay(
  date: Date,
  latitude: number,
  longitude: number,
  timings: TimingsMap,
  tomorrowFajr: string | undefined,
  asrShadow: 1 | 2 = 1,
): DaruriTimes {
  const solar = solarDaruriBoundaries(date, latitude, longitude);
  const out: DaruriTimes = {};

  // Fajr: *isfār*, inside (Fajr, Sunrise).
  if (inside(solar.FajrDaruri, timings.Fajr, timings.Sunrise)) {
    out.FajrDaruri = solar.FajrDaruri;
  }

  // Ẓuhr: the ʿAṣr row on a 1:1 setting; the 1:1 shadow otherwise.
  // Inside (Dhuhr, Maghrib) either way.
  const dhuhrBoundary = asrShadow === 1 ? timings.Asr : solar.DhuhrDaruri;
  if (inside(dhuhrBoundary, timings.Dhuhr, timings.Maghrib)) {
    out.DhuhrDaruri = dhuhrBoundary;
  }

  // ʿAṣr: *iṣfirār*, inside (Asr, Maghrib).
  if (inside(solar.AsrDaruri, timings.Asr, timings.Maghrib)) {
    out.AsrDaruri = solar.AsrDaruri;
  }

  // ── THE END OF THE NIGHT, AND THE ONE DAY THAT HAS NO TOMORROW ──────
  //
  // Both of the evening boundaries are measured against the dawn that
  // closes tonight, and the last day of any window does not have one:
  // the month table ends on the 31st, the carousel ends on day seven.
  //
  // Today's own Fajr stands in for it there, which is exactly what
  // `injectNightTimes` does for the `Firstthird` row (see its comment on
  // the same trade). Fajr drifts about a minute a day, so a third of the
  // night moves by seconds — it rounds to the same minute.
  //
  // Requiring a real tomorrow instead was a bug with a visible shape.
  // `Firstthird` and `IshaDaruri` are the same instant under two names,
  // and the row kept the proxy while the boundary did not — so the last
  // row of every month printed that one moment twice, once as a time in
  // the first-third column and once as a blank under Ishāʾ.
  const nightEnd = tomorrowFajr ?? timings.Fajr;

  // Maghrib: the Ishāʾ row, by definition (fn. 659). Inside
  // (Maghrib, next Fajr), which wraps.
  if (inside(timings.Isha, timings.Maghrib, nightEnd)) {
    out.MaghribDaruri = timings.Isha;
  }

  // Ishāʾ: the first third of the night, inside (Isha, next Fajr).
  if (timings.Maghrib && nightEnd) {
    try {
      const third = clockNightTimes(timings.Maghrib, nightEnd).Firstthird;
      if (inside(third, timings.Isha, nightEnd)) out.IshaDaruri = third;
    } catch {
      // An unparseable time from a provider — leave Ishāʾ's boundary out
      // rather than putting a wrong one on the card.
    }
  }
  return out;
}

/**
 * Add the boundaries to each day of a consecutive week.
 *
 * These are annotations on the five prayers, not rows of their own, so
 * they ride in the same map under keys nothing else iterates: every
 * consumer walks a fixed list (`DISPLAY_ORDER`, `WIDGET_ROW_KEYS`,
 * `NEXT_SALAH_ORDER`), and a key outside those lists reaches only the
 * surface that asks for it by name.
 *
 * `Firstthird` is deliberately left alone even though `IshaDaruri` is the
 * same instant. It is a row the user turned on for qiyām, and it is
 * already in the month table, the widget and the notification schedule;
 * quietly removing it because a different setting was enabled would be a
 * regression dressed as tidiness.
 *
 * Pure: new array, new day objects, input untouched.
 */
export function injectDaruriTimes(
  week: TimingsMap[],
  startDate: Date,
  latitude: number,
  longitude: number,
  asrShadow: 1 | 2 = 1,
): TimingsMap[] {
  return week.map((day, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    date.setHours(12, 0, 0, 0);
    const times = daruriTimesForDay(
      date,
      latitude,
      longitude,
      day,
      i < week.length - 1 ? week[i + 1].Fajr : undefined,
      asrShadow,
    );
    return { ...day, ...times };
  });
}

/**
 * Is `key` one of the five? Storage hands us whatever was on disk.
 */
export function isDaruriKey(key: unknown): key is DaruriKey {
  return (
    typeof key === 'string' && (DARURI_KEYS as readonly string[]).includes(key)
  );
}

/**
 * The alert list, from a stored blob. Order follows `DARURI_KEYS` rather
 * than the file's, so two blobs holding the same set compare equal and a
 * settings write does not look like a change when it is not.
 */
export function coerceDaruriAlerts(value: unknown): DaruriKey[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set(value.filter(isDaruriKey));
  return DARURI_KEYS.filter(k => chosen.has(k));
}

/**
 * The alerts to schedule for the Mālikī second times — issue #19.
 *
 * ── WHY THIS IS OPT-IN, ONE PRAYER AT A TIME ──────────────────────────
 *
 * Five boundaries is five more notifications a day on top of the five
 * prayers, the pre-prayer reminders and whichever of Sunrise and the
 * night marks the reader has turned on. An app that started firing all
 * of them because one switch was flipped would be teaching people to
 * swipe its notifications away, which costs more than the alerts are
 * worth — including for the prayer alerts that were already working.
 * So the list starts empty and each boundary is chosen by itself.
 *
 * ── AND WHY IT FIRES BEFORE, NOT AT ───────────────────────────────────
 *
 * The row on the card is the reference; the alert is the thing a person
 * acts on, and by the moment a window closes there is nothing left to
 * act on. `leadMinutes` is how much warning the reader asked for. Zero
 * is allowed and means the boundary itself — a statement of fact rather
 * than a prompt, which is what someone tracking their own practice may
 * actually want.
 *
 * Never the adhan. These are not prayer times, and the caller schedules
 * them on the plain notification sound for the same reason Sunrise and
 * the night marks get it (`isNonPrayerEvent`).
 */
export function buildDaruriAlertEvents(
  week: TimingsMap[],
  baseDay: Date,
  enabled: readonly string[],
  leadMinutes: number,
  now: Date,
): { name: DaruriKey; at: Date }[] {
  if (enabled.length === 0 || week.length === 0) return [];
  const chosen = new Set(enabled.filter(isDaruriKey));
  if (chosen.size === 0) return [];

  const dayStart = startOfLocalDay(baseDay);
  const out: { name: DaruriKey; at: Date }[] = [];

  week.forEach((day, offset) => {
    const base = offset === 0 ? dayStart : addDays(dayStart, offset);
    for (const key of DARURI_KEYS) {
      if (!chosen.has(key)) continue;
      const clock = day[key];
      if (!clock) continue;
      let at: Date;
      try {
        at = combineLocalDateAndTime(base, clock);
      } catch {
        continue;
      }
      // Ishāʾ's boundary is a third of the way into the night that BEGINS
      // on this day, so at a long summer latitude it lands after local
      // midnight — 00:23 for a 23:10 Maghrib — and belongs to tomorrow's
      // date, not to this one. Exactly the rule `eventAt` applies to
      // `Firstthird`, which is the same instant under its other name.
      if (key === 'IshaDaruri' && day.Maghrib) {
        try {
          if (at < combineLocalDateAndTime(base, day.Maghrib)) {
            at = addDays(at, 1);
          }
        } catch {
          // Unparseable Maghrib — the boundary stands on its own date.
        }
      }
      out.push({ name: key, at: new Date(at.getTime() - leadMinutes * 60_000) });
    }
  });

  // Only what is still ahead, and only once: a week's worth of days can
  // put the same instant in twice when a boundary sits either side of
  // midnight.
  const seen = new Set<number>();
  return out
    .filter(e => {
      const ms = e.at.getTime();
      if (ms <= now.getTime() || seen.has(ms)) return false;
      seen.add(ms);
      return true;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
