/**
 * Mushaf page asset URLs — task #130.
 *
 * The 604 page PNGs of the official Madinah Mushaf used to be bundled
 * inside the APK (~120 MB). Per user request, they are now hosted as
 * a one-shot GitHub release (`mushaf-assets-v1`) and downloaded on
 * first open of the mushaf view. This keeps the APK slim AND preserves
 * the original quality (palette PNGs stored exactly as the source had
 * them — no re-encoding pass).
 *
 * Source: archive.org/download/madinah_mushaf, community mirror of the
 * KFGQPC Madinah print. Hosted unmodified on the release.
 */

/** Absolute URL of a single mushaf page on the GitHub release CDN. */
export function mushafPageUrl(page: number): string {
  const safe = Math.max(1, Math.min(604, Math.round(page)));
  return `https://github.com/Hassan-PS/PrayerApp/releases/download/mushaf-assets-v1/page${safe}.png`;
}

/** Total number of pages in the mushaf — matches the standard Madinah print. */
export const MUSHAF_TOTAL_PAGES = 604;

/**
 * Image source spec for `<Image source={…} />`. Returns a `{ uri }`
 * pointing at the GitHub release. RN's image cache will populate
 * itself the first time each page is loaded; we explicitly prefetch
 * all 604 on the user's first download (see `mushafDownload.ts`) so
 * subsequent reads are warm-cache.
 */
export function mushafPageAsset(page: number): { uri: string } {
  return { uri: mushafPageUrl(page) };
}
