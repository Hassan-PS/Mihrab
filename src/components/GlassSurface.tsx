import type { ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useAppPalette } from '../hooks/useAppPalette';

/**
 * GlassSurface — a card surface that renders as translucent blurred material
 * ("Liquid Glass") on iOS when the system/Liquid-Glass palette is active, and
 * falls back to a solid `palette.card` view everywhere else.
 *
 * Pass shape/spacing (borderRadius, padding, margins) via `style` — do NOT pass
 * a backgroundColor; the surface supplies its own (blur in glass mode, solid
 * otherwise). The blur is clipped to the style's borderRadius via overflow.
 *
 * `intensity` maps to the iOS material thickness:
 *   thin    → systemThinMaterial   (lightest, most see-through)
 *   regular → systemMaterial       (default card)
 *   thick   → systemThickMaterial  (heaviest, most opaque — hero surfaces)
 * These materials adapt to light/dark automatically.
 */
type Props = ViewProps & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  intensity?: 'thin' | 'regular' | 'thick';
  /** Subtle hairline to lift the glass off the background (iOS glass only). */
  bordered?: boolean;
  /** Solid colour used in the non-glass fallback (defaults to palette.card).
   *  Lets callers preserve a tinted surface (e.g. the hero's accent bg). */
  fallbackColor?: ColorValue;
};

export function GlassSurface({
  style,
  children,
  intensity = 'regular',
  bordered = true,
  fallbackColor,
  ...rest
}: Props) {
  const { palette, isDark } = useAppPalette();
  const glass = palette.glass && Platform.OS === 'ios';

  if (!glass) {
    return (
      <View
        style={[{ backgroundColor: fallbackColor ?? palette.card }, style]}
        {...rest}>
        {children}
      </View>
    );
  }

  // Use the basic UIBlurEffect styles — the "systemMaterial*" variants are not
  // honoured by @react-native-community/blur under the new architecture (they
  // render dark regardless of appearance). 'xlight'/'light'/'dark' track the
  // mode reliably. Intensity nudges the light-mode strength.
  const blurType = isDark
    ? 'dark'
    : intensity === 'thin'
      ? 'xlight'
      : 'light';

  return (
    <View
      style={[
        styles.clip,
        bordered && styles.hairline,
        style,
        // Never let a caller's backgroundColor cover the blur.
        { backgroundColor: 'transparent' },
      ]}
      {...rest}>
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType={blurType}
        blurAmount={18}
        reducedTransparencyFallbackColor={palette.card as string}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // Apple's glass uses a faint top-edge separator; a 0.5pt hairline in a
  // translucent white reads correctly on both light and dark material.
  hairline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});
