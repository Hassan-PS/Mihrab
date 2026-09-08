import { Animated, StyleSheet, type ColorValue } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  FLOATS_OVER_CONTENT,
  TAB_BAR_HEIGHT,
  useTabBarBottom,
} from './tabBarInset';

/**
 * The page dissolving into the floating tab bar, instead of crashing into
 * it.
 *
 * The pill is translucent (`translucentSurface`, 88%) and the page scrolls
 * under it — that is the point of a floating bar, it says "there is more
 * here". But translucency over live text with nothing in between does not
 * read as depth: on every scrolling tab a row of body text, or a whole row
 * of pill buttons on the Log, showed through the bar and overlapped its
 * labels, and the app looked unfinished rather than layered. Seen on the
 * device on all five scrolling tabs, 2026-09-08.
 *
 * This is the thing that was missing: a short vertical fade from nothing
 * to the page colour, painted behind the bar and reaching a little above
 * it, so content is already gone by the time it would meet the pill. It
 * lives in the tab navigator's `screenLayout` — under the bar, over the
 * screen — and it fades out with the bar when the bar slides away, driven
 * by the same `Animated.Value`, so the two can never be out of step.
 *
 * ONLY FOR A PLAIN HEX, for the same reason `translucentSurface` is: under
 * Liquid Glass `palette.bg` is a `PlatformColor`, an SVG stop cannot take
 * one, and that theme brings its own material anyway. And only where the
 * bar floats — on iPad and Mac it is in flow and the page ends above it.
 */

/** How far above the pill the fade begins. */
export const TAB_BAR_SCRIM_REACH = 24;

/** The colour an SVG gradient can be built from, or nothing. */
export function scrimColor(bg: ColorValue): string | null {
  if (typeof bg !== 'string') return null;
  return /^#[0-9a-f]{6}$/i.test(bg) ? bg : null;
}

export function TabBarScrim({
  bg,
  slide,
}: {
  bg: ColorValue;
  /** 0 with the bar in place, 1 with it slid away. */
  slide: Animated.Value;
}) {
  const bottom = useTabBarBottom();
  const color = scrimColor(bg);
  if (!FLOATS_OVER_CONTENT || !color) return null;
  const height = TAB_BAR_HEIGHT + bottom + TAB_BAR_SCRIM_REACH;
  return (
    <Animated.View
      pointerEvents="none"
      testID="tab-bar-scrim"
      style={[
        styles.scrim,
        {
          height,
          opacity: slide.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        },
      ]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="tabBarScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="0.5" stopColor={color} stopOpacity={0.9} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabBarScrim)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
