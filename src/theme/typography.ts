/**
 * Typography system — task #36.
 *
 * 9-token type scale that every Text in the app should reference. Pairs
 * the platform default Latin face (SF Pro on iOS, Roboto on Android) with
 * Amiri / Scheherazade for Arabic ayah and dua text once those fonts are
 * bundled (a follow-up data PR — they need to be added to assets/fonts/
 * and registered in iOS Info.plist + Android src/main/assets).
 *
 * Each token defines `fontSize`, `lineHeight`, `fontWeight`, `letterSpacing`.
 * The `tabular` flag opts a token into tabular numerals — required for
 * prayer times, percentages, and any clock-style number per CLAUDE.md
 * principle 3 ("tabular precision for sacred data").
 */

import { tabularNumeralStyle } from './textScale';

export type TypeToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing?: number;
  /** When true, applies tabular-nums automatically. */
  tabular?: boolean;
};

export const TYPE: Record<
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'footnote'
  | 'caption',
  TypeToken
> = {
  display: { fontSize: 56, lineHeight: 60, fontWeight: '600', letterSpacing: -0.6, tabular: true },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.3 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '400', letterSpacing: 0.4 },
};

/** Returns a flat style object for a type token, with tabular numerals
 *  applied when the token opts in. Use as `style={typeStyle('body')}`. */
export function typeStyle(
  token: keyof typeof TYPE,
): TypeToken & { fontVariant?: ['tabular-nums'] } {
  const t = TYPE[token];
  return t.tabular ? { ...t, ...tabularNumeralStyle } : t;
}

/**
 * Bundled-font names — task #69.
 *
 * Component code references `FONTS.arabicQuran` etc. via the family name
 * (PostScript `name` field, not the filename). On iOS, the names below
 * must match the `UIAppFonts` entries in `ios/PrayerApp/Info.plist`.
 * On Android, the React Native asset pipeline makes them available
 * automatically once the `.ttf`s are dropped into
 * `android/app/src/main/assets/fonts/`.
 *
 * **Until the `.ttf` files are added** (see `docs/data-sources.md`
 * task #69), RN falls back to the system Arabic face — which renders
 * everything correctly but visually thinner than the proper Naskh.
 * The `arabicTextStyle()` helper below picks the right family while
 * staying robust to that fallback.
 *
 * Both fonts are SIL OFL 1.1 — explicitly permitted in commercial /
 * F-Droid distributions. Run `node scripts/font-check.js` to verify
 * the binaries are in place before a release.
 */
export const FONTS = {
  /** Primary Latin face — undefined falls back to the system default
   *  (SF Pro on iOS, Roboto on Android). We don't override Latin. */
  primary: undefined as string | undefined,
  /** Arabic body face — Naskh, used for dua / hadith / general Arabic. */
  arabicBody: 'Scheherazade New' as const,
  /** Arabic Quran face — used only for Quran ayahs (heavier diacritic
   *  handling, classical mushaf shapes). */
  arabicQuran: 'Amiri' as const,
} as const;

/**
 * Style helper for Arabic text. Returns a `{ fontFamily }` object you
 * can spread into a `Text` style. Use `kind='quran'` for ayahs,
 * `kind='body'` for everything else (dua text, transliterations,
 * Islamic event names).
 *
 * Implementation: returns the family name unconditionally — RN gracefully
 * falls back to the system face when a family isn't registered, so this
 * helper is safe to use before the .ttf binaries land. After the binaries
 * are dropped in, the same call sites switch to the bundled face with no
 * code changes.
 */
export function arabicTextStyle(kind: 'quran' | 'body' = 'body'): {
  fontFamily: string;
} {
  return {
    fontFamily: kind === 'quran' ? FONTS.arabicQuran : FONTS.arabicBody,
  };
}
