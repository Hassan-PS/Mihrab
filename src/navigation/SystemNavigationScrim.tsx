import { Platform, StyleSheet, View } from 'react-native';
import type { AppPalette } from '../theme/appPalette';
import { translucentSurface } from '../theme/chrome';
import { useSystemNavigationBand } from './tabBarInset';
import { useSystemBarSurface } from './systemBarSurface';

/**
 * A band behind the system's navigation BUTTONS, on the Android versions
 * that will not draw one themselves.
 *
 * Under edge-to-edge the page runs to the bottom of the window, which is
 * what makes a floating tab bar worth having. Behind three-button
 * navigation it also means back, home and recents are painted directly on
 * top of whatever has scrolled under them — on Android 14 that was a row of
 * grey glyphs over Arabic body text, with neither legible.
 *
 * IT IS THE TAB BAR'S OWN COLOUR — opaque `palette.accentSurface`, which is
 * `palette.bg` until Verdant (or any themed foot) lifts it. The two touch at
 * the bottom of the screen, so a frosted `card` wash here used to read as a
 * seam: the bar was the theme and the buttons sat on a different tint.
 *
 * A screen that wants the bar to be ITS colour publishes one — see
 * `systemBarSurface` (muṣḥaf page tone; settings subpages' `palette.bg`).
 * That colour is painted opaque and at the full height, because the point
 * of it is that the reader cannot tell where the page stops.
 *
 * Nothing for gestures: a thin handle over a live page is the entire point
 * of edge-to-edge, and a band behind it would just be a stripe.
 */
export function SystemNavigationScrim({ palette }: { palette: AppPalette }) {
  const band = useSystemNavigationBand();
  const surface = useSystemBarSurface();

  if (Platform.OS !== 'android') return null;
  if (band <= 0) return null;

  const fill =
    surface?.color ??
    (typeof palette.accentSurface === 'string'
      ? palette.accentSurface
      : typeof palette.bg === 'string'
        ? palette.bg
        : translucentSurface(palette.card));

  return (
    <View
      // Purely cosmetic, and the system's buttons sit on top of it — it must
      // never intercept a touch meant for them.
      pointerEvents="none"
      style={[
        styles.band,
        {
          height: band,
          backgroundColor: fill,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Above the navigator so a pushed opaque screen cannot hide the band
    // and leave the system buttons on the window's default colour.
    zIndex: 100,
    elevation: 100,
  },
});
