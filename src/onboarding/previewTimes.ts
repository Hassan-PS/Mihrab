/**
 * The times first launch shows the user while they are still deciding.
 *
 * ── WHY THIS IS NOT `usePrayerDay` ────────────────────────────────────
 *
 * Three screens of the remake show a time as the CONSEQUENCE of a choice
 * the user is making right now: ʿaṣr moving as they pick a school, the
 * day's five times appearing the moment a city lands, Islamic midnight
 * next to the switch that turns it on.
 *
 * `usePrayerDay` cannot answer those. It re-resolves on location change,
 * not on `school` — the school is deliberately absent from its effect's
 * dependency list, because changing it must not re-hit the network — so
 * a madhab screen driven by it would show the same ʿaṣr under all four
 * schools until something else caused a refetch. And its answer arrives
 * asynchronously, which is wrong for a value that has to move under the
 * user's finger.
 *
 * So these are computed on device, synchronously, from the same
 * parameters the app's own offline provider uses.
 *
 * ── WHAT THAT COSTS, STATED PLAINLY ───────────────────────────────────
 *
 * When the user's data provider is a published table (Islamiska
 * Förbundet, Habous) rather than calculation, a preview here can differ
 * from the Home screen by a minute or two. That is acceptable for what
 * these screens are doing and it is worth being precise about why: the
 * madhab screen is a COMPARISON, both sides of which come from this same
 * calculator, so the difference between them — three quarters of an hour,
 * often more — is exact even when each absolute value is a minute off.
 * Nobody is being asked to act on the minute; they are being shown that
 * the choice moves their afternoon.
 *
 * Everything here is pure and synchronous, and none of it writes.
 */
import { computeLocalAdhanTimes } from '../providers/localAdhan';
import { asrSchoolFor, type Madhab } from '../prayer/madhab';
import { clockNightTimes } from '../utils/nightTimes';
import type { TimingsMap } from '../types/prayer';

export type PreviewCoords = { latitude: number; longitude: number };

export type PreviewSettings = {
  locationMode: string;
  manualLatitude: number;
  manualLongitude: number;
  lastFetchedLatitude?: number;
  lastFetchedLongitude?: number;
  calculationMethod: number | 'auto';
};

/**
 * Where the user is, as far as the settings blob knows, or `null`.
 *
 * NEVER `(0, 0)`. That pair is the app's "no location yet" sentinel — it
 * is in the Gulf of Guinea, it computes perfectly valid nonsense, and
 * treating it as a place is how a screen ends up confidently showing a
 * stranger somebody else's afternoon. A preview with no coordinates
 * renders a dash; it does not guess.
 */
export function previewCoords(s: PreviewSettings): PreviewCoords | null {
  const [lat, lng] =
    s.locationMode === 'automatic'
      ? [s.lastFetchedLatitude, s.lastFetchedLongitude]
      : [s.manualLatitude, s.manualLongitude];
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0)
  ) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

/** Today's prayer times under a given school, computed on device. */
export function previewDay(
  coords: PreviewCoords,
  opts: { date?: Date; calculationMethod: number | 'auto'; school: number },
): TimingsMap {
  return computeLocalAdhanTimes({
    latitude: coords.latitude,
    longitude: coords.longitude,
    date: opts.date ?? new Date(),
    calculationMethod: opts.calculationMethod,
    school: opts.school,
  }).timings;
}

/**
 * ʿAṣr under each school, for the screen that asks which one the user
 * follows.
 *
 * Returned as a map rather than one value on purpose: the screen shows
 * the old time moving to the new one, so it needs both ends of the change
 * and it needs them without recomputing between renders.
 */
export function previewAsrByMadhab(
  coords: PreviewCoords,
  opts: { date?: Date; calculationMethod: number | 'auto' },
): Record<Madhab, string> {
  const date = opts.date ?? new Date();
  const bySchool = new Map<number, string>();
  const asrFor = (school: number) => {
    const cached = bySchool.get(school);
    if (cached) return cached;
    const value = previewDay(coords, {
      date,
      calculationMethod: opts.calculationMethod,
      school,
    }).Asr;
    bySchool.set(school, value);
    return value;
  };
  // Two calculations, four answers: only the Ḥanafī shadow differs, which
  // is the whole of what `asrSchoolFor` encodes.
  return {
    hanafi: asrFor(asrSchoolFor('hanafi')),
    maliki: asrFor(asrSchoolFor('maliki')),
    shafii: asrFor(asrSchoolFor('shafii')),
    hanbali: asrFor(asrSchoolFor('hanbali')),
  };
}

/**
 * Islamic midnight and the start of the last third, for the shelf.
 *
 * The night that ends this morning: yesterday evening's Maghrib to
 * today's Fajr, which is the same basis `injectNightTimes` uses for the
 * day card. Computing yesterday rather than reusing today's Maghrib as a
 * proxy costs one more call and is exact, and this row is a label the
 * user is deciding against.
 */
export function previewNightMarks(
  coords: PreviewCoords,
  opts: { date?: Date; calculationMethod: number | 'auto'; school: number },
): { Midnight: string; Lastthird: string } {
  const date = opts.date ?? new Date();
  const yesterday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - 1,
  );
  const today = previewDay(coords, { ...opts, date });
  const prev = previewDay(coords, { ...opts, date: yesterday });
  const { Midnight, Lastthird } = clockNightTimes(prev.Maghrib, today.Fajr);
  return { Midnight, Lastthird };
}

/** The five farḍ, in order, for the pause after a city lands. */
export const PREVIEW_ROWS = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;
