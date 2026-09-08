import { memo, useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { MoonPhase, SkyFrame } from './skyModel';

/**
 * The drawn sky behind today's hero — see skyModel.ts for the passages,
 * the keyframes, and why it is painted at full strength whatever the theme.
 *
 * Everything is in percentages of the card, so the same drawing fits the
 * phone's hero and the iPad's expanded one. It sits under the hero's
 * content (absoluteFill, no pointer events); the content takes its ink
 * from the sky (`skyInkAt`), not from the theme.
 */
function HeroSkyImpl({
  frame,
  bleed,
  sceneTop = 0,
  sceneBottom = 0,
}: {
  frame: SkyFrame;
  /**
   * How far past its parent's box to draw, so a sky mounted inside the
   * padded hero still reaches the card's edges.
   */
  bleed?: { horizontal: number; top: number; bottom: number };
  /**
   * A band at the top of the sky, dp, that the gradient paints but the
   * sun, moon and stars keep out of. On the phone the sky runs up under
   * the status bar; the bodies are laid out in the sky BELOW it, or the
   * moon lands between the clock and the battery and reads as one more
   * status icon.
   */
  sceneTop?: number;
  /**
   * The same at the foot: the countdown block, which the bodies must not
   * pass behind. The gradient still paints it.
   */
  sceneBottom?: number;
}) {
  const { top, bottom, glow, stars, body } = frame;

  // The scene's height in dp, once laid out, so a fraction of the scene
  // can be turned into a position under `sceneTop`. Until then — and
  // wherever there is no band — the plain percentage of the whole sky.
  const [height, setHeight] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height),
    [],
  );
  const banded = sceneTop > 0 || sceneBottom > 0;
  const room = height - sceneTop - sceneBottom;
  // The model places bodies in the top ~0.3 of a short card. Given a
  // band of its own, the drawing uses the band: the top third of the
  // card becomes the whole of the room, so the sun at its lowest sits
  // just above the countdown (the horizon) and the moon crosses the
  // middle of the open sky rather than hugging the location chip.
  const spread = (fraction: number) =>
    Math.max(0.08, Math.min(0.9, 0.1 + (fraction / 0.3) * 0.75));
  const sceneY = (fraction: number): number | `${number}%` =>
    banded && room > 0 ? sceneTop + spread(fraction) * room : `${fraction * 100}%`;

  // A fixed, sparse field in the top strip: the same stars every night, so
  // the card does not twinkle from one render to the next, and none of
  // them behind the countdown.
  const starField = useMemo(
    () => [
      [6, 30, 1.2],
      [16, 12, 0.9],
      [27, 34, 1.0],
      [44, 8, 1.1],
      [56, 26, 0.9],
      [66, 40, 1.2],
      [78, 14, 0.8],
    ],
    [],
  );

  // When the table has taken the room — extra times and the Mālikī
  // boundaries all on — the band can close to a sliver. A moon drawn
  // there would sit half behind the countdown; the gradient alone says
  // the hour well enough until the room comes back.
  const cramped = banded && height > 0 && room < 40;
  const bodyXY = body.kind === 'none' || cramped ? null : { x: body.x, y: body.y };
  const drawStars = stars > 0 && !cramped;

  return (
    <View
      pointerEvents="none"
      onLayout={banded ? onLayout : undefined}
      style={[
        styles.fill,
        bleed && {
          top: -bleed.top,
          bottom: -bleed.bottom,
          start: -bleed.horizontal,
          end: -bleed.horizontal,
        },
      ]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
          {bodyXY ? (
            <RadialGradient id="glow" cx={`${bodyXY.x * 100}%`} cy={sceneY(bodyXY.y)} r="26%">
              <Stop
                offset="0"
                stopColor={glow}
                // A crescent throws far less light than a full moon: the
                // halo follows the lit fraction, so a thin moon sits in a
                // near-dark sky rather than a dark disc in a bright one.
                stopOpacity={
                  body.kind === 'sun'
                    ? 0.65 * body.alpha
                    : body.kind === 'moon'
                      ? 0.12 + 0.4 * body.lit
                      : 0
                }
              />
              <Stop offset="1" stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sky)" />
        {bodyXY ? <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" /> : null}
        {drawStars
          ? starField.map(([x, y, r], i) => (
              <Circle
                key={i}
                cx={`${x}%`}
                cy={sceneY(y / 100)}
                r={r}
                fill={glow}
                fillOpacity={0.85 * stars}
              />
            ))
          : null}
        {body.kind === 'sun' && !cramped ? (
          <Circle
            cx={`${body.x * 100}%`}
            cy={sceneY(body.y)}
            r={9}
            fill={glow}
            fillOpacity={body.alpha}
          />
        ) : null}
      </Svg>
      {body.kind === 'moon' && !cramped ? (
        <View style={[styles.moon, { start: `${body.x * 100}%`, top: sceneY(body.y) }]}>
          <Moon phase={body.phase} lit={glow} shadow={top} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The moon in one of its eight phases, as seen from the northern
 * hemisphere: waxing lights the right limb, waning the left. The lit disc
 * is drawn whole and the shadow laid over it — the shadow is the sky's own
 * top colour, so the dark part of the moon is sky, as it is. At new moon
 * only a faint rim is left; at full there is no shadow.
 */
function Moon({ phase, lit, shadow }: { phase: MoonPhase; lit: string; shadow: string }) {
  const r = 9;
  const c = MOON / 2;
  const shadowPath = useMemo(() => moonShadowPath(phase, c, c, r), [phase, c]);
  return (
    <Svg width={MOON} height={MOON} viewBox={`0 0 ${MOON} ${MOON}`}>
      <Circle cx={c} cy={c} r={r} fill={lit} fillOpacity={phase === 0 ? 0.18 : 1} />
      {shadowPath ? <Path d={shadowPath} fill={shadow} /> : null}
    </Svg>
  );
}

/**
 * The shadow on a moon of `phase` (0 new … 4 full … 7 waning crescent).
 *
 * The terminator is a half-ellipse whose horizontal radius is r·cos(2πp)
 * — a straight line at the quarters, bowing toward the lit side for a
 * crescent and toward the dark side for a gibbous. The shadow is the dark
 * limb's semicircle closed by that terminator. Null at full moon (no
 * shadow) and at new moon (handled as a rim by the caller).
 */
export function moonShadowPath(phase: MoonPhase, cx: number, cy: number, r: number): string | null {
  if (phase === 4) return null;
  if (phase === 0) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  const p = phase / 8; // 0 → 1 over the month
  const waxing = p < 0.5;
  const rx = Math.round(Math.abs(Math.cos(2 * Math.PI * p)) * r * 1000) / 1000;
  // Crescent (less than half lit): the terminator bows toward the lit side,
  // so the shadow is more than half the disc. Gibbous: it bows into the
  // shadow, which is less than half.
  const lessThanHalfLit = p < 0.25 || p > 0.75;
  // Shadow limb: left when waxing (lit on the right), right when waning.
  const limbSweep = waxing ? 0 : 1; // from top to bottom around the dark limb
  // Return along the terminator from bottom to top. A crescent's shadow
  // bows toward the lit side (sweep 0 bows right, 1 bows left); a gibbous'
  // bows back into the shadow. Verified against a rendering of all eight.
  const termSweep = waxing ? (lessThanHalfLit ? 0 : 1) : lessThanHalfLit ? 1 : 0;
  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 0 ${limbSweep} ${cx} ${cy + r}`,
    `A ${rx} ${r} 0 0 ${termSweep} ${cx} ${cy - r}`,
    'Z',
  ].join(' ');
}

export const HeroSky = memo(HeroSkyImpl);

/** The moon's canvas, dp. */
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
