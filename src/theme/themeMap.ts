/**
 * Theme contrast verification — task #35.
 *
 * The new "Daylight" / "Night" / "OLED" themes from `tokens.ts` are
 * structured around semantic tokens (bg / surface / content / etc.).
 * This module is the gate that proves WCAG-AA contrast (≥4.5:1 for body
 * text, ≥3:1 for large text) holds for every theme's content-on-surface
 * pairing — so a future palette tweak can't silently degrade legibility.
 *
 * The actual contrast check is exposed as a pure function used by tests
 * (`__tests__/themeContrast.test.ts`).
 */

import {
  PALETTE_DARK,
  PALETTE_LIGHT,
  PALETTE_OLED,
  type SemanticPalette,
} from './tokens';

export const THEMES: Record<'light' | 'dark' | 'oled', SemanticPalette> = {
  light: PALETTE_LIGHT,
  dark: PALETTE_DARK,
  oled: PALETTE_OLED,
};

/** Convert hex / rgba string → linear RGB triplet in [0, 1]. */
function parseColorToLinearRgb(c: string): [number, number, number] {
  const cleaned = c.trim();
  // Hex
  const hex = cleaned.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const v = hex[1];
    return [
      parseInt(v.slice(0, 2), 16) / 255,
      parseInt(v.slice(2, 4), 16) / 255,
      parseInt(v.slice(4, 6), 16) / 255,
    ].map(srgbToLinear) as [number, number, number];
  }
  // rgba(...)
  const rgba = cleaned.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgba) {
    return [
      parseInt(rgba[1], 10) / 255,
      parseInt(rgba[2], 10) / 255,
      parseInt(rgba[3], 10) / 255,
    ].map(srgbToLinear) as [number, number, number];
  }
  throw new Error(`Unsupported color format: ${c}`);
}

function srgbToLinear(v: number): number {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.1. */
export function relativeLuminance(color: string): number {
  const [r, g, b] = parseColorToLinearRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colors (1:1 to 21:1). WCAG AA requires:
 *  - 4.5:1 for normal text
 *  - 3.0:1 for large text (18pt+) and UI components */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Returns the canonical content-on-surface pairings each theme must pass. */
export function pairsToCheck(p: SemanticPalette): Array<{
  name: string;
  fg: string;
  bg: string;
  /** WCAG-AA target for this pairing. */
  target: number;
}> {
  return [
    { name: 'content on bg', fg: p.content, bg: p.bg, target: 4.5 },
    { name: 'content on surface', fg: p.content, bg: p.surface, target: 4.5 },
    { name: 'contentSecondary on bg', fg: p.contentSecondary, bg: p.bg, target: 4.5 },
    { name: 'accent on bg', fg: p.accent, bg: p.bg, target: 3.0 }, // UI element
    { name: 'accent on accentTint', fg: p.accent, bg: p.accentTint, target: 3.0 },
    { name: 'error on bg', fg: p.error, bg: p.bg, target: 4.5 },
  ];
}
