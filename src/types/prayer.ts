export type TimingsMap = Record<string, string>;

export const DISPLAY_ORDER = [
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

export type DisplayPrayerKey = (typeof DISPLAY_ORDER)[number];

export const NEXT_SALAH_ORDER = [
  'Fajr',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;

export type NextSalahName = (typeof NEXT_SALAH_ORDER)[number];
