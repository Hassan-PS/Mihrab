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
 *
 * ── AND ON 35+ IT IS OURS AFTER ALL ───────────────────────────────────
 *
 * The paragraph above says the platform took this over above API 35, and
 * that was the wrong reading of the evidence. What paints the bottom of
 * the window there is `android:id/navigationBarBackground`, filled with
 * the THEME's `android:navigationBarColor` — an opaque surface colour
 * inherited from Theme.Material3, not the adaptive scrim. That is why
 * `isNavigationBarContrastEnforced = false` measured as a no-op: it was
 * never the contrast scrim being measured. The theme now asks for a
 * transparent navigation bar (`styles.xml`), so the app draws this band
 * on every version, and the muṣḥaf can put its page under the buttons.
 *
 * A screen that wants the bar to be ITS colour publishes one — see
 * `systemBarSurface`. That colour is painted opaque and at the full
 * height, because the point of it is that the reader cannot tell where
 * the page stops.
 */
export function SystemNavigationScrim({ palette }: { palette: AppPalette }) {
  const band = useSystemNavigationBand();
  const surface = useSystemBarSurface();

  if (Platform.OS !== 'android') return null;
  if (band <= 0) return null;

  return (
    <View
      // Purely cosmetic, and the system's buttons sit on top of it — it must
      // never intercept a touch meant for them.
      pointerEvents="none"
      style={[
        styles.band,
        {
          height: band,
          backgroundColor: surface
            ? surface.color
            : translucentSurface(palette.card),
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
  },
});
