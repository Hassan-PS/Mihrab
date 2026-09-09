import { useEffect, useMemo, useState } from 'react';
import { Animated, StatusBar, StyleSheet } from 'react-native';
import { INK_SWITCH_LUMINANCE, luminance } from './skyModel';
import { statusBandStops, useHeroSkyBand } from './heroSkyBand';
import { SPACING } from '../../theme/tokens';

/**
 * The strip behind the system status bar, on the phone's Today screen.
 *
 * AT REST IT IS NOT THERE. The sky runs up under the clock and the battery
 * and that is the design: a hero that stops at the status bar is a card,
 * not a sky. The strip appears the moment the page moves, because the
 * hero's own top row — the city, the Qibla bearing — rides up into it and
 * was being drawn straight through the system's glyphs.
 *
 * ITS COLOUR IS THE SKY'S OWN, at the height its lower edge sits at. The
 * gradient is linear over `skyH`, so the colour under the band's foot at
 * scroll `s` is `skyColorAt((s + insetTop) / skyH)` — and because that is
 * linear in `s` too, two interpolation stops describe it exactly rather
 * than approximately: at rest, and at the scroll where the band's foot
 * reaches the sky's. Matching the pixel BELOW the band (not above it) is
 * what makes the join invisible: the band's own top edge is the edge of
 * the screen, where nothing can be compared to it.
 *
 * Past the hero there is no sky left to match, so it hands over to the
 * page's own colour across a short crossfade — the hero's rounded foot is
 * sliding past the strip exactly then, and the two read as one movement.
 * The status bar's glyphs go with it: they take their ink from the sky
 * while the sky is up there (the hero sets that, from the same model), and
 * from the page once the page is what they sit on. Without that, a night
 * sky in a light app left white glyphs on a white strip.
 */
export function HomeStatusBand({
  scrollY,
  insetTop,
  pageColor,
}: {
  /** The Today page's scroll offset, in dp. */
  scrollY: Animated.Value;
  /** The status bar's height — the band's height, and nothing more. */
  insetTop: number;
  /** What the page under the hero is coloured. */
  pageColor: string;
}) {
  const sky = useHeroSkyBand();
  const [overPage, setOverPage] = useState(false);

  /**
   * The scroll at which the band's foot leaves the sky, and the run over
   * which it changes hands. Guarded so the stops stay strictly increasing
   * on a hero too short to have any sky under the strip at all.
   */
  const skyGone = Math.max(SPACING.md + 1, (sky?.skyH ?? 0) - insetTop);

  useEffect(() => {
    if (!sky) {
      setOverPage(false);
      return;
    }
    const id = scrollY.addListener(({ value }) => {
      setOverPage(value >= skyGone);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, skyGone, sky]);

  const style = useMemo(() => {
    if (!sky) return null;
    const stops = statusBandStops({
      sky,
      insetTop,
      pageColor,
      handoff: HANDOFF_DP,
    });
    return {
      height: insetTop,
      // Fully there by the time the top row has travelled its own margin,
      // which is the point at which it would otherwise touch the glyphs.
      opacity: scrollY.interpolate({
        inputRange: [0, SPACING.md],
        outputRange: [0, 1],
        extrapolate: 'clamp' as const,
      }),
      backgroundColor: scrollY.interpolate({
        ...stops,
        extrapolate: 'clamp' as const,
      }),
    };
  }, [sky, insetTop, pageColor, scrollY]);

  if (!sky || insetTop <= 0 || !style) return null;

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.band, style]} />
      {/* Only once the page is what the glyphs sit on. Before that the
          hero owns the bar, from the sky it is drawing — see TodayCard. */}
      {overPage ? (
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle={
            luminance(pageColor) < INK_SWITCH_LUMINANCE
              ? 'light-content'
              : 'dark-content'
          }
          animated
        />
      ) : null}
    </>
  );
}

/** The crossfade from the sky's last colour to the page's, in dp of scroll. */
const HANDOFF_DP = 24;

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    // Over the page, under nothing: the tab bar and the modals are
    // elsewhere in the tree, and the band never takes a touch.
    zIndex: 2,
  },
});
