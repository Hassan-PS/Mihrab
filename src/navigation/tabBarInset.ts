/**
 * The floating tab bar's geometry, in one place — v2.8.5.
 *
 * The bar is absolutely positioned so that content passes UNDERNEATH it:
 * a list that ends exactly at a solid bar looks finished, and the reader
 * has no way to tell whether there is more below. A page sliding under a
 * floating pill says "there is more here" without spending a pixel on
 * saying it.
 *
 * The price of that is that the navigator no longer reserves any space,
 * so every scrolling screen has to reserve it instead — and a screen that
 * forgets ends with its last row permanently hidden. Hence one module:
 * the bar and the six screens read the same numbers, and changing the
 * bar's height cannot leave a screen behind.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { desktopSize, IS_MAC_CATALYST } from '../responsive/desktop';
import { DEVICE_CLASS } from '../responsive/deviceClass';

/** The pill's own height. */
export const TAB_BAR_HEIGHT = desktopSize(60);

/** Side inset, and therefore the width the pill is short of the window. */
export const TAB_BAR_SIDE_INSET = 14;

/** The smallest gap between the pill and the window's bottom edge. */
export const TAB_BAR_EDGE_GAP = 12;

/**
 * Above this, `insets.bottom` is a real navigation BAR, not a handle.
 * iPhone 34, Android gesture ~24, iPad 20 are all strips; Android's
 * three-button bar is ~48.
 */
const GESTURE_INSET_MAX = 34;

/**
 * How far the pill's bottom edge sits above the window's bottom edge.
 *
 * An ADDITION, not a correction — this is the whole gap, and nothing
 * else contributes to it.
 *
 * `getTabBarHeight` in @react-navigation/bottom-tabs returns a custom
 * numeric `height` VERBATIM; it only folds in `insets.bottom` when it is
 * computing the DEFAULT height. So the moment the pill sets
 * `height: TAB_BAR_HEIGHT` the navigator stops reserving the safe area
 * altogether, and the pill's own `paddingBottom` overrides the
 * `paddingBottom: insets.bottom` the bar would otherwise carry.
 *
 * Reading it as a correction — and therefore returning a NEGATIVE number
 * — hung the pill 10–20pt off the bottom of the window and cut the
 * labels clean off: no labels at all on iPhone (inset 34 → −20), labels
 * sitting on the gesture handle on Android (inset 24 → −10). Reported
 * 2026-08-02 with screenshots of all three targets.
 *
 * A gesture inset is a home-INDICATOR strip: a ~5pt handle about 8pt up,
 * which the pill only has to clear rather than vacate — hence sitting
 * inside the strip is fine and looks tighter. A BUTTON navigation bar is
 * real chrome and has to be cleared completely.
 */
export function tabBarBottomFor(insetBottom: number): number {
  if (insetBottom > GESTURE_INSET_MAX) {
    return insetBottom + TAB_BAR_EDGE_GAP;
  }
  return Math.max(TAB_BAR_EDGE_GAP, insetBottom - 10);
}

export function useTabBarBottom(): number {
  return tabBarBottomFor(useSafeAreaInsets().bottom);
}

/**
 * What a scrolling tab screen must add to the bottom of its content.
 *
 * Zero, everywhere: the bar is in flow on every platform now, so the
 * navigator reserves its own space and a screen that added this as well
 * would end with a bar's worth of dead air under it. Kept as a hook
 * rather than deleted because the six tab screens call it, and a single
 * place to change is the point — if the bar ever floats over content
 * again, this is what has to move with it.
 */
export function useTabBarInset(): number {
  return 0;
}

/**
 * Does this device get the rounded, inset PILL, or the plain full-width
 * bar?
 *
 * Phones get the pill. iPad and Mac get the plain bar — the pill was
 * tried on both and rejected.
 *
 * (The name is historical: the pill also used to float OVER the content.
 * It cannot — an absolutely positioned tab bar in this navigator paints
 * correctly and receives no touches at all.)
 */
export const FLOATS_OVER_CONTENT = !IS_MAC_CATALYST && DEVICE_CLASS === 'phone';
