/**
 * WHEN THE CLOCKS CHANGE UNDER THE APP — issue #56.
 *
 * Reported by Yushi on the day Morocco went back to GMT: Fajr was still
 * being shown at 05:49 when the country had moved to 04:49, and it stayed
 * that way for hours.
 *
 * ── WHY NOTHING CAUGHT IT ─────────────────────────────────────────────
 *
 * Every prayer time this app stores is a wall-clock string. "05:49" is not
 * a moment; it is a moment under a rule, and on 2026-09-20 Morocco changed
 * the rule. Nothing in the stored data changed, nothing expired, and
 * nothing was old — the rows were fetched yesterday and cover tomorrow.
 * The country moved and the table did not.
 *
 * The app found out the way it finds out about everything else on those
 * datasets: the ministry's builder republished, and the device's six-hourly
 * `index.json` poll eventually noticed a new `builtAt`. Six hours, ±25%,
 * and only while something asks for a time. That is the three hours in the
 * report, and it is the whole of the fault: the offset change was knowable
 * on the device, in the first millisecond, from the device's own clock.
 *
 * ── SO THE OFFSET IS THE SIGNAL ───────────────────────────────────────
 *
 * The device knows its UTC offset and it knows what that offset was the
 * last time it stored any prayer times. When those disagree, every
 * wall-clock string held for where the reader IS was written under a rule
 * that no longer applies, and no amount of freshness makes it right. That
 * is not a reason to re-poll on the usual schedule; it is a reason to throw
 * the answer away and ask again now.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────
 *
 * It does not touch the OTHER places a traveller has stored. A cache slot
 * is keyed by coordinates and holds times in the local clock of those
 * coordinates: flying Stockholm → Casablanca changes this device's offset
 * and changes nothing whatsoever about Stockholm's table. Only the location
 * being loaded is invalidated, which is the one the reader is standing in
 * and the one the shift is about.
 *
 * It also cannot help a phone whose own timezone database is out of date.
 * If the device still thinks Casablanca is GMT+1, the device's clock is
 * wrong and every app on it is wrong together; there is nothing here to
 * detect and nothing to fix.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PrayerDataProviderId } from '../settings/types';
import { deviceUtcOffsetMinutes } from '../utils/utcOffset';
import { dropStoredMonths } from './prayerStorage';
import { refetchHabousDatasetNow } from '../providers/habousDataset';
import { refetchIslamiskaForbundetDatasetNow } from '../providers/islamiskaForbundetDataset';

export { deviceUtcOffsetMinutes };

const KEY = 'mihrab.prayer.utcOffset.v1';

/**
 * The offset this process has already settled, so the check costs one
 * AsyncStorage read per launch rather than one per load. `null` means "not
 * read yet"; `undefined` inside the stored shape means a device that has
 * never stored prayer times, which is not a shift.
 */
let known: number | null = null;
let reading: Promise<number | null> | null = null;

async function lastKnownOffset(): Promise<number | null> {
  if (known !== null) return known;
  if (!reading) {
    reading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw == null) return null;
        const value = Number(JSON.parse(raw)?.minutes);
        return Number.isFinite(value) ? value : null;
      } catch {
        return null;
      } finally {
        reading = null;
      }
    })();
  }
  const value = await reading;
  if (value !== null) known = value;
  return value;
}

async function remember(minutes: number): Promise<void> {
  known = minutes;
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ minutes, at: new Date().toISOString() }),
    );
  } catch {
    // Then it is re-detected next launch, which costs one extra refresh
    // and is the safe direction to fail in.
  }
}

export type TimezoneShift = {
  /** Minutes east of UTC the stored data was written under. */
  from: number;
  /** Minutes east of UTC now. */
  to: number;
  /** When it was noticed — what the notice on the Today card is dated by. */
  at: number;
};

/** The shift this launch noticed, until something clears it. */
let pending: TimezoneShift | null = null;

/**
 * Has the device's offset moved since prayer times were last stored?
 *
 * Records the new offset as it answers, so the shift is reported exactly
 * once however many loads follow. A device that has never stored an offset
 * — a first launch, or an upgrade from a build without this — records the
 * current one and reports nothing: there is no stale data to distrust,
 * only an unknown past.
 */
export async function noticeTimezoneShift(
  now: Date = new Date(),
): Promise<TimezoneShift | null> {
  const to = deviceUtcOffsetMinutes(now);
  const from = await lastKnownOffset();
  if (from === null) {
    await remember(to);
    return null;
  }
  if (from === to) return null;
  await remember(to);
  const shift: TimezoneShift = { from, to, at: now.getTime() };
  pending = shift;
  return shift;
}

/**
 * The shift the reader has not been told about yet, if any.
 *
 * Held in memory on purpose: it explains a refresh that has just happened
 * in front of them. A shift the app noticed a week ago is not news, and a
 * notice that survived a restart would be a message about nothing.
 */
export function pendingTimezoneShift(): TimezoneShift | null {
  return pending;
}

export function clearTimezoneShiftNotice(): void {
  pending = null;
}

/** For tests, and for a store reset. */
export function _resetTimezoneShiftForTests(): void {
  known = null;
  reading = null;
  pending = null;
}

/**
 * ── WHAT A SHIFT THROWS AWAY ──────────────────────────────────────────
 *
 * Two stores hold wall-clock times for where the reader is, and both were
 * written under the old rule:
 *
 *   • the monthly cache for THIS location (`dropStoredMonths`), which is
 *     refilled by the load that follows; and
 *   • the dataset's cached city file, which is the one that mattered in
 *     the report — for Morocco the dataset is consulted BEFORE the cache,
 *     so an untouched city file means the fresh cache is never even read.
 *
 * The dataset download is awaited, the cache drop is awaited, and both
 * happen before the load that will read them. Neither can fail the load:
 * a device that is offline when the clocks change keeps nothing wrong on
 * purpose — the stored rows go, and the computed chain answers from the
 * device's own clock, which is by definition running under the new rule.
 */
export async function applyTimezoneShift(params: {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  calculationMethod: number | 'auto';
  school: number;
}): Promise<void> {
  await Promise.allSettled([
    dropStoredMonths(params),
    refetchDatasetFor(params),
  ]);
}

/**
 * Re-download the published table this provider reads from, now.
 *
 * Exported because the same need arrives two ways: the app noticing a
 * shift, and a reader pressing "Refresh stored data" because their times
 * are wrong. Both want the file itself replaced rather than the polite
 * six-hourly poll consulted, and both are the same call. A provider with
 * no dataset behind it (AlAdhan, or the computed chain) has nothing to
 * re-download and this does nothing.
 */
export async function refetchDatasetFor(params: {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
}): Promise<void> {
  if (params.provider === 'habous') {
    await refetchHabousDatasetNow(params.latitude, params.longitude);
    return;
  }
  if (params.provider === 'islamiska_forbundet') {
    await refetchIslamiskaForbundetDatasetNow(params.latitude, params.longitude);
  }
}

/**
 * The whole check, for a caller that is about to load prayer times.
 *
 * Cheap and idempotent: after the first call in a process it is a number
 * comparison. Put in front of the load rather than beside it, because the
 * ordering is the fix — a load that starts before the invalidation reads
 * exactly the stale rows this exists to throw away.
 */
export async function settleTimezoneShift(params: {
  provider: PrayerDataProviderId;
  latitude: number;
  longitude: number;
  calculationMethod: number | 'auto';
  school: number;
}): Promise<TimezoneShift | null> {
  const shift = await noticeTimezoneShift();
  if (!shift) return null;
  await applyTimezoneShift(params);
  return shift;
}
