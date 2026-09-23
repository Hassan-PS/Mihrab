/**
 * The native line view: a Ḥafṣ line drawn straight onto a canvas.
 *
 * ── WHY NOT <Text> ────────────────────────────────────────────────────
 *
 * A line of the muṣḥaf is one run of QPC glyphs, one glyph per word, laid
 * out at the font's own advances plus a gap the layout solved for. `<Text>`
 * can draw that, and did, at two costs that are the platform's, not ours:
 *
 *   • it BREAKS a line that comes out a hair wider than its box — between
 *     glyphs when nothing else will do, and a glyph is a whole word — so
 *     every line's box carried half an em of slack it never used, and the
 *     page was set that much smaller (`MUSHAF_LINE_BOX_SLACK_EM`);
 *   • it CLIPS the ink to the view, so calligraphy that overshoots its
 *     metrics — every swash, every stacked maddah — needs the view padded
 *     out and the padding pulled back with margins (`lineInkPadding`).
 *
 * The native view does neither. It measures each word with the same
 * shaper the platform's text view uses (Minikin on Android, CoreText on
 * iOS and Catalyst), puts the pen exactly where the layout says, and
 * draws: no box to overflow, no last word to lose. The ink still needs
 * room to land in, and the view is sized for it, but the line's BOX is the
 * run itself, so the widest line spans the whole text block.
 *
 * The `<Text>` path stays as the fallback — under Jest, on a build whose
 * native side lacks the view, and for one release as the escape hatch —
 * and everything else about a page (hit-testing, the word reader, the
 * follow-scroll, the scrubber's thumbnails) reads the block width from
 * `pageBlockEm`, which knows which path is drawing.
 */
import type { HostComponent, Platform, UIManager } from 'react-native';
import type { NativeProps, NativeRun } from './MushafLineNativeComponent';

export const MUSHAF_LINE_VIEW = 'MushafLine';

/**
 * One piece of a line, in drawing order (right to left): a run of glyphs
 * (`t`, in the page font), or a gap the pen skips (`g`, its width in dp).
 * A wash (`w`) is drawn behind the piece; an ink colour (`i`) replaces the
 * line's for the glyphs — only ever the marker's medallion. Both as
 * `processColor` gives them.
 *
 * The view's other props: `fontFamily` and `fontSize` (dp); `color`, the
 * page's ink; `penRight`, the x of the run's RIGHT edge inside the view
 * (the text is RTL); `penBaseline`, its y; and `boxTop` / `boxHeight`,
 * the line box the washes fill. All in dp from the view's own top-left.
 */
export type MushafLineRun = NativeRun;
export type MushafLineNativeProps = NativeProps;

let available: boolean | null = null;

/**
 * Whether this build carries the view. Decided once, on first use rather
 * than at import — the UI manager is asked, and it answers for a legacy
 * view manager on the new architecture the same way it does for a Fabric
 * component. Under Jest the answer is no, and the `<Text>` path draws.
 *
 * React Native is required here, not imported above: `mushafLayout.ts`
 * asks this to size the page block, and that module stays free of React
 * Native so the tests can replay exactly what the renderer draws.
 */
export function nativeMushafLineAvailable(): boolean {
  if (available === null) {
    try {
      const rn = require('react-native') as {
        Platform: typeof Platform;
        UIManager: typeof UIManager;
      };
      available =
        rn.Platform.OS !== 'web' &&
        typeof rn.UIManager.hasViewManagerConfig === 'function' &&
        rn.UIManager.hasViewManagerConfig(MUSHAF_LINE_VIEW) === true;
    } catch {
      available = false;
    }
  }
  return available;
}

/** Tests only: pretend the view is (or is not) there. */
export function setNativeMushafLineAvailableForTests(value: boolean | null): void {
  available = value;
}

let component: HostComponent<MushafLineNativeProps> | null = null;

/**
 * The host component — call only after `nativeMushafLineAvailable()`.
 * Required lazily so that a build without the view never registers it.
 */
export function MushafLineNative(): HostComponent<MushafLineNativeProps> {
  if (component === null) {
    component = (
      require('./MushafLineNativeComponent') as {
        default: HostComponent<MushafLineNativeProps>;
      }
    ).default;
  }
  return component;
}
