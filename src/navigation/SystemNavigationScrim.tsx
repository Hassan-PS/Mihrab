import { Platform, StyleSheet, View } from 'react-native';
import type { AppPalette } from '../theme/appPalette';
import { useSystemNavigationBand } from './tabBarInset';

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
 * Android 15+ solves this itself: it always draws a contrast scrim for
 * button navigation, measured as rgb(30,32,37) over app content of
 * rgb(13,14,18). Below 35 the platform leaves it to the app, and asking for
 * the system scrim does not work — `isNavigationBarContrastEnforced = true`
 * was tried on API 34 and the bottom of the screenshot came back
 * byte-identical. So the app draws the band, in its own background colour,
 * in exactly the case the newer platform would.
 *
 * ITS HEIGHT IS NOT THE INSET, and a first version that used the inset was
 * measurably too short. Android 14 paints a 48dp button bar and reports a
 * 24dp inset, so a 24dp band covered the lower half of the glyphs and left
 * the upper half over the app — see `systemNavigationBand`, which both this
 * and the pill read so they cannot disagree about where the bar ends.
 *
 * Nothing for gestures: a thin handle over a live page is the entire point
 * of edge-to-edge, and a band behind it would just be a stripe.
 */
export function SystemNavigationScrim({ palette }: { palette: AppPalette }) {
  const band = useSystemNavigationBand();

  if (Platform.OS !== 'android') return null;
  // `Platform.Version` is the API level on Android. 35 is where the
  // platform took this over.
  if (typeof Platform.Version === 'number' && Platform.Version >= 35) {
    return null;
  }
  if (band <= 0) return null;

  return (
    <View
      // Purely cosmetic, and the system's buttons sit on top of it — it must
      // never intercept a touch meant for them.
      pointerEvents="none"
      style={[styles.band, { height: band, backgroundColor: palette.bg }]}
    />
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
