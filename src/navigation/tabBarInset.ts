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

/**
 * How far the pill sits above the bottom edge.
 *
 * A gesture-navigation inset (iPhone 34, iPad 20, Android ~24) is the
 * home-indicator strip: the pill only has to clear the handle itself,
 * which is a ~5pt bar about 8pt up. A BUTTON navigation bar (Android's
 * 48) is a real bar and has to be cleared entirely.
 */
export function useTabBarBottom(): number {
  const insets = useSafeAreaInsets();
  // A correction, not an addition — the navigator has already reserved
  // `insets.bottom` under the bar. Asking for 14 and getting 48 is what
  // stranded the pill in the middle of nothing the first time.
  return Math.max(-insets.bottom, 14 - insets.bottom);
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
