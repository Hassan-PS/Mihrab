import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { rowDividerStyle } from '../../theme/chrome';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { HOME_ROW_PADDING_V } from './tokens';

/**
 * Single prayer row inside a day card.
 *
 * Memoized so DayCard re-renders don't cascade unless this row's specific
 * props changed (the `isNext` highlight is the only frequently-changing one).
 *
 * ── THE HIGHLIGHT MEANS "WHAT THE COUNTDOWN IS SHOWING" ───────────────
 *
 * It used to mean "next", which was the same thing until the countdown
 * could be pointed somewhere else. Now the emphasis follows the hero: pick
 * Isha in the morning and Isha is the row that lifts, because a highlight
 * that disagreed with the number above it would be worse than none.
 * `isChosen` adds the dot that says the choice was the user's.
 */
type PrayerRowProps = {
  prayerKey: string;
  rawTime: string;
  isNext: boolean;
  /** Picked by the user, rather than simply being the next one. */
  isChosen?: boolean;
  /** Absent for a row that cannot be aimed at — yesterday's, or passed. */
  onSelect?: () => void;
  /**
   * Non-salāh row (Sunrise, Islamic Midnight, Last Third) — rendered muted +
   * italic to read as a quieter, secondary entry beside the five daily prayers.
   */
  isSecondary: boolean;
  isLast: boolean;
  /**
   * When this prayer's preferred (ikhtiyārī) window closes — issue #19.
   *
   * Canonical `HH:mm`; the row formats it like every other clock. Absent
   * unless the user turned Mālikī second times on, and absent for a day
   * or a latitude where the sky does not produce the boundary.
   */
  daruriAt?: string;
  /**
   * True when that boundary is a model of something the eye judges — the
   * stars fading, the sun yellowing — rather than a solar position. The
   * row says "approx." for those, because printing all five in the same
   * confident type would claim more than the app knows.
   */
  daruriApprox?: boolean;
};

function PrayerRowImpl({
  prayerKey,
  rawTime,
  isNext,
  isChosen = false,
  onSelect,
  isSecondary,
  isLast,
  daruriAt,
  daruriApprox = false,
}: PrayerRowProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();

  const Row = onSelect ? Pressable : View;
  const interactive = onSelect
    ? {
        accessibilityRole: 'button' as const,
        accessibilityState: { selected: isChosen },
        accessibilityHint: isChosen
          ? t('a11y.countdownHere')
          : t('a11y.countdownTo'),
        onPress: onSelect,
      }
    : {};

  return (
    <Row
      {...interactive}
      style={[
        styles.row,
        !isLast && rowDividerStyle(palette),
        isNext && { backgroundColor: palette.accentBg },
      ]}>
      {isNext && (
        <View
          style={[styles.activeBar, { backgroundColor: palette.accent }]}
        />
      )}
      <View style={styles.nameWrap}>
        <Text
          style={[
            styles.name,
            {
              color: isSecondary && !isNext ? palette.muted : palette.text,
              fontStyle: isSecondary ? 'italic' : 'normal',
              fontWeight: isNext ? '600' : '500',
            },
          ]}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {t(`prayer.${prayerKey}`)}
        </Text>
        {/* Under the name rather than beside the time: the time column is
            the one thing on this screen that is scanned rather than read,
            and a second number in it would cost more than this line is
            worth. */}
        {daruriAt ? (
          <Text
            style={[styles.daruri, { color: palette.muted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t('prayer.firstTimeUntil', {
              defaultValue: 'First time until {{time}}',
              time: daruriApprox
                ? `${t('prayer.approx', { defaultValue: 'approx.' })} ${clock(
                    daruriAt,
                  )}`
                : clock(daruriAt),
            })}
          </Text>
        ) : null}
      </View>
      <View style={styles.timeWrap}>
        {/* Only for a row the user aimed at. The next prayer is already
            emphasised, and marking it too would say nothing. */}
        {isChosen ? (
          <View style={[styles.chosenDot, { backgroundColor: palette.accent }]} />
        ) : null}
        <Text
          style={[
            styles.time,
            tabularNumeralStyle,
            {
              color: isNext
                ? palette.accent
                : isSecondary
                ? palette.muted
                : palette.text,
              fontWeight: isNext ? '700' : '500',
            },
          ]}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {clock(rawTime)}
        </Text>
      </View>
    </Row>
  );
}

export const PrayerRow = memo(PrayerRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: HOME_ROW_PADDING_V,
    paddingHorizontal: 16,
    paddingStart: 20,
    position: 'relative',
  },
  nameWrap: {
    flexShrink: 1,
  },
  daruri: {
    fontSize: 11,
    marginTop: 2,
  },
  // Inset, rounded indicator pill instead of a full-bleed block — reads
  // as a quieter, more refined "current" marker against the tinted row.
  activeBar: {
    position: 'absolute',
    start: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopEndRadius: 3,
    borderBottomEndRadius: 3,
  },
  name: { fontSize: 17 },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chosenDot: { width: 6, height: 6, borderRadius: 3 },
  time: { fontSize: 17 },
});
