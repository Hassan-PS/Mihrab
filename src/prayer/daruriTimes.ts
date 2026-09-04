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
 * ── REFRACTION ────────────────────────────────────────────────────────
 *
 * Sunrise and sunset here are adhan.js's, taken at −0.833° — the standard
 * allowance for atmospheric refraction plus the sun's own radius, so the
 * moment the disc's upper limb touches the horizon rather than the moment
 * its centre crosses a geometric line. That is what "the appearance of
 * the top of the sun" (fn. 661) asks for, and it is what every published
 * table means by the word.
 *
 * The other four angles are geometric, which is the convention for
 * twilight everywhere: −17° for the red glow and −4° for *isfār* are
 * defined as positions of the sun's centre, not as refracted altitudes,
 * and the constants in every madhhab's tables are quoted on that basis.
 * Only *iṣfirār* at +5° sits low enough for refraction to be worth a
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
 * they do not, and there are two separate ways for that to be true.
 *
 * The angle is never reached: at 55°N for weeks around midsummer the sun
 * does not get 17° below the horizon, so the red twilight never goes and
 * Maghrib's second time has no beginning.
 *
 * Or the angle IS reached but the event that would CLOSE the window is
 * not — the case inside `solarDaruriBoundaries`, which is where it is
 * explained, because it is the one that looks like a working answer.
 *
 * Both come out the same way: the key is absent and callers show
 * nothing. A Mālikī in Malmö is better served by a blank he can ask his
 * imam about than by a number the sky does not support.
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
  // In the polar night the mirror happens: no sunrise, but *isfār* and
  // the red twilight still resolve.
  //
  // So a day without a sunrise has no Fajr boundary and a day without a
  // sunset has no afternoon or evening one, whatever the angles say.
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
  // After transit: the red gone from the western horizon — which needs
  // the sun to have gone under it first.
  const red = setsToday
    ? at(solar.hourAngle(-RED_TWILIGHT_DEPRESSION_DEGREES, true))
    : undefined;
  if (red) out.MaghribDaruri = red;
  return out;
}

/**
 * Every Mālikī second-time boundary for one day of a card.
 *
 * `tomorrowFajr` is what closes the night; without it Ishāʾ's boundary is
 * omitted rather than guessed.
 *
 * This one is NOT gated on the sun rising and setting the way the four
 * above are, and the difference is the point: those are claims about
 * where the sun is, and under the midnight sun there is no answer to
 * make. This is a third of the way between two times the card is already
 * showing the reader. Whatever rule their provider used to produce a
 * Maghrib and a Fajr in a place where the sun does not set, the third
 * between them is a real division of what they are looking at — and it
 * is the same instant as the `Firstthird` row, which has shipped on that
 * basis since issue #14. See `injectDaruriTimes` for why that row stays
 * rather than being replaced by this one.
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
