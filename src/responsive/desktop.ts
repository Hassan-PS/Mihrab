/**
 * Mac Catalyst detection and its one consequence — v2.8.5.
 *
 * Catalyst runs the iPad build on macOS, and UIKit hands it a scaled
 * coordinate space: 1pt of iPad layout paints at 0.77 of a Mac point on
 * the default "Optimize for Mac" setting. Type sized for a device held
 * 30cm from the face therefore arrives on a display sitting 70cm away,
 * 23% smaller than it was drawn. A 14pt sidebar row is legible on an
 * iPad and squinting material on a 27" screen.
 *
 * macOS's own metrics are the target: a Finder source-list row is 13pt
 * type in a ~200pt column that the user can widen, and a window title is
 * 13-15pt of semibold. Multiplying the iPad sizes by ~1.25 lands there
 * and undoes the scale-down without a second design language.
 *
 * Deliberately NOT a breakpoint: a narrow Catalyst window is still a Mac,
 * and a 1200pt iPad window is still held in the hands. Width answers a
 * different question (how much fits) than this does (how far away is it).
 */
import { isMacCatalyst } from './breakpoints';

/**
 * True only inside a Mac Catalyst process.
 *
 * Re-exported from `breakpoints` rather than re-derived: that one checks
 * BOTH `Platform.isMacCatalyst` and `interfaceIdiom === 'mac'`, and a
 * second, subtly weaker detector would fail silently — every desktop size
 * would quietly stay at its phone value and the only symptom would be
 * "the Mac still looks small".
 */
export const IS_MAC_CATALYST: boolean = isMacCatalyst;

/**
 * Multiplier for text and control metrics designed at iPad scale.
 *
 * 1.4, not the 1.30 that undoes Catalyst's canvas scale-down. Parity with
 * an iPad is the wrong target: an iPad is held at 30cm and touched, a Mac
 * sits at 70cm and is pointed at. macOS's own tab-bar labels and source
 * lists are proportionally larger than iPadOS's for exactly that reason,
 * so the multiplier has to cover the distance as well as the scale.
 */
export const DESKTOP_SCALE = IS_MAC_CATALYST ? 1.4 : 1;

/** Round a design size into the desktop's scale. */
export function desktopSize(size: number): number {
  return IS_MAC_CATALYST ? Math.round(size * DESKTOP_SCALE) : size;
}
