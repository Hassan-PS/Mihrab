import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Stepper — `‹  Title  ›` with a line under the title
 * (docs/design/redesign-plan.md §2.6).
 *
 * Month and the Log's day view both step through time and drew it
 * differently — one with small bare chevrons, the other with arrows in
 * faint circles. One control, so a person moving between the two screens
 * is looking at the same thing. The chevrons are text and flip with the
 * writing direction; `onNext` may be absent (there is no tomorrow to log
 * yet), and then its side is drawn but disabled, so the title stays
 * centred.
 */
type Props = {
  title: string;
  subtitle?: string;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel: string;
  nextLabel: string;
  testID?: string;
};

function StepperImpl({ title, subtitle, onPrev, onNext, prevLabel, nextLabel, testID }: Props) {
  const { palette } = useAppPalette();
  const arrow = (dir: 'prev' | 'next') => {
    const onPress = dir === 'prev' ? onPrev : onNext;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dir === 'prev' ? prevLabel : nextLabel}
        accessibilityState={{ disabled: !onPress }}
        disabled={!onPress}
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.arrow,
          pressed && { backgroundColor: palette.controlBg },
          !onPress && styles.arrowDisabled,
        ]}>
        <Text style={[styles.arrowGlyph, { color: palette.accentSolid }]}>
          {dir === 'prev' ? '‹' : '›'}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.row} testID={testID}>
      {arrow('prev')}
      <View style={styles.middle}>
        <Text
          style={[typeStyle('title3'), styles.title, { color: palette.text }]}
          numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[typeStyle('footnote'), styles.subtitle, { color: palette.muted }]}
            numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {arrow('next')}
    </View>
  );
}

export const Stepper = memo(StepperImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  middle: { flex: 1, alignItems: 'center', minWidth: 0 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 1 },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.3 },
  arrowGlyph: { fontSize: 28, lineHeight: 32, fontWeight: '600' },
});
