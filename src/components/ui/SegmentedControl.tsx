import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * SegmentedControl — one container, several segments, one selected
 * (docs/design/redesign-plan.md §2.7).
 *
 * Replaces the three-outlined-buttons pattern (Appearance's Theme and
 * Time format rows) and the hand-rolled segment on the Quran tab. The
 * container is the control's recessed track; the selected segment is
 * filled with the light accent and its label takes the accent; the rest
 * are plain. Equal widths, because a segmented control is a choice
 * between peers.
 */
export type Segment<K extends string> = { key: K; label: string; accessibilityLabel?: string };

type Props<K extends string> = {
  segments: ReadonlyArray<Segment<K>>;
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
  testID?: string;
};

function SegmentedControlImpl<K extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: Props<K>) {
  const { palette } = useAppPalette();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.track, { backgroundColor: palette.controlBg }]}>
      {segments.map(seg => {
        const selected = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={seg.accessibilityLabel ?? seg.label}
            onPress={() => onChange(seg.key)}
            style={[
              styles.segment,
              selected && { backgroundColor: palette.accentBg },
            ]}>
            <Text
              style={[
                typeStyle('headline'),
                styles.label,
                { color: selected ? palette.accentSolid : palette.muted },
              ]}
              numberOfLines={1}>
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const SegmentedControl = memo(SegmentedControlImpl) as typeof SegmentedControlImpl;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: RADIUS.md - 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  label: { textAlign: 'center' },
});
