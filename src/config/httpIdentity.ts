/**
 * Public source URL for HTTP User-Agent strings (Nominatim and similar expect
 * an identifiable app + contact). Forks should change this to their repo.
 */
export const APP_SOURCE_REPO_URL = 'https://github.com/Hassan-PS/PrayerApp';

/** e.g. PrayerTimes/1.4.9 (+https://github.com/...; Nominatim) */
export function httpUserAgent(suffix: string): string {
  return `PrayerTimes/1.4.9 (+${APP_SOURCE_REPO_URL}; ${suffix})`;
}
