/**
 * Design system tokens — task #34.
 *
 * Single source of truth for every visual primitive. Migrated to from the
 * scattered raw hex / magic numbers that `/tokens-audit` flagged across
 * tasks #8–#15. After this lands, the `reviewer` subagent's rule applies:
 * "no raw hex codes, no magic spacing/radius numbers outside tokens.ts."
 *
 * Six primitive scales:
 *   • COLOR    — semantic light + dark + OLED swatches (task #35).
 *   • SPACING  — 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
 *   • RADIUS   — xs / sm / md / lg / xl / full.
 *   • TYPE     — 9 type tokens (display → caption) — task #36.
 *   • MOTION   — easing curves + duration scale — task #38.
 *   • ELEVATION — light-only shadow ladder; dark uses surface lifts.
 *
 * Principle (CLAUDE.md): "calm before clever, reverent not heavy, tabular
 * precision for sacred data, the app shouldn't shout, time-of-day awareness."
 */

// ─── Spacing ──────────────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 64,
} as const;
export type SpacingToken = keyof typeof SPACING;

// ─── Radius ───────────────────────────────────────────────────────────────

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;
export type RadiusToken = keyof typeof RADIUS;

// ─── Color tokens (raw values — NOT consumed directly) ───────────────────
// Components should reference SEMANTIC tokens via the theme palette
// (`useAppPalette`); this raw layer is the implementation detail behind
// each theme's mapping.

const RAW = {
  // Daylight (warm paper, deep emerald) — task #35.
  paperWarm: '#FAF7F2',
  paperLifted: '#FFFFFF',
  inkDeep: '#1A1814',
  inkSoft: '#2A2823',
  warmGray: '#6B6660',
  warmGrayMuted: '#9A958E',
  divDayLight: '#EDE8DF',
  emeraldDeep: '#1F5F4A',
  emeraldHover: '#1A5240',
  emeraldTint: '#E2EEE9',

  // Night (deep ink-blue) — task #35.
  inkBlue: '#0E1218',
  inkBlueLifted: '#161B23',
  inkBlueSunken: '#080A0E',
  bone: '#E8E5DE',
  boneMuted: '#8A8780',
  divNight: '#1F2530',
  emeraldLifted: '#3A8E72',
  emeraldHoverDark: '#46A081',
  emeraldTintDark: '#152F25',

  // Accents — error has a per-theme variant because the deep rose used in
  // light fails WCAG AA against dark backgrounds (2.9:1 contrast). The dark
  // variant is brighter / more saturated so it stays legible.
  warningAmber: '#E5A02C',
  errorRose: '#B91C1C', // light theme
  errorRoseDark: '#F87171', // dark + OLED themes — passes 4.5:1 on ink-blue
  successGreen: '#3D9270',

  // Pure-black OLED variant.
  oledBlack: '#000000',
  oledLifted: '#0E1218',
} as const;

// ─── Semantic palette per theme ──────────────────────────────────────────

export type SemanticPalette = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceSunken: string;
  content: string;
  contentSecondary: string;
  contentTertiary: string;
  accent: string;
  accentHover: string;
  accentTint: string;
  divider: string;
  warning: string;
  error: string;
  success: string;
  /** Translucent overlay for modal scrims. RGBA recommended. */
  overlay: string;
};

export const PALETTE_LIGHT: SemanticPalette = {
  bg: RAW.paperWarm,
  surface: RAW.paperLifted,
  surfaceElevated: RAW.paperLifted,
  surfaceSunken: RAW.paperWarm,
  content: RAW.inkDeep,
  contentSecondary: RAW.warmGray,
  contentTertiary: RAW.warmGrayMuted,
  accent: RAW.emeraldDeep,
  accentHover: RAW.emeraldHover,
  accentTint: RAW.emeraldTint,
  divider: RAW.divDayLight,
  warning: RAW.warningAmber,
  error: RAW.errorRose,
  success: RAW.successGreen,
  overlay: 'rgba(26, 24, 20, 0.45)', // ink-deep at 45%
};

export const PALETTE_DARK: SemanticPalette = {
  bg: RAW.inkBlue,
  surface: RAW.inkBlueLifted,
  surfaceElevated: RAW.inkBlueLifted,
  surfaceSunken: RAW.inkBlueSunken,
  content: RAW.bone,
  contentSecondary: RAW.boneMuted,
  contentTertiary: '#605E58',
  accent: RAW.emeraldLifted,
  accentHover: RAW.emeraldHoverDark,
  accentTint: RAW.emeraldTintDark,
  divider: RAW.divNight,
  warning: RAW.warningAmber,
  error: RAW.errorRoseDark,
  success: RAW.successGreen,
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export const PALETTE_OLED: SemanticPalette = {
  ...PALETTE_DARK,
  bg: RAW.oledBlack,
  surface: RAW.oledLifted,
  surfaceElevated: RAW.oledLifted,
  surfaceSunken: RAW.oledBlack,
};

// ─── Elevation (shadow ladder, light theme only) ─────────────────────────

export const ELEVATION = {
  none: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  sm: { shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, shadowOffset: { width: 0, height: 1 } },
  md: { shadowOpacity: 0.08, shadowRadius: 6, elevation: 2, shadowOffset: { width: 0, height: 2 } },
  lg: { shadowOpacity: 0.1, shadowRadius: 12, elevation: 4, shadowOffset: { width: 0, height: 4 } },
} as const;

export type ElevationToken = keyof typeof ELEVATION;

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Returns the matching semantic palette for a theme key. */
export function paletteForTheme(
  theme: 'light' | 'dark' | 'oled',
): SemanticPalette {
  if (theme === 'oled') return PALETTE_OLED;
  if (theme === 'dark') return PALETTE_DARK;
  return PALETTE_LIGHT;
}
