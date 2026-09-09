import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The strip behind the system status bar, on a page that has no title bar
 * to cover it.
 *
 * ── WHY ───────────────────────────────────────────────────────────────
 *
 * No tab draws a header any more, and the app is edge to edge, so a tab's
 * content owns the window from the very top down. At rest that is fine —
 * every tab pads its content clear of the status bar. Scroll, though, and
 * whatever is at the top of the page rides up behind the clock and the
 * status icons and is drawn straight through them: reported first on
 * Today, where the location chip crossed the clock, and then on every
 * other tab and the pages inside them.
 *
 * ── WHY IT IS ALWAYS THERE, AND NOT A FADE ────────────────────────────
 *
 * On these pages the strip already IS the page's colour: the content
 * starts below it. So a band of exactly that colour is invisible at rest
 * — there is nothing for it to fade in from — and the only thing it ever
 * does is hide what scrolls under it. That buys the fix without wiring a
 * scroll offset through six screens and the pages inside them, and
 * without a frame of the wrong colour on any of them.
 *
 * Today is the exception and does not use this: its sky runs up under the
 * status bar on purpose, so the strip there has to stay clear at rest and
 * take the SKY's colour once the page moves — `HomeStatusBand`, which is
 * that same idea with a gradient to match.
 *
 * The pushed subpages do not use it either: they carry a real header,
 * which is the surface that covers the strip there.
 */
export function StatusBarBand({ color }: { color: ColorValue }) {
  const insets = useSafeAreaInsets();
  // Nothing to cover on a window with no status bar over it — a Mac, or a
  // phone in landscape on some platforms.
  if (insets.top <= 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.band, { height: insets.top, backgroundColor: color }]}
    />
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    // Over the page, and over nothing else: the tab bar is at the other
    // end of the window and a modal is a window of its own.
    zIndex: 2,
  },
});
