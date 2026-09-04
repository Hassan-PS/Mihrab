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
 * when the preferred window closes. That is what this module computes.
 * Each window's END is a time the card already shows — Fajr's second
 * time ends at Sunrise, Ẓuhr's and ʿAṣr's at Maghrib, Maghrib's and
 * Ishāʾ's at the next Fajr — so there is nothing to compute there.
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
 * it. Ẓuhr's boundary is a shadow length, Maghrib's is the red twilight
 * at a fixed depression, Ishāʾ's is a third of the night — all three are
 * computed. Fajr's *isfār* ("the stars are no longer seen") and ʿAṣr's
 * *iṣfirār* ("the sun has a deep yellow view") are judgements the eye
 * makes, and an angle is a model of them, close but never exact. A
 * reader deserves to know which of the two they are looking at rather
 * than seeing all five printed in the same confident type.
 *
 * ── THE SHADOW IS ALWAYS 1:1 ──────────────────────────────────────────
 *
 * Ẓuhr's first time ends where ʿAṣr's begins, at shadow = height + the
 * noon shadow. That is the Mālikī (and Shāfiʿī) ʿAṣr, and this module
 * uses it whatever the app's asr setting says. A user on Ḥanafī ʿAṣr who
 * turned these on would otherwise get a Mālikī boundary derived from a
 * Ḥanafī shadow — a table contradicting itself. The setting screen says
 * so where the toggle is.
 *
 * ── AND SOMETIMES THERE IS NO ANSWER ──────────────────────────────────
 *
 * At 33°N every one of these angles happens every night. At 55°N some of
 * them do not: for weeks around midsummer the sun never reaches 17° below
 * the horizon, so Maghrib's second time has no beginning. `null` is the
 * honest answer there, and callers show nothing. A Mālikī in Malmö is
 * better served by a blank he can ask his imam about than by a number the
 * sky does not support.
 */
import { clockNightTimes } from '../utils/nightTimes';
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

const SolarTime: new (date: Date, observer: Observer) => SolarTimeLike =
  SolarTimeModule.default ?? SolarTimeModule;

/**
 * *Isfār* — "the stars are no longer seen because of the approach of
 * daylight" (fn. 655). Issue #19 gives −6° to −4°; this takes the later,
 * brighter end deliberately. The boundary being modelled is the one after
 * which the prayer is late, so the error that costs nothing is the one
 * that leaves the preferred window a little longer.
 */
export const ISFAR_ALTITUDE_DEGREES = -4;

/**
 * *Iṣfirār* — the sun "has a deep yellow view and is about to turn
 * orange" (fn. 657). +5° above the horizon, as issue #19 gives it.
 */
export const ISFIRAR_ALTITUDE_DEGREES = 5;

/**
 * *Shafaq al-aḥmar* — the red glow gone from the western horizon
 * (fn. 659). 17° of depression, the classical Mālikī figure.
 */
export const RED_TWILIGHT_DEPRESSION_DEGREES = 17;

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
  // Shadow = height + noon shadow. Geometry.
  DhuhrDaruri: 'computed',
  // "The sun has yellowed" — the other appearance.
  AsrDaruri: 'modelled',
  // The red glow at 17° of depression. Geometry.
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
 * The four solar boundaries for one local calendar day at one place.
 *
 * Ishāʾ's is not here: it is a third of the way from this day's Maghrib
 * to the NEXT day's Fajr, which is a fact about two rows of the card
 * rather than about the sun's position today. `daruriTimesForDay` adds
 * it.
 */
export function solarDaruriBoundaries(
  date: Date,
  latitude: number,
  longitude: number,
): DaruriTimes {
  const solar = new SolarTime(date, { latitude, longitude });
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  const at = (hours: number) => localClock(utcDateFromHours(y, mo, d, hours));

  const out: DaruriTimes = {};
  // Before transit: the morning twilight brightening toward sunrise.
  const isfar = at(solar.hourAngle(ISFAR_ALTITUDE_DEGREES, false));
  if (isfar) out.FajrDaruri = isfar;
  // After transit: the shadow reaching height + noon shadow.
  const asr = at(solar.afternoon(MALIKI_SHADOW_LENGTH));
  if (asr) out.DhuhrDaruri = asr;
  // After transit: the sun still up, five degrees above the horizon.
  const isfirar = at(solar.hourAngle(ISFIRAR_ALTITUDE_DEGREES, true));
  if (isfirar) out.AsrDaruri = isfirar;
  // After transit: the red gone from the western horizon.
  const red = at(solar.hourAngle(-RED_TWILIGHT_DEPRESSION_DEGREES, true));
  if (red) out.MaghribDaruri = red;
  return out;
}

/**
 * Every Mālikī second-time boundary for one day of a card.
 *
 * `tomorrowFajr` is what closes the night; without it Ishāʾ's boundary is
 * omitted rather than guessed. This is the same night the existing
 * "first third" row is computed over — and indeed Ishāʾ's second time
 * BEGINS at the end of the first third, so the two are the same instant
 * under two names. See `injectDaruriTimes` for what the card does about
 * that.
 */
export function daruriTimesForDay(
  date: Date,
  latitude: number,
  longitude: number,
  timings: TimingsMap,
  tomorrowFajr: string | undefined,
): DaruriTimes {
  const out = solarDaruriBoundaries(date, latitude, longitude);
  if (timings.Maghrib && tomorrowFajr) {
    try {
      out.IshaDaruri = clockNightTimes(timings.Maghrib, tomorrowFajr).Firstthird;
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
    );
    return { ...day, ...times };
  });
}
