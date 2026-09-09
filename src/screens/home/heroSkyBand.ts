/**
 * The hero's sky, published for the one view that is NOT inside it: the
 * band behind the system status bar.
 *
 * ── WHY THE BAND NEEDS THIS ───────────────────────────────────────────
 *
 * On the phone the sky runs up under the status bar, which is the point of
 * it — the clock and the battery sit on the night or the dawn rather than
 * on a grey strip. At rest that is right. Scroll, though, and the hero's
 * own top row rides up into that strip: the city and the Qibla bearing
 * were drawn straight through the clock and the status icons, both
 * illegible (reported on a Pixel 10 Pro).
 *
 * So the strip stops being clear as soon as anything would pass behind it.
 * The band that covers it cannot be a colour of its own, or it would read
 * as a slab laid over the sky; it has to BE the sky at that height. That
 * is what this store carries: the gradient's two ends and the height it is
 * drawn over, from which the band mixes the exact colour of the pixel
 * directly beneath its lower edge — so the seam between band and sky is
 * not a seam at all, and the row simply disappears behind it.
 *
 * A module store rather than a prop or a context, for the reason
 * `tabBarVisibility` gives: the publisher (the hero) re-renders on the
 * countdown's tick, and the consumer is a view at the root of the screen
 * that must not re-render with it.
 */
import { useEffect, useState } from 'react';
import { skyColorAt } from './skyModel';

export type HeroSkyBand = {
  /** The gradient's top colour, as `skyFrame` gives it. */
  top: string;
  /** Its bottom colour. */
  bottom: string;
  /** The height the gradient is drawn over, in dp — the hero plus its bleed. */
  skyH: number;
};

let band: HeroSkyBand | null = null;
const listeners = new Set<(next: HeroSkyBand | null) => void>();

function same(a: HeroSkyBand | null, b: HeroSkyBand | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // The height is measured, so it wobbles by fractions of a dp between
  // layouts; a whole dp is the smallest change worth waking the band for.
  return a.top === b.top && a.bottom === b.bottom && Math.abs(a.skyH - b.skyH) < 1;
}

/** The hero says what its sky is. Returns the release, for an effect's cleanup. */
export function setHeroSkyBand(next: HeroSkyBand): () => void {
  if (!same(band, next)) {
    band = next;
    listeners.forEach(fn => fn(next));
  }
  return () => {
    // Only if nobody else has claimed it since: two heroes overlap for a
    // frame when the tab is remounted, and the one leaving must not clear
    // the one arriving.
    if (band === next || same(band, next)) {
      band = null;
      listeners.forEach(fn => fn(null));
    }
  };
}

/** The sky the band should wear, or null when no hero owns the strip. */
export function useHeroSkyBand(): HeroSkyBand | null {
  const [value, setValue] = useState(band);
  useEffect(() => {
    setValue(band);
    const fn = (next: HeroSkyBand | null) => setValue(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}

/** Tests only. */
export function _resetHeroSkyBand(): void {
  band = null;
  listeners.clear();
}

/**
 * The band's colour, as two-and-a-bit stops of the page's scroll.
 *
 * Kept here, pure and free of React Native, so a test can check the
 * colours rather than the source text they are written in.
 *
 * The sky's gradient is linear over `skyH`, so the colour beneath the
 * band's foot at scroll `s` — `skyColorAt((s + insetTop) / skyH)` — is
 * linear in `s` as well, and two stops describe it EXACTLY: where it
 * starts, and the scroll at which the foot reaches the sky's own foot.
 * A third stop, a short run later, is the page: past the hero there is no
 * sky left to match and the strip has to go on covering what scrolls
 * under it.
 */
export function statusBandStops({
  sky,
  insetTop,
  pageColor,
  handoff,
}: {
  sky: HeroSkyBand;
  insetTop: number;
  pageColor: string;
  /** The crossfade from the sky's last colour to the page's, in dp. */
  handoff: number;
}): { inputRange: number[]; outputRange: string[] } {
  const skyH = Math.max(1, sky.skyH);
  // Strictly increasing, whatever the hero measured: a stop that repeats
  // is an invariant violation to Animated, and a hero shorter than the
  // status bar is a legitimate first frame.
  const skyGone = Math.max(1, skyH - insetTop);
  return {
    inputRange: [0, skyGone, skyGone + Math.max(1, handoff)],
    outputRange: [
      skyColorAt(sky, Math.min(1, insetTop / skyH)),
      sky.bottom,
      pageColor,
    ],
  };
}
