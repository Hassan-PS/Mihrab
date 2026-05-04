import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AppPalette } from '../../theme/appPalette';
import { DISPLAY_ORDER, type DisplayPrayerKey } from '../../types/prayer';
import type { MonthDayEntry } from '../../prayer/loadMonthPrayerTimes';
import { formatDisplayTime } from '../../utils/prayerTimes';
import { SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Row + column-header presentational components for MonthTimesScreen —
 * task #64 split. Keeps MonthTimesScreen lean by shipping the table
 * cell logic out of the orchestrator.
 *
 * Friday rows get a card-tinted background; today's row uses the accent
 * background + a thin start-edge bar. Sunrise cells render in italic /
 * muted to keep them visually de-emphasised relative to the salāh.
 */

const COL_DAY = 1.4;
const COL_TIME = 1.0;
export const MONTH_ROW_HEIGHT = 40;
const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type ColumnHeaderProps = {
  palette: AppPalette;
  /** Localised, abbreviated prayer names — same length as DISPLAY_ORDER. */
  colHeaders: string[];
  /** Localised "Day" label used for the first column. */
  dayLabel: string;
};

function MonthColumnHeaderImpl({
  palette,
  colHeaders,
  dayLabel,
}: ColumnHeaderProps) {
  return (
    <View
      style={[
        styles.colHeader,
        { backgroundColor: palette.card, borderBottomColor: palette.accent },
      ]}>
      <Text style={[styles.colHeaderDay, { color: palette.muted }]}>
        {dayLabel}
      </Text>
      {DISPLAY_ORDER.map((key, idx) => {
        const isSunrise = key === 'Sunrise';
        return (
          <Text
            key={key}
            style={[
              styles.colHeaderTime,
              { color: isSunrise ? palette.muted : palette.accent },
            ]}>
            {colHeaders[idx]}
          </Text>
        );
      })}
    </View>
  );
}

export const MonthColumnHeader = memo(MonthColumnHeaderImpl);

type RowProps = {
  item: MonthDayEntry;
  palette: AppPalette;
  isCurrentMonth: boolean;
  todayDay: number;
};

function MonthRowImpl({ item, palette, isCurrentMonth, todayDay }: RowProps) {
  const d = item.date;
  const isToday = isCurrentMonth && d.getDate() === todayDay;
  const isFriday = d.getDay() === 5;
  const dayLabel = `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`;

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: palette.border },
        isToday && { backgroundColor: palette.accentBg },
        isFriday && !isToday && { backgroundColor: palette.card },
      ]}>
      {isToday && (
        <View
          style={[styles.todayBar, { backgroundColor: palette.accent }]}
        />
      )}
      <Text
        style={[
          styles.cellDay,
          {
            color: isToday
              ? palette.accent
              : isFriday
                ? palette.text
                : palette.muted,
            fontWeight: isFriday || isToday ? '700' : '400',
          },
        ]}>
        {dayLabel}
      </Text>
      {DISPLAY_ORDER.map((key: DisplayPrayerKey) => {
        const raw = item.timings[key];
        const timeStr = raw ? formatDisplayTime(raw) : '—';
        const isSunrise = key === 'Sunrise';
        return (
          <Text
            key={key}
            style={[
              styles.cellTime,
              {
                color: isToday
                  ? palette.accent
                  : isSunrise
                    ? palette.muted
                    : palette.text,
                fontStyle: isSunrise ? 'italic' : 'normal',
                fontWeight: isToday ? '600' : '400',
              },
            ]}>
            {timeStr}
          </Text>
        );
      })}
    </View>
  );
}

export const MonthRow = memo(MonthRowImpl);

const styles = StyleSheet.create({
  colHeader: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2, // tokens-ok-line: 6px sub-row tightener
    borderBottomWidth: 1.5,
  },
  colHeaderDay: {
    ...typeStyle('caption'),
    flex: COL_DAY,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  colHeaderTime: {
    ...typeStyle('caption'),
    flex: COL_TIME,
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: MONTH_ROW_HEIGHT,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  todayBar: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    width: 3, // hairline accent bar — intentionally raw, not token-shaped
  },
  cellDay: {
    ...typeStyle('footnote'),
    flex: COL_DAY,
    paddingStart: SPACING.xs,
  },
  cellTime: {
    ...typeStyle('caption'),
    flex: COL_TIME,
    textAlign: 'center',
  },
});
