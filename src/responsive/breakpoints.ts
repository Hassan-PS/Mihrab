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

import { useWindowDimensions } from 'react-native';

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
