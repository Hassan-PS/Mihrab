/**
 * Which way the app's layout runs, in one place.
 *
 * `AppNavigationRoot` used to decide this inline with
 * `settings.language === 'ar' ? 'rtl' : 'ltr'`, which left Urdu — an
 * Arabic-script, right-to-left language the app fully ships — laid out
 * left to right with right-to-left text inside it.
 *
 * It matters that exactly one rule answers this question. A component that
 * mirrors itself with `row-reverse` *and* sits in an already-mirrored tree
 * flips twice and lands back where it started: the seven-day strip put
 * today on the trailing edge in Arabic for exactly that reason. Anything
 * that needs to know should ask here, and anything inside a mirrored tree
 * should simply use `row` and let the direction do the work.
 */
export const RTL_LANGUAGES = ['ar', 'ur', 'fa', 'he'] as const;

export function isRtlLanguage(language: string | undefined | null): boolean {
  return RTL_LANGUAGES.includes(
    ((language ?? '').slice(0, 2).toLowerCase()) as (typeof RTL_LANGUAGES)[number],
  );
}

export function layoutDirectionFor(
  language: string | undefined | null,
): 'rtl' | 'ltr' {
  return isRtlLanguage(language) ? 'rtl' : 'ltr';
}
