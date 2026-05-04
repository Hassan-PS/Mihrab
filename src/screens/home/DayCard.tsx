import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { TITLE_BAND_MAX_FONT_SCALE } from '../../theme/textScale';
import { DISPLAY_ORDER } from '../../types/prayer';
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
};

function DayCardImpl({
  timings,
  cardWidth,
  dayLabel,
  dayDate,
  isToday,
  nextPrayerName,
}: DayCardProps) {
  const { palette } = useAppPalette();

  return (
    <View
      style={[
        styles.card,
        {
          width: cardWidth,
          backgroundColor: palette.card,
          borderRadius: HOME_TABLE_RADIUS,
          ...cardEdgeStyle(palette),
        },
      ]}>
      <View
        style={[
          styles.header,
          { borderBottomColor: palette.border ?? palette.muted },
        ]}>
        <Text
          style={[styles.title, { color: palette.text }]}
          maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
          {dayLabel}
        </Text>
        <Text
          style={[styles.date, { color: palette.muted }]}
          maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
          {dayDate}
        </Text>
      </View>

      {DISPLAY_ORDER.map((key, rowIndex) => {
        const raw = timings[key];
        if (!raw) return null;
        const isNext = isToday && nextPrayerName === key;
        const isSunrise = key === 'Sunrise';
        const isLast = rowIndex === DISPLAY_ORDER.length - 1;
        return (
          <PrayerRow
            key={key}
            prayerKey={key}
            rawTime={raw}
            isNext={isNext}
            isSunrise={isSunrise}
            isLast={isLast}
          />
        );
      })}
    </View>
  );
}

export const DayCard = memo(DayCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  date: { fontSize: 13, fontWeight: '400' },
});
