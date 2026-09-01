// hover-ok: compact chip inside the hero; the pressed opacity is the
// right affordance here, as on the other home chips.
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CompassIcon } from '../../components/HeaderToolbarIcons';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * The Qibla, in the corner of the hero.
 *
 * The compass screen has existed and worked this whole time — route
 * registered, deep link `qibla`, dial, announcer, the lot. What it lost
 * was its way in: the tile that opened it was removed with the quick
 * actions grid and nothing replaced it, so a working screen became
 * reachable only by typing a URL.
 *
 * A chip rather than another row: the bearing is a single number that
 * does not change unless the user moves, so it wants the smallest piece
 * of furniture that can carry a number and a tap target. Showing the
 * degrees on the chip itself is most of the feature — someone who already
 * knows which way is north never has to open anything.
 *
 * The degrees are TRUE north, the same frame `qiblaBearingFrom` computes
 * in and the same one both compass modules now report headings in.
 */
export type QiblaChipProps = {
  /** Degrees clockwise from true north, or null when there is no fix yet. */
  bearing: number | null;
  onPress: () => void;
};

function QiblaChipImpl({ bearing, onPress }: QiblaChipProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  // No coordinates, no bearing. A chip reading "0°" would be a wrong
  // answer rather than a missing one.
  if (bearing == null) return null;

  const degrees = Math.round(bearing) % 360;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.qiblaChipA11y', { degrees })}
      accessibilityHint={t('home.qiblaChipHint')}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: palette.card,
          borderColor: palette.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <CompassIcon color={String(palette.accent)} size={14} />
      <Text
        style={[typeStyle('caption'), styles.label, { color: palette.accent }]}
        numberOfLines={1}
        // A degree run is Latin left-to-right whatever the app language;
        // without this it collapses in Arabic, the same way the countdown
        // does.
        accessibilityLanguage="en-US">
        {`${degrees}°`}
      </Text>
    </Pressable>
  );
}

/** Wrapper that parks the chip in the hero's top-right corner. */
export function QiblaChipCorner(props: QiblaChipProps) {
  if (props.bearing == null) return null;
  return (
    <View style={styles.corner} pointerEvents="box-none">
      <QiblaChip {...props} />
    </View>
  );
}

export const QiblaChip = memo(QiblaChipImpl);

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    top: SPACING.sm,
    // `end` rather than `right`: the hero mirrors in RTL and the chip
    // should sit opposite the eyebrow, not always on the same side.
    end: SPACING.sm,
    zIndex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
