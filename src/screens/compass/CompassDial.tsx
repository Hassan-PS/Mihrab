import { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { CompassMode, SignalStrength } from './useCompassSensor';
import { SPACING } from '../../theme/tokens';

/**
 * The Qibla compass dial (docs/design/redesign-plan.md §4).
 *
 * A compass is the single most visually iconic object in a prayer app, and
 * this one was a white circle with four letters, a 7dp green bar and a
 * black dot. It is now an instrument: a degree ring with a tick every 10°
 * and a numeral every 30°, a thin needle with the Kaaba at its tip, a
 * small centre pin, and the compass signal drawn as an arc around the
 * outside of the ring rather than as a full-width bar with a label above
 * it. Monochrome plus the accent; one SVG.
 *
 * `needleDeg` is the rotation applied to the needle (Qibla bearing minus
 * current heading). A change here re-renders only this component.
 *
 * Geography, not typography: the cardinals and ticks mark directions, so
 * nothing in here follows the writing direction. East stays east in
 * Arabic.
 */
export const DIAL = 280;
const C = DIAL / 2;
/** The degree ring. */
const R = C - 22;
/** The signal arc, just outside the ring. */
const R_SIGNAL = C - 8;
const SIGNAL_C = 2 * Math.PI * R_SIGNAL;
const KAABA = 16;

type CompassDialProps = {
  mode: CompassMode;
  /** 0-360. Rotation of the needle relative to "Phone front". */
  needleDeg: number;
  /** 0–100, or the sentinel values the sensor hook uses. */
  signalStrength?: SignalStrength;
};

/** A point on a circle of radius `r` at `deg` clockwise from twelve o'clock. */
function polar(r: number, deg: number): { x: number; y: number } {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

function CompassDialImpl({ mode, needleDeg, signalStrength = -1 }: CompassDialProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  const a11yLabel =
    mode === 'live'
      ? t('compass.a11yDialLive', { deg: Math.round(needleDeg) })
      : mode === 'checking'
      ? t('compass.a11yDialChecking')
      : t('compass.a11yDialUnavailable');

  // SVG takes plain strings only — the *Solid palette fields exist for this.
  const ink = palette.textSolid;
  const quiet = palette.mutedSolid;
  const accent = palette.accentSolid;
  const live = mode === 'live';
  const signal = live && signalStrength >= 0 ? signalStrength / 100 : 0;

  const cardinals: Array<[number, string]> = [
    [0, t('compass.north')],
    [90, t('compass.east')],
    [180, t('compass.south')],
    [270, t('compass.west')],
  ];

  // Inside the numeral ring (which sits at R − 24), so the Kaaba never
  // covers the figure it happens to be pointing at.
  const tip = polar(R - 48, 0);

  return (
    <View style={styles.wrap}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
        style={[styles.dial, mode === 'unsupported' && styles.unsupported]}>
        <Svg width={DIAL} height={DIAL} viewBox={`0 0 ${DIAL} ${DIAL}`}>
          {/* The signal, as an arc around the outside: a full circle is a
              clean reading, a short one says move away from the metal. */}
          <Circle cx={C} cy={C} r={R_SIGNAL} stroke={quiet} strokeOpacity={0.18} strokeWidth={3} fill="none" />
          {signal > 0 ? (
            <Circle
              cx={C}
              cy={C}
              r={R_SIGNAL}
              stroke={accent}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${SIGNAL_C * signal} ${SIGNAL_C}`}
              transform={`rotate(-90 ${C} ${C})`}
            />
          ) : null}

          {/* The ring and its ticks. */}
          <Circle cx={C} cy={C} r={R} stroke={quiet} strokeOpacity={0.45} strokeWidth={1} fill="none" />
          {Array.from({ length: 36 }, (_, i) => i * 10).map(deg => {
            const major = deg % 30 === 0;
            const a = polar(R, deg);
            const b = polar(R - (major ? 10 : 5), deg);
            return (
              <Line
                key={deg}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={major ? ink : quiet}
                strokeOpacity={major ? 0.8 : 0.5}
                strokeWidth={major ? 1.5 : 1}
                strokeLinecap="round"
              />
            );
          })}
          {/* Numerals at 30°, where there is no cardinal. */}
          {[30, 60, 120, 150, 210, 240, 300, 330].map(deg => {
            const p = polar(R - 24, deg);
            return (
              <SvgText
                key={deg}
                x={p.x}
                y={p.y + 3.5}
                fill={quiet}
                fontSize={10}
                fontWeight="500"
                textAnchor="middle">
                {deg}
              </SvgText>
            );
          })}
          {/* The cardinals. North is the one that matters, so it is the
              one in ink and weight; the others are lighter. */}
          {cardinals.map(([deg, label]) => {
            const p = polar(R - 24, deg);
            return (
              <SvgText
                key={deg}
                x={p.x}
                y={p.y + 5}
                fill={deg === 0 ? ink : quiet}
                fontSize={deg === 0 ? 15 : 13}
                fontWeight={deg === 0 ? '700' : '600'}
                textAnchor="middle">
                {label}
              </SvgText>
            );
          })}

          {/* Phone front: a small filled marker just outside the ring at
              twelve o'clock. The needle is read against it. */}
          <Path
            d={`M ${C - 6} ${C - R - 14} L ${C + 6} ${C - R - 14} L ${C} ${C - R - 4} Z`}
            fill={accent}
          />

          {live ? (
            <G transform={`rotate(${needleDeg} ${C} ${C})`}>
              {/* Counterweight, so the needle reads as pivoting rather than
                  sprouting from the centre. */}
              <Line x1={C} y1={C} x2={C} y2={C + 26} stroke={quiet} strokeWidth={2.5} strokeLinecap="round" strokeOpacity={0.6} />
              {/* The needle. */}
              <Line x1={C} y1={C} x2={tip.x} y2={tip.y + KAABA / 2 + 2} stroke={accent} strokeWidth={2.5} strokeLinecap="round" />
              {/* The Kaaba at its tip: a cube with its band. */}
              <Rect x={C - KAABA / 2} y={tip.y - KAABA / 2} width={KAABA} height={KAABA} rx={2} fill={accent} />
              <Rect x={C - KAABA / 2} y={tip.y - KAABA / 2 + 4} width={KAABA} height={2.5} fill={palette.onAccent} opacity={0.9} />
            </G>
          ) : null}

          {/* The pin. */}
          <Circle cx={C} cy={C} r={5} fill={live ? accent : quiet} />
          <Circle cx={C} cy={C} r={2} fill={palette.onAccent} />

          {mode === 'unsupported' ? (
            <Line x1={C - 40} y1={C} x2={C + 40} y2={C} stroke={quiet} strokeWidth={2} strokeLinecap="round" />
          ) : null}
        </Svg>

        {mode === 'checking' ? (
          // activity-indicator-allowed: sensor-warmup is <1 s and transient.
          // A Skeleton dial would imply we're waiting for data when we're
          // actually waiting for the magnetometer to stabilise.
          <View style={styles.centre} pointerEvents="none">
            <ActivityIndicator size="large" color={palette.accent} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const CompassDial = memo(CompassDialImpl);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: SPACING.sm },
  dial: { width: DIAL, height: DIAL, alignItems: 'center', justifyContent: 'center' },
  unsupported: { opacity: 0.5 },
  centre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
