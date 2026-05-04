import { memo, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Banner — task #39 component library.
 *
 * Inline notification surface for permission prompts, errors, or info.
 * Four variants map onto the semantic palette:
 *   • `info`    — accentTint background.
 *   • `warning` — warning amber tint.
 *   • `error`   — error rose tint.
 *   • `success` — success green tint.
 *
 * Optional action button on the trailing side. The whole banner has
 * `accessibilityRole="alert"` so screen readers announce it on appear.
 */
export type BannerVariant = 'info' | 'warning' | 'error' | 'success';

type BannerProps = {
  message: string;
  variant?: BannerVariant;
  actionLabel?: string;
  onAction?: () => void;
  leading?: ReactNode;
};

function BannerImpl({
  message,
  variant = 'info',
  actionLabel,
  onAction,
  leading,
}: BannerProps) {
  const { palette } = useAppPalette();
  const colorMap: Record<
    BannerVariant,
    { bg: ColorValue; fg: ColorValue; accent: ColorValue }
  > = {
    info: { bg: palette.accentBg, fg: palette.text, accent: palette.accent },
    warning: { bg: palette.accentBg, fg: palette.text, accent: '#E5A02C' },
    error: { bg: palette.accentBg, fg: palette.text, accent: palette.danger },
    success: { bg: palette.accentBg, fg: palette.text, accent: '#3D9270' },
  };
  const c = colorMap[variant];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: c.bg }]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text
        style={[typeStyle('callout'), styles.text, { color: c.fg }]}
        numberOfLines={3}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={8}>
          <Text style={[typeStyle('headline'), { color: c.accent }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const Banner = memo(BannerImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  text: { flex: 1 },
  leading: { flexShrink: 0 },
});
