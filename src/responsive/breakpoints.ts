/**
 * Responsive breakpoints + helpers — task #33 (iPad / macOS via "Designed
 * for iPad").
 *
 * iPhone apps run on Apple Silicon Macs and iPads via the "Designed for
 * iPad" / "iPhone" delivery; without intentional layout work they look
 * locked-portrait and tiny on a 27" Mac display. This module defines the
 * three width breakpoints the app commits to:
 *
 *   • COMPACT   (< 700pt) — phone portrait, the historical layout.
 *   • REGULAR   (700–1100pt) — iPad portrait, larger phone landscape, Mac small window.
 *   • EXPANDED  (≥ 1100pt) — iPad landscape, Mac wide window.
 *
 * Screens consult `useBreakpoint()` to switch layouts (single column →
 * master-detail, modal sheet → centered popover, day carousel widening,
 * etc.).
 */

import { Platform, useWindowDimensions } from 'react-native';

export type Breakpoint = 'compact' | 'regular' | 'expanded';

export const BREAKPOINT_REGULAR = 700;
export const BREAKPOINT_EXPANDED = 1100;

/** Maximum useful content width on wide screens — beyond this the content
 *  centers and gets margin instead of stretching, so prayer rows stay
 *  visually "in range." Lifted from common iOS Catalyst conventions. */
export const MAX_CONTENT_WIDTH = 720;

export function classifyWidth(width: number): Breakpoint {
  if (width >= BREAKPOINT_EXPANDED) return 'expanded';
  if (width >= BREAKPOINT_REGULAR) return 'regular';
  return 'compact';
}

/** Hook variant — re-runs on orientation change / window resize. */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return classifyWidth(width);
}

/** Returns the cap for a content column at the given width — used to
 *  set `maxWidth` on the HomeScreen carousel and other top-level cards
 *  so they don't stretch absurdly on a Mac window. */
export function contentColumnWidth(windowWidth: number): number {
  if (windowWidth < BREAKPOINT_REGULAR) return windowWidth;
  return Math.min(windowWidth, MAX_CONTENT_WIDTH);
}

/**
 * Pure column-count math for an auto-flowing grid: how many `minItemWidth`
 * columns fit in `available` px given `gutter` spacing, clamped to `[1, max]`.
 * Extracted so it's unit-testable without a renderer.
 */
export function columnsFor(
  available: number,
  minItemWidth: number,
  gutter: number = 12,
  max: number = 12,
): number {
  if (!(available > 0) || !(minItemWidth > 0)) return 1;
  // n items need n*minItemWidth + (n-1)*gutter <= available
  const n = Math.floor((available + gutter) / (minItemWidth + gutter));
  return Math.max(1, Math.min(max, n));
}

export type Responsive = {
  width: number;
  height: number;
  bp: Breakpoint;
  isWide: boolean;
  isLandscape: boolean;
  /** Standard inter-item / edge gutter for the current breakpoint. */
  gutter: number;
  /** Capped, centered content width for reading columns. */
  contentWidth: number;
};

/** One hook that bundles the values screens need, re-running on resize. */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const bp = classifyWidth(width);
  return {
    width,
    height,
    bp,
    isWide: bp !== 'compact',
    isLandscape: width > height,
    gutter: bp === 'compact' ? 12 : 16,
    contentWidth: contentColumnWidth(width),
  };
}

/**
 * Column count for an auto-flowing grid inside the current window, based on a
 * minimum comfortable item width. Re-runs on resize so grids reflow live.
 */
export function useColumns(
  minItemWidth: number,
  opts: { max?: number; gutter?: number; available?: number } = {},
): number {
  const { width } = useWindowDimensions();
  const gutter = opts.gutter ?? 12;
  const available = opts.available ?? contentColumnWidth(width);
  return columnsFor(available, minItemWidth, gutter, opts.max ?? 12);
}

/**
 * True when running as a Mac Catalyst binary. Used to feature-gate the
 * device-only surfaces (Qibla compass → no magnetometer; Live Activity → no
 * ActivityKit) and to opt into desktop window chrome. Falls back to `false`
 * until the Catalyst target ships a native constant, so behavior is unchanged
 * on iOS/Android today.
 */
export const isMacCatalyst: boolean =
  Platform.OS === 'ios' &&
  // RN exposes this on newer versions; guarded so older typings don't break.
  ((Platform as unknown as { isMacCatalyst?: boolean }).isMacCatalyst ?? false);
