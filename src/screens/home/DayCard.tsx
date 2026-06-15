import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import { TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS } from '../../types/prayer';
import type { TimingsMap } from '../../types/prayer';
import { PrayerRow } from './PrayerRow';
import { HOME_TABLE_RADIUS } from './tokens';

/**
 * Single day card (header + prayer rows). One instance per day in the carousel.
 *
 * Memoized so the carousel re-render only re-renders the cards whose props
 * changed (typically just the active card when `isNextActiveDay` flips).
 */
type DayCardProps = {
  timings: TimingsMap;
  cardWidth: number;
  dayLabel: string;
  dayDate: string;
  /**
   * True for `dayIndex === 0`. The "next prayer" highlight is only ever drawn
   * on today's card; tomorrow's Fajr is shown plainly even when it IS the
   * upcoming prayer (after Isha).
   */
  isToday: boolean;
  /** Name of the next prayer, or null if there is none today. Used to draw the highlight. */
  nextPrayerName: string | null;
  /**
   * Tap handler that returns the carousel to today's card — task #129.
   * Only rendered (and visible) when `isToday` is false; on the today
   * card the chip is hidden so it doesn't compete with the date.
   */
  onBackToToday?: () => void;
};

function DayCardImpl({
  timings,
  cardWidth,
  dayLabel,
  dayDate,
  isToday,
  nextPrayerName,
  onBackToToday,
}: DayCardProps) {
  const { palette } = useAppPalette();
  const { t } = useTranslation();

  return (
    <GlassSurface
      style={[
        styles.card,
        {
          width: cardWidth,
          borderRadius: HOME_TABLE_RADIUS,
          ...cardEdgeStyle(palette),
        },
      ]}>
      <View
        style={[
          styles.header,
          { borderBottomColor: palette.border ?? palette.muted },
        ]}>
        <View style={styles.headerLeft}>
          <Text
            style={[styles.title, { color: palette.text }]}
            maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
            {dayLabel}
          </Text>
          {!isToday && onBackToToday ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.backToToday', 'Back to today')}
              onPress={onBackToToday}
              hitSlop={8}
              style={[
                styles.backChip,
                {
                  backgroundColor: palette.accentBg,
                  borderColor: palette.accent,
                },
              ]}>
              <Text style={[styles.backChipLabel, { color: palette.accent }]}>
                {t('home.backToToday', 'Back to today')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text
          style={[styles.date, { color: palette.muted }]}
          maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
          {dayDate}
        </Text>
      </View>

      {(() => {
        // Only the rows actually present in `timings` are rendered — the two
        // night times and Sunrise are filtered out upstream when their toggle
        // is off, so `isLast` (which drops the divider) must track the visible
        // set, not the fixed DISPLAY_ORDER length.
        const visible = DISPLAY_ORDER.filter(key => timings[key]);
        return visible.map((key, rowIndex) => (
          <PrayerRow
            key={key}
            prayerKey={key}
            rawTime={timings[key]}
            isNext={isToday && nextPrayerName === key}
            isSecondary={(OPTIONAL_TIME_KEYS as readonly string[]).includes(key)}
            isLast={rowIndex === visible.length - 1}
          />
        ));
      })()}
    </GlassSurface>
  );
}

export const DayCard = memo(DayCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  title: { fontSize: 16, fontWeight: '700' },
  date: { fontSize: 13, fontWeight: '400' },
  backChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  backChipLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
