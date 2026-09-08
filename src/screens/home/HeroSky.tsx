import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { skyBodyPosition, skyFor, skyPhaseFor } from './skyModel';

/**
 * The drawn sky behind today's hero — see skyModel.ts for which sky and
 * why it is a wash rather than a picture.
 *
 * Everything is in percentages of the card, so the same drawing fits the
 * phone's hero and the iPad's expanded one. It sits under the hero's
 * content (absoluteFill, no pointer events) and over the hero's own tint,
 * which is what keeps the countdown legible whatever the hour.
 */
function HeroSkyImpl({
  targetKey,
  progress,
  isDark,
  bleed,
}: {
  /** The prayer being counted down to — decides the sky. */
  targetKey: string;
  /** How far the current interval has run, 0–1 — moves the sun or moon. */
  progress: number;
  isDark: boolean;
  /**
   * How far past its parent's box to draw, so a sky mounted inside the
   * padded hero still reaches the card's edges.
   */
  bleed?: { horizontal: number; vertical: number };
}) {
  const phase = skyPhaseFor(targetKey);
  const sky = skyFor(phase, isDark);
  const body = skyBodyPosition(phase, progress);

  // A fixed, sparse field: the same six stars every night, so the card
  // does not twinkle from one render to the next.
  const stars = useMemo(
    () =>
      sky.stars
        ? [
            [6, 30, 1.2],
            [16, 12, 0.9],
            [27, 34, 1.0],
            [44, 8, 1.1],
            [56, 26, 0.9],
            [66, 40, 1.2],
          ]
        : [],
    [sky.stars],
  );

  return (
    <View
      pointerEvents="none"
      style={[
        styles.fill,
        bleed && {
          top: -bleed.vertical,
          bottom: -bleed.vertical,
          start: -bleed.horizontal,
          end: -bleed.horizontal,
        },
      ]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.top} stopOpacity={sky.alpha} />
            {/* Fading towards the foot, so the hero melts into the card
                rather than ending on a band of the deeper colour. */}
            <Stop offset="1" stopColor={sky.bottom} stopOpacity={sky.alpha * 0.45} />
          </LinearGradient>
          <RadialGradient id="glow" cx={`${body.x * 100}%`} cy={`${body.y * 100}%`} r="22%">
            <Stop offset="0" stopColor={sky.glow} stopOpacity={sky.alpha * 0.7} />
            <Stop offset="1" stopColor={sky.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sky)" />
        {sky.body !== 'none' ? (
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
        ) : null}
        {stars.map(([x, y, r], i) => (
          <Circle
            key={i}
            cx={`${x}%`}
            cy={`${y}%`}
            r={r}
            fill={sky.glow}
            fillOpacity={sky.alpha * 1.4}
          />
        ))}
        {sky.body === 'sun' ? (
          <Circle
            cx={`${body.x * 100}%`}
            cy={`${body.y * 100}%`}
            r={9}
            fill={sky.glow}
            fillOpacity={Math.min(1, sky.alpha * 2.2)}
          />
        ) : null}
      </Svg>
      {sky.body === 'moon' ? (
        // A crescent, drawn as one path in its own small canvas so it can
        // be a shape rather than a disc with a disc cut from it — the cut
        // read as a dark blob on the first device pass. Positioned by the
        // same fractions as everything else.
        <View
          style={[
            styles.moon,
            { left: `${body.x * 100}%`, top: `${body.y * 100}%` },
          ]}>
          <Svg width={MOON} height={MOON} viewBox="0 0 24 24">
            <Path
              d="M15.5 3.2a9.2 9.2 0 1 0 5.3 15.6A8 8 0 0 1 15.5 3.2Z"
              fill={sky.glow}
              fillOpacity={Math.min(1, sky.alpha * 2.2)}
            />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

export const HeroSky = memo(HeroSkyImpl);

/** The crescent's canvas, dp. */
const MOON = 22;

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  moon: {
    position: 'absolute',
    width: MOON,
    height: MOON,
    // Centred on its point with a transform, not a negative margin: the
    // sky is physical (the sun rises where it rises), and a transform
    // says so without touching the Left/Right margins the RTL rule bans.
    transform: [{ translateX: -MOON / 2 }, { translateY: -MOON / 2 }],
  },
});
