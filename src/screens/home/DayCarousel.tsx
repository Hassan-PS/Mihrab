import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { TimingsMap } from '../../types/prayer';
import { DayCard } from './DayCard';

const RTL_LOCALES = ['ar', 'ur', 'he', 'fa'];

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
  const { i18n } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  // RTL handling — task #143.
  //
  // The user reports the carousel lands on the LAST day instead of today
  // when the app language is Arabic. Two relevant facts:
  //
  // 1. Our app sets its own language via the in-app picker (i18n.language).
  //    The iOS SYSTEM locale stays English, so I18nManager.isRTL is FALSE
  //    even when i18n.language === 'ar'. We must drive the RTL flip from
  //    i18n.language, not from I18nManager.
  //
  // 2. Even though the parent layout stays LTR, the DayCard children
  //    contain Arabic text whose intrinsic writingDirection causes the
  //    paged ScrollView's snap target to land on the rightmost-but-last
  //    page on first paint. Forcing the initial scroll to the today edge
  //    keeps it pinned.
  //
  // We treat the locale-driven flag as the source of truth for both the
  // initial scroll and the visual→logical index inversion.
  const isRtl = RTL_LOCALES.includes((i18n.language || '').slice(0, 2));
  const todayScrollX = isRtl ? Math.max(0, (week.length - 1) * cardWidth) : 0;

  useEffect(() => {
    setActiveDayIndex(0);
    scrollRef.current?.scrollTo({ x: todayScrollX, animated: false });
  }, [resetKey, todayScrollX]);

  // Back-to-today handler — passed to every non-today DayCard so the
  // user can jump from any future day back to today's card with a
  // single tap (#129). Animated scroll so the carousel slide makes
  // the transition obvious.
  const onBackToToday = useCallback(() => {
    scrollRef.current?.scrollTo({ x: todayScrollX, animated: true });
    setActiveDayIndex(0);
  }, [todayScrollX]);

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
          const visualIndex = Math.round(
            e.nativeEvent.contentOffset.x / cardWidth,
          );
          // Map visual→logical index. Under RTL, the leftmost visual page
          // (visualIndex 0) is the last logical child.
          const logicalIndex = isRtl
            ? week.length - 1 - visualIndex
            : visualIndex;
          setActiveDayIndex(
            Math.max(0, Math.min(logicalIndex, week.length - 1)),
          );
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
            onBackToToday={dayIndex === 0 ? undefined : onBackToToday}
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
