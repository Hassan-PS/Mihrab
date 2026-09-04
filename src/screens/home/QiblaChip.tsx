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
 * degrees on the chip itself is most of the feature — someone who
 * already knows which way is north never has to open anything.
 *
 * ── WHY `onPress` IS OPTIONAL ─────────────────────────────────────────
 *
 * On a Mac there is no magnetometer, so there is no compass screen to
 * open — but the BEARING is not a device measurement, it is spherical
 * trigonometry on two coordinates, and it is just as true on a desktop
 * as on a phone. So the chip stays there and stops being a button: a
 * readout rather than a door to a room that does not exist.
 *
 * The degrees are TRUE north, the same frame `qiblaBearingFrom` computes
 * in and the same one both compass modules report headings in.
 */
export type QiblaChipProps = {
  /** Degrees clockwise from true north, or null when there is no fix yet. */
  bearing: number | null;
  /** Omitted where there is no compass screen to open — see above. */
  onPress?: () => void;
};

function QiblaChipImpl({ bearing, onPress }: QiblaChipProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  // No coordinates, no bearing. A chip reading "0°" would be a wrong
  // answer rather than a missing one.
  if (bearing == null) return null;

  const degrees = Math.round(bearing) % 360;
  const label = t('home.qiblaChipA11y', { degrees });

  const face = (
    <>
      <CompassIcon color={palette.accentSolid} size={14} />
      {/* THE WORD, then the number.

          A compass rose and "116°" is a puzzle: the icon is small, the
          number could be a temperature, and nothing on the chip says what
          it is a bearing TO. Screen readers were told — `qiblaChipA11y`
          has always read "Qibla 116 degrees" — and everyone looking at it
          had to already know.

          `nav.compass` rather than a new string: it is already "Qibla" in
          all thirteen languages, which makes it the word this app has
          settled on for the thing this chip opens. */}
      <Text
        style={[typeStyle('caption'), styles.label, { color: palette.accent }]}
        numberOfLines={1}>
        {t('nav.compass', 'Qibla')}
      </Text>
      <Text
        style={[typeStyle('caption'), styles.degrees, { color: palette.accent }]}
        numberOfLines={1}
        // A degree run is Latin left-to-right whatever the app language;
        // without this it collapses in Arabic, the same way the countdown
        // does.
        accessibilityLanguage="en-US">
        {`${degrees}°`}
      </Text>
    </>
  );

  const skin = {
    backgroundColor: palette.card,
    borderColor: palette.border,
  };

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        style={[styles.chip, skin]}>
        {face}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('home.qiblaChipHint')}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.chip,
        skin,
        pressed && styles.pressed,
      ]}>
      {face}
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
  pressed: { opacity: 0.75 },
  label: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  /** The bearing, a shade lighter than the word so the word leads. */
  degrees: {
    fontWeight: '600',
    letterSpacing: 0.2,
    opacity: 0.85,
  },
});
