/**
 * Public source URL for HTTP User-Agent strings (Nominatim and similar expect
 * an identifiable app + contact). Forks should change this to their repo.
 */
export const APP_SOURCE_REPO_URL = 'https://github.com/Hassan-PS/Mihrab';

/** e.g. PrayerTimes/1.5.30 (+https://github.com/...; Nominatim) */
export function httpUserAgent(suffix: string): string {
  return `PrayerTimes/1.5.30 (+${APP_SOURCE_REPO_URL}; ${suffix})`;
}
