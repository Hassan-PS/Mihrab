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
import { useEffect, useState } from 'react';
import { AppState, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buttonNavigationHeight,
  isButtonNavigation,
} from '../native/SystemTheme';
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
 * How far the pill is allowed to sit INSIDE a gesture strip.
 *
 * The strip is mostly empty: a ~5pt handle around 8pt up from the bottom
 * edge, so the pill can overlap the strip's outer part and still leave the
 * handle clear — which reads tighter than vacating the whole strip.
 *
 * Two rather than ten. At ten the pill's lower edge came down to about the
 * top of the handle and the two read as touching, with no daylight between
 * the app's chrome and the system's. Six was better and still too tight —
 * reported a second time — so this is now most of a 24dp strip's clearance:
 * the pill's bottom lands about 9pt above the handle instead of 5pt, while
 * still sitting inside the strip rather than vacating it, which is the whole
 * reason the pill is detached.
 */
const GESTURE_OVERLAP = 2;

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
export function tabBarBottomFor(
  insetBottom: number,
  /**
   * True when the system is using BUTTON navigation, whatever its height.
   *
   * The height test below is a proxy for "is this chrome or a handle", and
   * it is only a proxy. Measured on Android 14 in three-button mode: the
   * navigation bar is **24dp**, not the 48 this assumed — and the platform's
   * own `navigationBars()` inset agrees, so it was not safe-area-context
   * getting it wrong, as first suspected. Twenty-four is also exactly what a
   * gesture strip reports, so at that height no arithmetic can tell a row of
   * tappable buttons from a home indicator, and the pill tucked into the
   * strip as designed — straight underneath the back/home/recents glyphs.
   *
   * The system knows which it is, so ask it: `Settings.Secure`'s
   * `navigation_mode`. Undefined means nobody could say (iOS, or the native
   * module missing), and then the height proxy is still the best guess there
   * is.
   */
  buttonNavigation?: boolean,
  /**
   * How tall the button bar DRAWS, when that is more than it reports. Zero
   * for gestures and wherever nobody can say. See `systemNavigationBand`.
   */
  buttonBarHeight = 0,
): number {
  const band = systemNavigationBand(
    insetBottom,
    buttonNavigation,
    buttonBarHeight,
  );
  if (buttonNavigation || insetBottom > GESTURE_INSET_MAX) {
    return Math.max(insetBottom, band) + TAB_BAR_EDGE_GAP;
  }
  return Math.max(TAB_BAR_EDGE_GAP, insetBottom - GESTURE_OVERLAP);
}

/**
 * The strip along the bottom of the window that the system's navigation
 * occupies — as DRAWN, which behind buttons is not what it is reported as.
 *
 * Android 14 hands out a 24dp `navigationBars` inset for a bar it paints
 * 48dp tall, so back/home/recents are half inside the inset and half on top
 * of the app. Reported as the buttons cutting into the app, and it is
 * literally that: the platform reserved half of what it drew.
 *
 * Both the things that care take the larger number — the pill, so it clears
 * the glyphs, and `SystemNavigationScrim`, so its band reaches the top of
 * them. Same function so the two can never disagree about where the bar
 * ends.
 *
 * ZERO WHEN THERE ARE NO BUTTONS, gestures included — the handle is meant
 * to float over a live page, and a band painted behind it would just be a
 * stripe across the bottom of every screen.
 *
 * AND ZERO WHEN THE BAR IS NOT ALONG THE BOTTOM. Turn a phone on its side
 * and Android moves the button bar to one END of the long edge: the
 * `navigationBars` bottom inset goes to zero and the width appears on the
 * left or right instead. `buttonBarHeight` is a property of the BAR, not
 * of where it is, so taking the larger of the two painted a full-width
 * band across a landscape window with no buttons anywhere near it — over
 * the muṣḥaf's own mini player, reported as "a white thing covering the
 * player controls". If the system is not reserving anything along the
 * bottom, there is nothing down there to sit behind.
 */
export function systemNavigationBand(
  insetBottom: number,
  buttonNavigation?: boolean,
  buttonBarHeight = 0,
): number {
  if (!buttonNavigation) return 0;
  if (!(insetBottom > 0)) return 0;
  return Math.max(insetBottom, buttonBarHeight);
}

/**
 * Whether the system is on button navigation, re-read when it can change.
 *
 * Not derivable from the safe-area inset: on Android 14 both button and
 * gesture navigation report 24dp, so a change between them is not a change
 * in the inset and would never re-render on its own. Foreground and window
 * resize are the two moments it can differ from what we last asked.
 */
function useButtonNavigation(): {
  buttons: boolean | undefined;
  barHeight: number;
} {
  const [nav, setNav] = useState(read);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const reread = () => setNav(read());
    reread();
    const appState = AppState.addEventListener('change', s => {
      if (s === 'active') reread();
    });
    const dims = Dimensions.addEventListener('change', reread);
    return () => {
      appState.remove();
      dims.remove();
    };
  }, []);

  return nav;
}

function read(): { buttons: boolean | undefined; barHeight: number } {
  return { buttons: isButtonNavigation(), barHeight: buttonNavigationHeight() };
}

export function useTabBarBottom(): number {
  const { buttons, barHeight } = useButtonNavigation();
  return tabBarBottomFor(useSafeAreaInsets().bottom, buttons, barHeight);
}

/**
 * How much of the window's bottom edge the system navigation is drawing
 * over, for whoever needs to paint behind it. Zero unless the system is on
 * buttons — see `systemNavigationBand`.
 */
export function useSystemNavigationBand(): number {
  const { buttons, barHeight } = useButtonNavigation();
  return systemNavigationBand(useSafeAreaInsets().bottom, buttons, barHeight);
}

/**
 * What anything anchored to the bottom of the window has to keep clear.
 *
 * The inset alone is not enough behind buttons — Android 14 reports 24dp for a
 * bar it paints 48dp tall — and the band alone is zero under gestures, where
 * the handle still needs its strip. The larger of the two is the answer for
 * both, and it is what a bottom sheet needs: the sound picker's last row was
 * half-under the navigation bar, so the newest entry in the list was the one
 * you could not tap.
 */
export function useSystemNavigationReserve(): number {
  const { buttons, barHeight } = useButtonNavigation();
  const inset = useSafeAreaInsets().bottom;
  return Math.max(inset, systemNavigationBand(inset, buttons, barHeight));
}

/**
 * What a scrolling tab screen must add to the bottom of its content.
 *
 * The pill floats over the page again, so the navigator reserves nothing
 * and every scrolling screen has to reserve the bar's whole footprint
 * itself — height plus the gap beneath it — or its last row is permanently
 * hidden behind the bar. Zero on iPad and Mac, where the plain full-width
 * bar is in flow and the navigator handles it.
 *
 * This is exactly the "single place to change" the module was written for:
 * the six tab screens all call it, so putting the bar back over the content
 * was one line here rather than six edits and an omission.
 */
export function useTabBarInset(): number {
  const bottom = useTabBarBottom();
  return FLOATS_OVER_CONTENT ? TAB_BAR_HEIGHT + bottom : 0;
}

/**
 * Does this device get the rounded, inset PILL, or the plain full-width
 * bar?
 *
 * Phones get the pill. iPad and Mac get the plain bar — the pill was
 * tried on both and rejected.
 *
 * The name is accurate again: the pill floats OVER the content. It spent a
 * while in flow because an absolutely positioned tab bar in this navigator
 * used to paint correctly and receive no touches at all; re-tested on the
 * current version by tapping all six tabs, that is fixed.
 */
export const FLOATS_OVER_CONTENT = !IS_MAC_CATALYST && DEVICE_CLASS === 'phone';
