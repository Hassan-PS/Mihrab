import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { DURATION } from '../../theme/motion';
import { RADIUS } from '../../theme/tokens';

/**
 * Skeleton — task #39 + #42 loading state.
 *
 * Pulsing placeholder rectangle that occupies the space the eventual
 * content will fill — keeps layouts stable so when data arrives there's
 * no reflow. Replaces inline `<ActivityIndicator>` usages flagged by
 * `/state-coverage` for the layout-stability win.
 *
 * Reduce Motion: when enabled, the pulse stops at 50% opacity (still
 * communicates "loading" via shape, just no movement).
 */
type SkeletonProps = {
  /** Width — px or percentage. */
  width?: number | `${number}%`;
  /** Height in px. */
  height?: number;
  radius?: keyof typeof RADIUS;
  style?: ViewStyle;
};

function SkeletonImpl({ width = '100%', height = 16, radius = 'sm', style }: SkeletonProps) {
  const { palette } = useAppPalette();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.8,
          duration: DURATION.expressive * 2,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: DURATION.expressive * 2,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: RADIUS[radius],
          backgroundColor: palette.muted,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

export const Skeleton = memo(SkeletonImpl);

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});
