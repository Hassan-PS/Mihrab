import { memo, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ELEVATION, RADIUS, SPACING } from '../../theme/tokens';

/**
 * Card — task #39 component library.
 *
 * Surface container with token-based radius and padding. Three variants
 * map onto the elevation ladder:
 *   • `default`   — flat surface, subtle border in flat-chrome themes.
 *   • `elevated`  — soft shadow (light only — dark themes use the
 *                   surfaceElevated palette token instead, since shadows
 *                   on dark backgrounds look like gray smudges).
 *   • `subtle`    — sunken surface for nested cards.
 */
export type CardVariant = 'default' | 'elevated' | 'subtle';

type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  /** Padding token. Defaults to `lg` (16). */
  padding?: keyof typeof SPACING;
  /** Radius token. Defaults to `md` (12). */
  radius?: keyof typeof RADIUS;
  style?: ViewStyle;
};

function CardImpl({ children, variant = 'default', padding = 'lg', radius = 'md', style }: CardProps) {
  const { palette, isDark } = useAppPalette();
  const bg =
    variant === 'subtle'
      ? palette.bg
      : variant === 'elevated'
      ? palette.card
      : palette.card;
  const elev =
    !isDark && variant === 'elevated' ? ELEVATION.md : ELEVATION.none;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: RADIUS[radius],
          padding: SPACING[padding],
          borderWidth: variant === 'default' && !isDark ? 0 : StyleSheet.hairlineWidth,
          borderColor: palette.border,
          ...(Platform.OS === 'ios'
            ? {
                shadowColor: '#000',
                shadowOffset: 'shadowOffset' in elev ? elev.shadowOffset : { width: 0, height: 0 },
                shadowOpacity: elev.shadowOpacity,
                shadowRadius: elev.shadowRadius,
              }
            : { elevation: elev.elevation }),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export const Card = memo(CardImpl);
