/**
 * Every week you have ever logged, two facts per square (design review 2c).
 *
 * Prayers and fasting are the same act — recording what you did today — and
 * they were split across two screens with two visual languages. One graph
 * carries both: FILL DEPTH is prayers logged (0→5), an INSET RING is the
 * fast. They never collide because they use different channels, so either
 * can be read alone or both at once; a second grid would have doubled the
 * screen for half the insight.
 *
 * The ring rather than another colour step, because fasting is not "more
 * prayer" — it is a different axis, and it cannot be another rung on the
 * green ramp. An outline reads as a distinct category, and the two amber
 * days a week (Mondays and Thursdays) show up as a rhythm rather than noise.
 *
 * Rows are weekdays, so a habit that fails on Fridays — or a Ramadan block —
 * reads as a shape.
 *
 * IT SCROLLS, and it reaches the first day you ever logged. It used to be
 * thirteen fixed weeks, defended on the grounds that "a hard month scrolls
 * out of view rather than standing as a monument". That reasoning protected
 * the user from their own record and took the record with it: a year in,
 * every square earned before April was simply gone, with no way back to it.
 * Ownership of the data wins — you can always look away from a graph, but
 * you cannot look at one that was never drawn. The grid now runs from the
 * Monday of the earliest entry to this week, and opens parked on today, so
 * the default view is still the recent one.
 *
 * An empty square is warm paper, never grey: the GitHub reading of
 * "empty = failure" is not a judgement this app should make about a
 * religious practice.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import type { DayScore } from '../journal/journal';
import { dayKey } from './practiceStore';

/**
 * The SHORTEST the graph is ever drawn. Thirteen ≈ a quarter and fits the
 * narrowest phone without scrolling, so a new user with three days of
 * history still sees a graph rather than a stub. Past that it grows.
 */
export const HEATMAP_WEEKS = 13;
const SQUARE = 15;
const GAP = 4;
/** One week column, including the gap that follows it. */
const COL = SQUARE + GAP;
/** Height of the month-label strip above the grid. */
const MONTH_ROW = 15;
/** Amber, for the fast ring — the app's own amber accent swatch. */
const FAST_RING_LIGHT = '#B45309';
const FAST_RING_DARK = '#FBBF24';

export type HeatmapDay = {
  key: string;
  /** 0…5, weighted by status — see `STATUS_WEIGHT`. Drives the fill depth. */
  kept: number;
  /** How many of the five carry any entry, whatever it says. */
  logged: number;
  fasted: boolean;
  /** Days after today inside the trailing week — drawn as blanks. */
  future: boolean;
};

/** Noon-anchored, so adding days never lands on a DST hour that doesn't exist. */
function atNoon(d: Date): Date {
  const out = new Date(d);
  out.setHours(12, 0, 0, 0);
  return out;
}

/** The Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const out = atNoon(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How many week columns are needed to reach back to `earliest`.
 *
 * Never fewer than `HEATMAP_WEEKS`, so the graph keeps its shape on a fresh
 * install. A key that cannot be parsed — or one in the future, which no
 * honest log has — falls back to the minimum rather than producing a grid of
 * unknown size.
 */
export function weeksToCover(
  earliest: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!earliest) return HEATMAP_WEEKS;
  const first = parseDayKey(earliest);
  if (!first) return HEATMAP_WEEKS;
  const from = mondayOf(first);
  const to = mondayOf(now);
  const weeks =
    Math.round((to.getTime() - from.getTime()) / (7 * 86400000)) + 1;
  return Math.max(HEATMAP_WEEKS, weeks);
}

/**
 * `weeks` weeks ending with the week that contains today, as weekday rows.
 * Weeks start on Monday so the two sunnah fast days sit in the first and
 * fourth rows rather than being split across a boundary.
 */
export function buildHeatmap(
  scoreByDay: Map<string, DayScore>,
  fastedDays: Set<string>,
  now: Date = new Date(),
  weeks: number = HEATMAP_WEEKS,
): HeatmapDay[][] {
  const today = atNoon(now);
  const span = Math.max(1, Math.floor(weeks));
  const start = mondayOf(today);
  start.setDate(start.getDate() - (span - 1) * 7);

  const rows: HeatmapDay[][] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const row: HeatmapDay[] = [];
    for (let week = 0; week < span; week++) {
      const d = new Date(start);
      d.setDate(start.getDate() + week * 7 + weekday);
      const key = dayKey(d);
      const score = scoreByDay.get(key);
      row.push({
        key,
        kept: score?.kept ?? 0,
        logged: score?.logged ?? 0,
        fasted: fastedDays.has(key),
        future: d.getTime() > today.getTime(),
      });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * One label per week column, blank unless the column opens a new month.
 *
 * Without these, scrolling two years back is a featureless field of squares
 * — you can reach the past but you cannot tell where you have landed.
 */
export function monthLabelsFor(rows: HeatmapDay[][], locale: string): string[] {
  const mondays = rows[0] ?? [];
  let previous = -1;
  return mondays.map((cell, i) => {
    const d = parseDayKey(cell.key);
    if (!d) return '';
    const month = d.getMonth();
    if (month === previous) return '';
    previous = month;
    // The first column usually sits mid-month; labelling it would put a name
    // over a week that mostly belongs to the month before.
    if (i === 0) return '';
    const name = d.toLocaleDateString(locale, { month: 'short' });
    // January carries the year, so scrolling back years stays legible.
    return month === 0 ? `${name} ${d.getFullYear()}` : name;
  });
}

/** Hex with an alpha suffix — the green ramp is one colour at five depths. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}

type Props = {
  rows: HeatmapDay[][];
  /** Weekday initials, already localised, Monday first. */
  weekdayLabels: string[];
  caption?: string;
  /** The day the Log is currently showing, drawn lifted out of the grid. */
  selectedKey?: string;
  /** Tapping a square opens that day. Omit to keep the graph read-only. */
  onSelectDay?: (key: string) => void;
  /**
   * The view has reached the oldest column drawn. The owner answers by
   * handing back more weeks; the graph keeps the dates under the viewport
   * where they were, so the user carries on dragging into the new ones.
   */
  onReachOldest?: () => void;
  /** Hides the legend and the caption, for the small copy on Home. */
  compact?: boolean;
};

function PracticeHeatmapImpl({
  rows,
  weekdayLabels,
  caption,
  selectedKey,
  onSelectDay,
  onReachOldest,
  compact,
}: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const ring = palette.isDark ? FAST_RING_DARK : FAST_RING_LIGHT;
  const accent = palette.accentSolid;

  const legend = useMemo(() => [0, 1, 3, 5], []);

  /**
   * What a square is filled with.
   *
   *   nothing recorded  → warm paper, as before
   *   recorded, none kept → the danger tone at a low alpha
   *   otherwise → the green ramp, by WEIGHTED score
   *
   * The middle case is the whole point of the change. Depth used to come
   * from the number of entries, so five prayers marked missed drew the
   * darkest green on the graph — the app congratulating someone for a day
   * they had just told it went badly. A missed day is not blank either:
   * the user did the work of recording it, and blanking it would lose the
   * difference between a day that went wrong and a day nobody opened the
   * app on. It is a mark, in a colour that is not the colour of success.
   */
  const fillFor = (day: HeatmapDay) => {
    if (day.future) return 'transparent';
    if (day.kept > 0) return withAlpha(accent, 0.2 + 0.8 * (day.kept / 5));
    if (day.logged > 0) return withAlpha(String(palette.danger), 0.3);
    return palette.controlBg;
  };
  const weeks = rows[0]?.length ?? 0;
  const months = useMemo(
    () => monthLabelsFor(rows, i18n.language),
    [rows, i18n.language],
  );

  /**
   * Open on today, not on the oldest week.
   *
   * Keyed on the column count rather than run on every content-size change:
   * the grid re-measures whenever a square is tapped or a status changes, and
   * yanking the view back to today each time would make scrolling back
   * impossible — you would be dragged to the present the moment you logged
   * anything.
   */
  const scrollRef = useRef<ScrollView>(null);
  const parked = useRef(false);
  const drawnWeeks = useRef(0);
  const offset = useRef(0);
  const asking = useRef(false);

  const onSized = () => {
    if (weeks === 0) return;
    if (!parked.current) {
      parked.current = true;
      drawnWeeks.current = weeks;
      scrollRef.current?.scrollToEnd({ animated: false });
      return;
    }
    if (weeks === drawnWeeks.current) return;
    const added = weeks - drawnWeeks.current;
    drawnWeeks.current = weeks;
    if (added > 0 && asking.current) {
      /**
       * Columns were added at the OLD end, which is the left, BECAUSE THE
       * USER DRAGGED THERE. Left-hand growth pushes everything they were
       * looking at to the right by exactly that many columns, so without
       * this the view lurches forwards in time the moment it loads more of
       * the past — the one thing they were dragging away from. Push the
       * offset by the same amount and the dates under the thumb hold still.
       */
      scrollRef.current?.scrollTo({
        x: offset.current + added * COL,
        animated: false,
      });
      asking.current = false;
      return;
    }
    /**
     * The grid changed size for a reason that was NOT a load-more: the
     * encrypted journal finished hydrating and the history turned out to be
     * longer than the thirteen-week default, or a day was logged outside
     * the drawn span.
     *
     * This used to take the branch above and shove the view sideways by the
     * difference. Hydration lands a beat after the screen appears — which
     * is exactly when the user's first drag arrives — so the first attempt
     * to scroll got yanked out from under the thumb, felt like lag, and
     * often ended somewhere the user did not ask for. Re-park instead:
     * nobody has scrolled anywhere yet, so today is still the right place
     * to be.
     */
    scrollRef.current?.scrollToEnd({ animated: false });
  };
  useEffect(() => {
    if (parked.current) return;
    onSized();
    // Cold mount: the content has no width yet when the effect first runs,
    // so `onContentSizeChange` is the path that usually wins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  return (
    <View>
      <View style={styles.grid}>
        <View style={styles.labels}>
          {/* Clears the month strip, so weekday initials line up with rows. */}
          <View style={styles.monthSpacer} />
          {weekdayLabels.map((label, i) => (
            <View key={i} style={styles.labelCell}>
              {/* Every other row, so the column stays quiet. */}
              {i % 2 === 0 ? (
                <Text
                  style={[styles.labelText, { color: palette.muted }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
                >
                  {label}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={onSized}
          scrollEventThrottle={64}
          // Diagonal drags belong to the page, not to the graph. Without
          // this a mostly-vertical swipe that starts on the grid drags the
          // weeks a few pixels sideways and stutters the page scroll, which
          // is most of what "the first attempt is laggy" was.
          directionalLockEnabled
          // Android: let this scroll inside the page's scroll rather than
          // making the parent fight it for every gesture.
          nestedScrollEnabled
          onScroll={e => {
            offset.current = e.nativeEvent.contentOffset.x;
            // Nothing is asked for until the initial park has happened. The
            // offset before that is 0, which looks exactly like "the user
            // has dragged to the oldest week" and used to fire a load-more
            // during mount — twenty-six more columns arriving underneath
            // the first drag.
            if (!parked.current) return;
            // Two columns of slack, so the request goes out while there is
            // still something under the thumb to drag.
            if (offset.current > COL * 2 || !onReachOldest) {
              return;
            }
            if (asking.current) return;
            asking.current = true;
            onReachOldest();
          }}
          contentContainerStyle={styles.scrollBody}
        >
          <View>
            <View style={styles.monthRow}>
              {months.map((label, i) => (
                <View key={i} style={styles.monthCell}>
                  {label ? (
                    <Text
                      style={[styles.monthText, { color: palette.muted }]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={styles.weeks}>
              {rows.map((row, r) => (
                <View key={r} style={styles.week}>
                  {row.map(day => {
                    const selected = !day.future && day.key === selectedKey;
                    return (
                      <Pressable
                        key={day.key}
                        // The day itself, so a square can be addressed by
                        // date from a test or a maestro flow — otherwise the
                        // only handle on a cell is its position in a grid
                        // whose size now depends on the user's own history.
                        testID={day.key}
                        disabled={day.future || !onSelectDay}
                        onPress={() => onSelectDay?.(day.key)}
                        accessibilityRole={onSelectDay ? 'button' : 'image'}
                        accessibilityState={{ selected }}
                        accessibilityLabel={t('log.dayA11y', {
                          defaultValue:
                            '{{date}}: {{prayers}} prayers logged{{fast}}',
                          date: day.key,
                          prayers: day.logged,
                          fast: day.fasted
                            ? `, ${t('log.fasted', 'fasted')}`
                            : '',
                        })}
                        style={[
                          styles.square,
                          { backgroundColor: fillFor(day) },
                          // Selection lifts the square AND outlines it in
                          // the text colour. The lift alone was invisible on
                          // an empty day, which is most of them and exactly
                          // the ones you open in order to fill in.
                          selected && styles.squareSelected,
                          selected && {
                            borderWidth: 2,
                            borderColor: palette.text,
                          },
                          // Amber last, so it wins the outline on a day that
                          // is both selected and fasted: the ring carries
                          // data, the lift only carries where you are.
                          day.fasted && {
                            borderWidth: 2,
                            borderColor: ring,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {compact ? null : (
        <>
          <View style={styles.legendRow}>
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('log.legendPrayers', '0 → 5 prayers')}
            </Text>
            <View style={styles.legendSquares}>
              {legend.map(n => (
                <View
                  key={n}
                  style={[
                    styles.legendSquare,
                    {
                      backgroundColor:
                        n > 0
                          ? withAlpha(accent, 0.2 + 0.8 * (n / 5))
                          : palette.controlBg,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
          {/* The two categorical marks get their own line. Squeezed onto the
              ramp's row they read as another rung of it, which is the exact
              confusion the ramp change was made to end. */}
          <View style={styles.legendRow}>
            <View
              style={[
                styles.legendSquare,
                { backgroundColor: withAlpha(String(palette.danger), 0.3) },
              ]}
            />
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('journal.status.missed')}
            </Text>
            <View
              style={[
                styles.legendSquare,
                {
                  borderWidth: 2,
                  borderColor: ring,
                  backgroundColor: 'transparent',
                },
              ]}
            />
            <Text
              style={[styles.legendText, { color: palette.muted }]}
              numberOfLines={1}
            >
              {t('log.fasted', 'fasted')}
            </Text>
          </View>
        </>
      )}

      {caption && !compact ? (
        <Text
          style={[styles.caption, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export const PracticeHeatmap = memo(PracticeHeatmapImpl);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 6 },
  labels: { gap: GAP },
  labelCell: { height: SQUARE, justifyContent: 'center' },
  labelText: { fontSize: 9, fontWeight: '600' },
  monthSpacer: { height: MONTH_ROW },
  // `gap` deliberately absent: each cell is exactly one column wide, so the
  // strip and the grid below it stay in step by construction.
  monthRow: { flexDirection: 'row', height: MONTH_ROW },
  monthCell: { width: COL, justifyContent: 'flex-end' },
  // Wider than the column it sits in, so a three-letter month name is not
  // clipped to one. Overflow is harmless: the next label is a month away.
  monthText: { fontSize: 9, fontWeight: '600', width: COL * 3 },
  // `paddingEnd`, not `paddingRight`: in Arabic and Urdu the grid runs the
  // other way and the breathing room has to follow it (the repo's RTL audit
  // catches exactly this).
  /**
   * Pinned to the END — the side today is on.
   *
   * When the grid is narrower than the space it has (a new install, a wide
   * phone, an iPad), the columns used to sit at the start, so the record
   * hugged the left edge with a gap after it and today floated in the
   * middle of nowhere. Pinned to the end, today is always at the edge you
   * scroll away from and the visible width is filled with as much past as
   * there is. `flex-end` follows the writing direction, so RTL gets the
   * mirror of this rather than a special case.
   */
  scrollBody: { paddingEnd: 2, flexGrow: 1, justifyContent: 'flex-end' },
  weeks: { gap: GAP },
  week: { flexDirection: 'row', gap: GAP },
  square: { width: SQUARE, height: SQUARE, borderRadius: 3.5 },
  squareSelected: { transform: [{ scale: 1.4 }], zIndex: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  legendSquares: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendSquare: { width: 11, height: 11, borderRadius: 2.5 },
  legendText: { fontSize: 10.5, fontWeight: '600' },
  caption: { fontSize: 12, marginTop: 8 },
});
