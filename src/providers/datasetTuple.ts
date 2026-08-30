/**
 * The on-disk shape a prayer-times dataset day takes, shared by every
 * country that has one.
 *
 * Lifted out of `islamiskaForbundetParser.ts` when Morocco became the second
 * tenant. Nothing here is Swedish or Moroccan — it is the column order the
 * builders write and the app reads, and both countries' datasets are
 * byte-compatible because of it.
 */

/** Fixed on-disk column order for dataset day tuples. */
export const DATASET_TIME_KEYS = [
  'Imsak',
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

/** A single day in a prepared dataset: 7 `HH:MM` strings in DATASET_TIME_KEYS order. */
export type DatasetDayTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
