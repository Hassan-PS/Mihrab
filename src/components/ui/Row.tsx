import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { TYPE, typeStyle } from '../../theme/typography';
import { ROW_PADDING } from './Group';
import { SPACING } from '../../theme/tokens';

/**
 * Row — title, optional subtitle, optional trailing, inside a Group or bare
 * on the page (docs/design/redesign-plan.md §2.5).
 *
 * The trailing slot takes whatever the caller hands it — a value, a
 * switch, a count. With an `onPress` and nothing trailing, a chevron. The
 * chevron is text so it flips with the writing direction for free.
 */
type Props = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  /** A plain value on the right, muted. Convenience for the common case. */
  value?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Dims the row: a future prayer, an option not yet available. */
  quiet?: boolean;
  /** An action row: the title takes the accent, or the danger colour for
   *  the one destructive action in a group. */
  tone?: 'accent' | 'danger';
  testID?: string;
};

function RowImpl({
  title,
  subtitle,
  trailing,
  value,
  onPress,
  accessibilityLabel,
  quiet,
  tone,
  testID,
}: Props) {
  const { palette } = useAppPalette();
  const titleColor =
    tone === 'accent' ? palette.accent : tone === 'danger' ? palette.danger : palette.text;
  const body = (
    <>
      <View style={styles.text}>
        <Text
          style={[typeStyle('headline'), { color: titleColor }]}
          numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[typeStyle('footnote'), styles.subtitle, { color: palette.muted }]}
            numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[typeStyle('body'), { color: palette.muted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !trailing ? (
        <Text style={[styles.chevron, { color: tone ? titleColor : palette.muted }]}>
          {tone ? '→' : '›'}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        style={[styles.row, quiet && styles.quiet]}
        accessibilityLabel={accessibilityLabel}
        testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        quiet && styles.quiet,
        pressed && { backgroundColor: palette.controlBg },
      ]}>
      {body}
    </Pressable>
  );
}

export const Row = memo(RowImpl);

const styles = StyleSheet.create({
  row: {
    ...ROW_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  text: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 2 },
  chevron: { fontSize: TYPE.title2.fontSize, lineHeight: 24, marginStart: -4 },
  quiet: { opacity: 0.55 },
});
