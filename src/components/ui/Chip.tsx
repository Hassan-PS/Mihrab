import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Chip — one of several options, where the chosen one is the loud one
 * (docs/design/redesign-plan.md §2.7).
 *
 * Unselected: text in `muted`, no fill, no border. Selected: the accent
 * fill. Every chip row in the app used to draw all of its options at equal
 * weight — seven filled day chips with one selected, twenty status pills
 * on the Log — so the row shouted and the choice whispered. Now the row is
 * quiet and the choice is the only thing with ink.
 *
 * `suggested` is the in-between: the answer the app expects but the person
 * has not given yet — "On time" before it is tapped. A light accent tint,
 * so it reads as the default without claiming to be a record.
 */
type Props = {
  label: string;
  selected?: boolean;
  suggested?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Two-line chip: a small line above the label (the day strip's weekday). */
  above?: string;
  children?: ReactNode;
  testID?: string;
  /** Fills the row with its siblings. */
  grow?: boolean;
};

function ChipImpl({
  label,
  selected,
  suggested,
  onPress,
  disabled,
  accessibilityLabel,
  above,
  children,
  testID,
  grow,
}: Props) {
  const { palette } = useAppPalette();
  const bg = selected
    ? palette.accentSolid
    : suggested
    ? palette.accentBg
    : 'transparent';
  const fg = selected
    ? palette.onAccent
    : suggested
    ? palette.accentSolid
    : palette.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        grow && styles.grow,
        { backgroundColor: bg },
        pressed && !selected && { backgroundColor: palette.controlBg },
        disabled && styles.disabled,
      ]}>
      <View style={styles.inner}>
        {above ? (
          <Text style={[typeStyle('caption'), styles.above, { color: fg }]} numberOfLines={1}>
            {above}
          </Text>
        ) : null}
        <Text
          style={[typeStyle('headline'), styles.label, { color: fg }]}
          numberOfLines={1}>
          {label}
        </Text>
        {children}
      </View>
    </Pressable>
  );
}

export const Chip = memo(ChipImpl);

const styles = StyleSheet.create({
  chip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  inner: { alignItems: 'center' },
  above: { fontWeight: '600', marginBottom: 1 },
  label: { textAlign: 'center' },
  disabled: { opacity: 0.4 },
});
