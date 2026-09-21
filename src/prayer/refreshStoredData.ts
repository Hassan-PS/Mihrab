/**
 * "REFRESH STORED DATA" — the one action, wherever it is asked for.
 *
 * Three places ask: the month table's own button, a row in Settings →
 * Prayer times, and a pull at the top of the Home page. They are the same
 * request — "the times I have are wrong, go and get them again" — and
 * before this they would have been three slightly different requests, in
 * the way that three copies of anything drift.
 *
 * ── WHAT A REFRESH ACTUALLY HAS TO DO (issue #56) ─────────────────────
 *
 * Not "fill the gaps", which is what the cache fill does and what the
 * month button used to do on its own: every day already stored was
 * skipped, so a table that was WRONG rather than missing came back
 * exactly as wrong. Morocco left GMT+1 and every stored row was an hour
 * out while the cache looked perfectly healthy.
 *
 * So, in order, and the order matters:
 *
 *   1. the published table is re-downloaded — for a dataset country it is
 *      read BEFORE the cache, so refilling the cache from a stale city
 *      file would rebuild the same wrong answer;
 *   2. the month in hand is dropped, so the fill cannot skip it;
 *   3. the fill runs, which re-fetches what was just dropped and tops up
 *      however far ahead it was asked to reach.
 *
 * Bounded to ONE month of re-fetching on purpose. This is a button
 * somebody pressed, and a clean rebuild of a year on a provider with no
 * dataset behind it is some three hundred and sixty requests.
 */
import {
  monthKeyOf,
  refetchStoredMonths,
  refreshPrayerDataCache,
  type StoredPrayerData,
} from './prayerStorage';
import { refetchDatasetFor } from './timezoneShift';

export type RefreshParams = Omit<StoredPrayerData, 'months'>;

export type RefreshStoredDataOptions = {
  /** The month to re-fetch rather than merely top up. Defaults to today's. */
  month?: Date;
  /** How far ahead to fill afterwards, in months. */
  monthsAhead?: number;
  /** `current` of `total` days fetched, for a bar somebody is watching. */
  onProgress?: (current: number, total: number) => void;
};

export async function refreshStoredPrayerData(
  params: RefreshParams,
  options: RefreshStoredDataOptions = {},
): Promise<void> {
  const month = options.month ?? new Date();
  // Never fatal: a device that cannot reach the CDN still has a cache to
  // rebuild from whatever its provider chain can answer with, and the
  // computed chain at the bottom of that cannot fail at all.
  await refetchDatasetFor(params).catch(() => undefined);
  await refetchStoredMonths(params, [monthKeyOf(month)]);
  await refreshPrayerDataCache(params, options.monthsAhead ?? 12, options.onProgress);
}
