import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { TimingsMap } from '../../types/prayer';
import { DayCard } from './DayCard';

/**
 * Horizontal scroll over a week of day cards, with paged snapping and dot
 * indicators. Owns its own `activeDayIndex` and `scrollRef` — these are
 * carousel-internal state and don't need to live on the parent.
 *
 * `resetKey` triggers a scroll-to-day-0 when changed (e.g., when the user
 * moves locations and the week's data is refreshed).
 */
type DayCarouselProps = {
  week: TimingsMap[];
  cardWidth: number;
  /** Whether each day is "today" — only true for index 0; passed for clarity. */
  nextPrayerName: string | null;
  resetKey: string;
  /** Day-label generator (e.g., "Today", "Tomorrow", weekday name). */
  getDayLabel: (dayOffset: number) => string;
  /** Day-date generator (e.g., "30 Apr"). */
  getDayDate: (dayOffset: number) => string;
};

function DayCarouselImpl({
  week,
  cardWidth,
  nextPrayerName,
  resetKey,
  getDayLabel,
  getDayDate,
}: DayCarouselProps) {
  const { palette } = useAppPalette();
  const scrollRef = useRef<ScrollView>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  useEffect(() => {
    setActiveDayIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [resetKey]);

  return (
    <>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        accessibilityRole="tablist"
        onMomentumScrollEnd={e => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
          setActiveDayIndex(Math.max(0, Math.min(newIndex, week.length - 1)));
        }}>
        {week.map((timings, dayIndex) => (
          <DayCard
            key={dayIndex}
            timings={timings}
            cardWidth={cardWidth}
            dayLabel={getDayLabel(dayIndex)}
            dayDate={getDayDate(dayIndex)}
            isToday={dayIndex === 0}
            nextPrayerName={nextPrayerName}
          />
        ))}
      </ScrollView>

      {week.length > 1 && (
        <View style={styles.dotRow} accessibilityElementsHidden>
          {week.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: palette.muted,
                  opacity: i === activeDayIndex ? 0.9 : 0.25,
                  width: i === activeDayIndex ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      )}
    </>
  );
}

export const DayCarousel = memo(DayCarouselImpl);

const styles = StyleSheet.create({
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: -4,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
