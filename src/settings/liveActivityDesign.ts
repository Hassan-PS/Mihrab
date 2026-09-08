/**
 * What the Android Live Activity can actually draw on this phone.
 *
 * The style picker offered three designs on every Android and previewed
 * each as a sketch that matched none of them. Below API 36 the native
 * builder ignores the design entirely — every phone gets the same custom
 * card (prayer, time left, a plain bar) — so the picker was three buttons
 * that did nothing. On 36 the three are real, and `countdown` is a big
 * minute-resolution title over a bar; on 37 `countdown` becomes the
 * platform's MetricStyle row ("At 22:12 | In 2:18:42"), which the system
 * ticks itself. See MihrabLiveActivityModule.kt: `buildLegacy`,
 * `buildAndroid16`, `buildAndroid17`.
 *
 * Pure, keyed on the API level, so the previews and the enabled state are
 * derived from one place and tested without a device.
 */
export type LiveActivityDesign = 'timeline' | 'countdown' | 'markers';

/** Which native builder draws the card. */
export type LiveActivityRenderer = 'legacy' | 'android16' | 'android17';

export const LIVE_ACTIVITY_DESIGNS: LiveActivityDesign[] = ['timeline', 'markers', 'countdown'];

/** The first API level where the design picker does anything. */
export const LIVE_ACTIVITY_STYLES_MIN_API = 36;

export function liveActivityRenderer(apiLevel: number): LiveActivityRenderer {
  if (apiLevel >= 37) return 'android17';
  if (apiLevel >= LIVE_ACTIVITY_STYLES_MIN_API) return 'android16';
  return 'legacy';
}

export type DesignSupport = {
  /** The picker as a whole does something on this phone. */
  stylesSupported: boolean;
  renderer: LiveActivityRenderer;
  /** Per design: false where the native builder cannot draw it. */
  enabled: Record<LiveActivityDesign, boolean>;
};

export function liveActivityDesignSupport(apiLevel: number): DesignSupport {
  const renderer = liveActivityRenderer(apiLevel);
  const stylesSupported = renderer !== 'legacy';
  return {
    stylesSupported,
    renderer,
    // On 36 and 37 every design is drawn by a native path; the difference
    // between them is how `countdown` looks, which the preview shows. The
    // legacy card is one design with three names, so none is enabled.
    enabled: {
      timeline: stylesSupported,
      markers: stylesSupported,
      countdown: stylesSupported,
    },
  };
}
