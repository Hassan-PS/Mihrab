/**
 * The counter ring — design review 1b.
 *
 * "A 400pt white void with a number in it. The counter card gives no hint
 * that it's the tap target, and gives nothing back when you tap. A ring
 * that fills is the entire feedback loop this screen is missing."
 *
 * Drawn rather than animated: the ring redraws on the same render as the
 * number, so the two can never disagree, and a dhikr counter tapped once a
 * second does not need a spring.
 *
 * The arc starts at twelve o'clock and runs clockwise. Past the target on
 * an open-ended dhikr the ring stays full — the overflow is counted in the
 * numeral, not by winding a second lap the eye cannot measure.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

type Props = {
  size: number;
  /** 0..1. Values above 1 are clamped — see the note above. */
  progress: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
};

const STROKE = 10;

function TasbihRingImpl({ size, progress, color, trackColor, children }: Props) {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, progress)) * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - filled}
          // Rotate the arc's origin to twelve o'clock. `origin` keeps the
          // rotation about the circle's own centre rather than the canvas'.
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={styles.centre} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

export const TasbihRing = memo(TasbihRingImpl);

const styles = StyleSheet.create({
  centre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
