import { Platform, StyleSheet, View } from 'react-native';
import type { AppPalette } from '../theme/appPalette';
import { translucentSurface } from '../theme/chrome';
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
 * IT IS THE TAB BAR'S OWN MATERIAL, not a colour of its own — the same
 * `translucentSurface(palette.card)` the floating pill directly above it is
 * made of. The two touch at the bottom of the screen, so anything else reads
 * as a seam between the app's chrome and the system's.
 *
 * A FIRST VERSION PAINTED AN OPAQUE BAND OF `palette.bg`, and it looked like
 * a slab: whatever had scrolled under the buttons simply vanished, which is
 * not what the newer platform does. Measured on API 36 with three-button
 * navigation, at two content values far enough apart to solve for both
 * unknowns in `band = a·scrim + (1-a)·content`:
 *
 *   dark   content rgb(14,18,24)    → band rgb(20,23,30)
 *   light  content rgb(255,255,255) → band rgb(255,255,255)
 *
 * Both fit one answer on all three channels — white at 2.5% — which is why
 * API 36 reads as transparent: it very nearly is. Reproducing exactly that
 * was tried and is not what was wanted either; a band that matches the app's
 * bar is. Below 35 the platform draws nothing here at all, and asking for the
 * system's own scrim does not work: `isNavigationBarContrastEnforced = true`
 * was tried on API 34 and the bottom of the screenshot came back
 * byte-identical, which fits the SUPPRESS_SCRIM flag the bar declares.
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
      style={[
        styles.band,
        { height: band, backgroundColor: translucentSurface(palette.card) },
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
  },
});
