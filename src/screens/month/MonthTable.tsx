import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AppPalette } from '../../theme/appPalette';
import {
  DISPLAY_ORDER,
  OPTIONAL_TIME_KEYS,
  type DisplayPrayerKey,
} from '../../types/prayer';

/**
 * The five, and everything else.
 *
 * The table carries nine columns and only five of them are prayers.
 * Sunrise was already set apart; Islamic Midnight, the Last Third and the
 * First Third were not, so a month at a glance read as nine equal things
 * and the eye had to work out which five it came for. Same treatment as
 * the shared sheet: the five carry the weight, the derived times sit back.
 */
const isSalah = (key: string) =>
  !(OPTIONAL_TIME_KEYS as readonly string[]).includes(key);
import type { MonthDayEntry } from '../../prayer/loadMonthPrayerTimes';
import { useClockFormatter } from '../../hooks/useClockFormatter';
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

/**
 * How tall a row is once the Mālikī second times are on — issue #19.
 *
 * Three of the nine cells gain a second line (see `MonthRow`), so the
 * row grows for all of them. Exported because `MonthTimesScreen`'s
 * `getItemLayout` has to agree with the stylesheet or the list scrolls
 * to the wrong offsets.
 */
export const MONTH_ROW_HEIGHT_DARURI = 54;

export function monthRowHeight(showDaruri: boolean): number {
  return showDaruri ? MONTH_ROW_HEIGHT_DARURI : MONTH_ROW_HEIGHT;
}

/**
 * Which cells carry a second line, and which do not — issue #19.
 *
 * Only three of the five boundaries are new information here. Ẓuhr's
 * first time ends where ʿAṣr begins and Maghrib's where Ishāʾ does
 * (fn. 656, 659), and both of those are already columns of this table:
 * printing them again under Ẓuhr and Maghrib would be the same number
 * twice on one row, which is how a grid stops being read. The legend
 * under the table says so in words instead.
 */
const DARURI_CELL: Partial<Record<DisplayPrayerKey, string>> = {
  Fajr: 'FajrDaruri',
  Asr: 'AsrDaruri',
  Isha: 'IshaDaruri',
};
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
        const salah = isSalah(key);
        return (
          <Text
            key={key}
            style={[
              salah ? styles.colHeaderTime : styles.colHeaderTimeQuiet,
              { color: salah ? palette.accent : palette.muted },
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
  /** Draw the Mālikī first-time ends under Fajr, ʿAṣr and Ishāʾ. */
  showDaruri?: boolean;
};

function MonthRowImpl({
  item,
  palette,
  isCurrentMonth,
  todayDay,
  showDaruri = false,
}: RowProps) {
  const clock = useClockFormatter();
  const d = item.date;
  const isToday = isCurrentMonth && d.getDate() === todayDay;
  const isFriday = d.getDay() === 5;
  const dayLabel = `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`;

  return (
    <View
      style={[
        styles.row,
        { height: monthRowHeight(showDaruri) },
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
        const timeStr = raw ? clock(raw) : '—';
        const salah = isSalah(key);
        const daruriKey = showDaruri ? DARURI_CELL[key] : undefined;
        const daruriRaw = daruriKey ? item.timings[daruriKey] : undefined;
        const cell = (
          <Text
            style={[
              salah ? styles.cellTimeSalah : styles.cellTime,
              {
                color: isToday
                  ? palette.accent
                  : salah
                    ? palette.text
                    : palette.muted,
                fontStyle: salah ? 'normal' : 'italic',
                fontWeight: isToday ? '700' : salah ? '600' : '400',
              },
              // The stacked cells lay the two lines out themselves.
              showDaruri && styles.cellStacked,
            ]}>
            {timeStr}
          </Text>
        );
        if (!showDaruri) return <React.Fragment key={key}>{cell}</React.Fragment>;
        return (
          <View key={key} style={styles.cellWrap}>
            {cell}
            {/* An empty line rather than none on the cells that have no
                boundary today, so the nine columns keep one baseline
                across the row. A blank is also the honest answer where
                the sky produced nothing (`daruriTimes.ts`). */}
            <Text
              style={[styles.cellDaruri, { color: palette.muted }]}
              numberOfLines={1}>
              {daruriKey ? (daruriRaw ? clock(daruriRaw) : '·') : ''}
            </Text>
          </View>
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
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  colHeaderTimeQuiet: {
    ...typeStyle('caption'),
    flex: COL_TIME,
    fontWeight: '500',
    textTransform: 'uppercase',
    textAlign: 'center',
    opacity: 0.85,
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
    opacity: 0.75,
  },
  cellTimeSalah: {
    ...typeStyle('caption'),
    flex: COL_TIME,
    textAlign: 'center',
  },
  // Inside a stacked cell the flex belongs to the wrapper, not the text.
  cellWrap: {
    flex: COL_TIME,
    alignItems: 'center',
  },
  cellStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  cellDaruri: {
    ...typeStyle('caption'),
    // Smaller than the time above it on purpose: it is the deadline for
    // that prayer, not a second prayer, and at the same size the row
    // reads as eighteen times rather than nine and their ends.
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
    opacity: 0.7,
    marginTop: 1,
  },
});
