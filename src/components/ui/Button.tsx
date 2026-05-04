import { memo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Button — task #39 component library.
 *
 * Four variants:
 *   • `primary`     — filled accent, white label. Used for the most prominent
 *                     action on a screen (Save, Apply, Continue).
 *   • `secondary`   — outlined accent label. Used as the second-priority
 *                     action paired with a primary.
 *   • `tertiary`    — text-only accent. Used for low-priority actions in lists.
 *   • `destructive` — filled error. Reserved for delete / clear actions.
 *
 * Loading state shows an ActivityIndicator and sets `accessibilityState.busy`
 * + `disabled`. Disabled state dims to 50% opacity.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Visible loading spinner; disables press while true. */
  loading?: boolean;
  disabled?: boolean;
  /** Optional leading element (icon). */
  leading?: ReactNode;
  /** a11y override; defaults to `label`. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

function ButtonImpl({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  leading,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const { palette } = useAppPalette();
  const isDestructive = variant === 'destructive';
  const isFilled = variant === 'primary' || isDestructive;
  const fill = isDestructive ? palette.danger : palette.accent;
  const bg = isFilled ? fill : 'transparent';
  const fg = isFilled ? '#fff' : isDestructive ? palette.danger : palette.accent;
  const borderColor = variant === 'secondary' ? palette.accent : 'transparent';
  const inactive = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {leading}
          <Text style={[typeStyle('headline'), { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export const Button = memo(ButtonImpl);

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
  },
});
